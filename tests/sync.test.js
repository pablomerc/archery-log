// Simulates two devices syncing through a fake GitHub Contents API,
// including a write race where both push between each other's reads.
global.window = global;
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder;
global.btoa = s => Buffer.from(s, 'binary').toString('base64');
global.atob = s => Buffer.from(s, 'base64').toString('binary');
const net = { onLine: true };
Object.defineProperty(global, 'navigator', { value: net, writable: true, configurable: true });

// ---- fake GitHub ----
const repo = { content: null, sha: null, writes: 0, conflicts: 0 };
function newSha(){ return 'sha' + (++repo.writes); }
global.fetch = async (url, opts={}) => {
  opts.headers = opts.headers || {};
  if (url.startsWith('https://api.github.com/repos/') && url.includes('/contents/')) {
    if (!opts.method || opts.method === 'GET') {
      if (repo.content === null) return { ok:false, status:404, text:async()=>'nf' };
      const snap = { content: Buffer.from(repo.content).toString('base64'), sha: repo.sha, size: repo.content.length };
      if (repo.interlope) { repo.interlope(); repo.interlope = null; }   // someone writes right after our read
      return { ok:true, status:200, json: async()=>snap };
    }
    if (opts.method === 'PUT') {
      const body = JSON.parse(opts.body);
      if ((body.sha||null) !== repo.sha) { repo.conflicts++; return { ok:false, status:409, text:async()=>'conflict' }; }
      repo.content = Buffer.from(body.content, 'base64').toString('utf8');
      repo.sha = newSha();
      return { ok:true, status:200, json: async()=>({ content:{ sha: repo.sha } }) };
    }
  }
  throw new Error('unexpected fetch ' + url);
};

// ---- a device = its own localStorage + freshly loaded modules ----
function makeDevice(name){
  const mem = {};
  const sandbox = {};
  global.localStorage = { getItem:k=>mem[k]??null, setItem:(k,v)=>mem[k]=v, removeItem:k=>delete mem[k] };
  global.location = { hostname:'pablo.github.io', pathname:'/archery-log/' };
  delete require.cache[require.resolve(__dirname + '/../js/store.js')];
  delete require.cache[require.resolve(__dirname + '/../js/sync.js')];
  require(__dirname + '/../js/store.js');
  require(__dirname + '/../js/sync.js');
  const Store = global.Store, Sync = global.Sync;
  Store.load(); Sync.init();
  Sync.saveConfig({ owner:'pablo', repo:'archery-log', branch:'main', token:'tok', enabled:true });
  return { name, mem, Store, Sync,
    activate(){ global.localStorage = { getItem:k=>mem[k]??null, setItem:(k,v)=>mem[k]=v, removeItem:k=>delete mem[k] };
                global.Store = Store; global.Sync = Sync; } };
}

let pass=0, fail=0;
const check=(n,g,w)=>{ const ok=JSON.stringify(g)===JSON.stringify(w);
  console.log((ok?'  PASS  ':'  FAIL  ')+n); if(!ok){console.log('     got :',JSON.stringify(g));console.log('     want:',JSON.stringify(w));fail++;}else pass++; };

(async () => {
  console.log('\n— device A logs and pushes to an empty repo —');
  const A = makeDevice('A'); A.activate();
  A.Store.addSession({ date:'2026-09-19', arrows:65, setSize:4 });
  let r = await A.Sync.sync({push:true});
  if (!r.pushed) console.log('    DEBUG result:', JSON.stringify(r));
  check('A pushed', r.pushed, true);
  check('repo now has 1 session', JSON.parse(repo.content).sessions.length, 1);

  console.log('\n— device B pulls it —');
  const B = makeDevice('B'); B.activate();
  r = await B.Sync.sync();
  check('B received A’s session', B.Store.get().sessions.map(s=>s.arrows), [65]);

  console.log('\n— both log offline, then both push (write race) —');
  A.activate(); A.Store.addSession({ date:'2026-09-21', arrows:60, setSize:4 });
  B.activate(); B.Store.addSession({ date:'2026-09-24', arrows:68, setSize:4 });
  A.activate(); await A.Sync.sync({push:true});
  B.activate(); const rb = await B.Sync.sync({push:true});
  check('normal pull-then-push needs no conflict', repo.conflicts === 0 && rb.pushed, true);
  check('repo holds all three sessions', JSON.parse(repo.content).sessions.map(s=>s.arrows).sort((x,y)=>x-y), [60,65,68]);

  console.log('\n\u2014 a write landing between our read and our write (real 409) \u2014');
  A.activate();
  A.Store.addSession({ date:'2026-09-28', arrows:44, setSize:4 });
  // C pushes in the gap, invalidating the sha A just read
  repo.interlope = () => {
    const doc = JSON.parse(repo.content);
    doc.sessions.push({ id:'from-c', date:'2026-09-29', arrows:33, setSize:4, type:'volume',
      created:new Date().toISOString(), updated:new Date().toISOString(), notes:'', minutes:null,
      distance:null, rpe:null, score:null });
    repo.content = JSON.stringify(doc); repo.sha = newSha();
  };
  const rc = await A.Sync.sync({push:true});
  check('A recovered from the 409', repo.conflicts > 0 && rc.pushed, true);
  const finalArrows = JSON.parse(repo.content).sessions.map(s=>s.arrows).sort((x,y)=>x-y);
  check('nothing was lost in the race', finalArrows, [33,44,60,65,68]);

  console.log('\n— A pulls again and converges —');
  A.activate(); await A.Sync.sync();
  check('A converged with everything', A.Store.get().sessions.map(s=>s.arrows).sort((x,y)=>x-y), [33,44,60,65,68]);

  console.log('\n— delete on A propagates to B —');
  A.activate();
  A.activate(); await A.Sync.sync();
  const victim = A.Store.get().sessions.find(s=>s.arrows===60);
  A.Store.removeSession(victim.id);
  await A.Sync.sync({push:true});
  B.activate(); await B.Sync.sync();
  check('B no longer has the deleted session', B.Store.get().sessions.map(s=>s.arrows).sort((x,y)=>x-y), [33,44,65,68]);
  check('deletion did not resurrect on A', (A.activate(), A.Store.get().sessions.length), 4);

  console.log('\n— settings change propagates —');
  B.activate(); B.Store.setSettings({ baseArrows: 72 }); await B.Sync.sync({push:true});
  A.activate(); await A.Sync.sync();
  check('A picked up baseArrows', A.Store.get().settings.baseArrows, 72);

  console.log('\n— offline is handled, not lost —');
  A.activate(); net.onLine = false;
  A.Store.addSession({ date:'2026-09-26', arrows:56, setSize:4 });
  r = await A.Sync.sync({push:true});
  check('offline sync refuses cleanly', r.reason, 'offline');
  check('marked dirty for later', A.Sync.state().dirty, true);
  net.onLine = true;
  r = await A.Sync.sync({push:true});
  check('flushes once back online', r.pushed, true);
  B.activate(); await B.Sync.sync();
  check('B sees the queued session', B.Store.get().sessions.map(s=>s.arrows).sort((x,y)=>x-y), [33,44,56,65,68]);

  console.log('\n— the token is never written to the repo —');
  check('no token in published file', /tok/.test(repo.content), false);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
