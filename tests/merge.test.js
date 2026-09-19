global.window = global;
let store = {};
global.localStorage = { getItem:k=>store[k]??null, setItem:(k,v)=>store[k]=v, removeItem:k=>delete store[k] };
require(__dirname + '/../js/store.js');

const T = (n)=>new Date(2026,8,19,12,n).toISOString();
const base = () => ({ ...Store.defaults() });
function st(sessions, deleted={}, settingsUpdated=null, settings=null){
  const s = base();
  s.sessions = sessions;
  s.deleted = { sessions: deleted, competitions: {} };
  s.meta.settingsUpdated = settingsUpdated;
  if (settings) Object.assign(s.settings, settings);
  return s;
}
const S = (id, arrows, updated, date='2026-09-19') => ({id, date, arrows, updated, created:T(0), type:'volume', setSize:4, minutes:null, distance:null, rpe:null, score:null, notes:''});

let pass=0, fail=0;
function check(name, got, want){
  const ok = JSON.stringify(got)===JSON.stringify(want);
  console.log((ok?'  PASS  ':'  FAIL  ')+name);
  if(!ok){ console.log('     got :', JSON.stringify(got)); console.log('     want:', JSON.stringify(want)); fail++; } else pass++;
}
const ids = m => m.sessions.map(s=>s.id+':'+s.arrows).sort();

console.log('\n— disjoint edits on two devices —');
check('both sets survive',
  ids(Store.mergeStates(st([S('a',60,T(1))]), st([S('b',70,T(2))]))),
  ['a:60','b:70']);

console.log('\n— same record edited on both —');
check('later edit wins (remote newer)',
  ids(Store.mergeStates(st([S('a',60,T(1))]), st([S('a',99,T(5))]))), ['a:99']);
check('later edit wins (local newer)',
  ids(Store.mergeStates(st([S('a',60,T(9))]), st([S('a',99,T(5))]))), ['a:60']);

console.log('\n— deletions —');
check('delete on remote removes it here',
  ids(Store.mergeStates(st([S('a',60,T(1))]), st([], {a:T(4)}))), []);
check('delete here is not undone by a stale remote copy',
  ids(Store.mergeStates(st([], {a:T(4)}), st([S('a',60,T(1))]))), []);
check('edit AFTER a delete resurrects the record',
  ids(Store.mergeStates(st([], {a:T(2)}), st([S('a',77,T(6))]))), ['a:77']);
check('delete AFTER an edit stays deleted',
  ids(Store.mergeStates(st([S('a',77,T(6))]), st([], {a:T(8)}))), []);

console.log('\n— settings block —');
let m = Store.mergeStates(
  st([], {}, T(1), {baseArrows:55}),
  st([], {}, T(9), {baseArrows:80}));
check('newer settings clock wins', m.settings.baseArrows, 80);
m = Store.mergeStates(
  st([], {}, T(9), {baseArrows:55}),
  st([], {}, T(1), {baseArrows:80}));
check('older settings clock loses', m.settings.baseArrows, 55);

console.log('\n— convergence: merge order must not matter —');
const A = st([S('a',60,T(1)), S('c',30,T(3))], {x:T(2)});
const B = st([S('b',70,T(2)), S('c',35,T(7))], {a:T(9)});
check('A<-B equals B<-A', ids(Store.mergeStates(A,B)), ids(Store.mergeStates(B,A)));
check('converged result', ids(Store.mergeStates(A,B)), ['b:70','c:35']);

console.log('\n— idempotence —');
const once = Store.mergeStates(A,B);
check('merging twice changes nothing', ids(Store.mergeStates(once,B)), ids(once));

console.log('\n— tombstone pruning —');
const old = new Date(Date.now()-400*86400000).toISOString();
const pruned = Store.mergeStates(st([], {ancient:old}), st([]));
check('year-old tombstone dropped', Object.keys(pruned.deleted.sessions), []);

console.log('\n— empty remote (first ever sync) —');
check('local survives an empty remote', ids(Store.mergeStates(st([S('a',60,T(1))]), st([]))), ['a:60']);
check('null remote is safe', ids(Store.mergeStates(st([S('a',60,T(1))]), null)), ['a:60']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
