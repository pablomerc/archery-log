/* sync.js — keeps the log in a file in your GitHub repo, so every device
   you own reads and writes the same data.

   Reading needs nothing: the file sits in a public repo and is fetched
   straight from raw.githubusercontent.com. Anyone with the link sees the
   live log. Writing needs a fine-grained token, which lives only in this
   browser's localStorage and is never written into the repo. */
(function (global) {
  'use strict';

  var CFG_KEY = 'archery-tracker:sync';
  var DEFAULT_PATH = 'data/log.json';
  var API = 'https://api.github.com';

  var cfg = null;
  var sha = null;            // blob SHA of the copy we last saw, for safe writes
  var status = 'off';
  var lastError = null;
  var lastSync = null;
  var listeners = [];
  var inFlight = null;
  var dirty = false;         // local changes not yet pushed

  /* ---------- config ---------- */

  /* A project page lives at https://USER.github.io/REPO/ , a user page at
     https://USER.github.io/ . Either way the repo can be read off the URL,
     so there is nothing to configure on a normal deployment. */
  function detectRepo() {
    var m = String(global.location.hostname).match(/^([A-Za-z0-9-]+)\.github\.io$/i);
    if (!m) return null;
    var owner = m[1];
    var seg = global.location.pathname.split('/').filter(Boolean)[0];
    return { owner: owner, repo: seg || (owner + '.github.io') };
  }

  function loadConfig() {
    var saved = {};
    try { saved = JSON.parse(global.localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { saved = {}; }
    var auto = detectRepo();
    cfg = {
      owner: saved.owner || (auto && auto.owner) || '',
      repo: saved.repo || (auto && auto.repo) || '',
      branch: saved.branch || 'main',
      path: saved.path || DEFAULT_PATH,
      token: saved.token || '',
      enabled: saved.enabled !== false,
      autodetected: !saved.owner && !!auto
    };
    return cfg;
  }

  function saveConfig(patch) {
    Object.assign(cfg, patch || {});
    var toStore = {
      owner: cfg.owner, repo: cfg.repo, branch: cfg.branch,
      path: cfg.path, token: cfg.token, enabled: cfg.enabled
    };
    try { global.localStorage.setItem(CFG_KEY, JSON.stringify(toStore)); }
    catch (e) { console.error('Could not save sync settings', e); }
    sha = null;                 // repo may have changed under us
    setStatus(computeIdle());
    return cfg;
  }

  function forgetToken() {
    saveConfig({ token: '' });
  }

  function config() { return cfg || loadConfig(); }
  function hasRepo() { var c = config(); return !!(c.owner && c.repo && c.enabled); }
  function canWrite() { return hasRepo() && !!config().token; }
  function computeIdle() { return !hasRepo() ? 'off' : canWrite() ? 'idle' : 'readonly'; }

  /* ---------- status ---------- */
  function setStatus(s, err) {
    status = s;
    lastError = err || (s === 'error' ? lastError : null);
    listeners.forEach(function (fn) { try { fn(state()); } catch (e) { console.error(e); } });
  }
  function state() {
    return {
      status: status, error: lastError, lastSync: lastSync, dirty: dirty,
      canWrite: canWrite(), hasRepo: hasRepo(), config: config()
    };
  }
  function onChange(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }

  /* ---------- base64 for UTF-8 (GitHub wants standard base64) ---------- */
  function encode(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function decode(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---------- HTTP ---------- */
  function apiHeaders() {
    var h = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (config().token) h['Authorization'] = 'Bearer ' + config().token;
    return h;
  }

  function describeHttpError(res, body) {
    if (res.status === 401) return 'GitHub rejected the token. It may have expired — generate a new one.';
    if (res.status === 403) {
      if (/rate limit/i.test(body || '')) return 'GitHub rate limit reached. Try again in a few minutes.';
      return 'The token does not have permission to write to this repository. It needs Contents: Read and write.';
    }
    if (res.status === 404) return 'Repository or file not found. Check the owner and repository name.';
    if (res.status === 409 || res.status === 422) return 'Someone else changed the file first.';
    return 'GitHub returned ' + res.status + '.';
  }

  /* ---------- pull ---------- */

  /* With a token, read through the API: it is never cached and hands back the
     SHA a write needs. Without one, read the raw file, which any visitor can do. */
  async function fetchRemote() {
    var c = config();
    if (c.token) {
      var url = API + '/repos/' + c.owner + '/' + c.repo + '/contents/' +
        encodeURI(c.path) + '?ref=' + encodeURIComponent(c.branch);
      var res = await fetch(url, { headers: apiHeaders(), cache: 'no-store' });
      if (res.status === 404) { sha = null; return null; }        // not created yet
      if (!res.ok) throw new Error(describeHttpError(res, await res.text()));
      var json = await res.json();
      sha = json.sha;
      if (!json.content && json.size > 0) {
        throw new Error('The log file is too large for this sync method (over 1 MB).');
      }
      return json.content ? JSON.parse(decode(json.content)) : null;
    }
    var raw = 'https://raw.githubusercontent.com/' + c.owner + '/' + c.repo + '/' +
      c.branch + '/' + encodeURI(c.path) + '?t=' + Date.now();
    var r2 = await fetch(raw, { cache: 'no-store' });
    if (r2.status === 404) return null;
    if (!r2.ok) throw new Error('Could not read the log from GitHub (' + r2.status + ').');
    return await r2.json();
  }

  /* ---------- push ---------- */
  async function putRemote(payload, message) {
    var c = config();
    var url = API + '/repos/' + c.owner + '/' + c.repo + '/contents/' + encodeURI(c.path);
    var body = {
      message: message,
      content: encode(JSON.stringify(payload, null, 2)),
      branch: c.branch
    };
    if (sha) body.sha = sha;
    var res = await fetch(url, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, apiHeaders()),
      body: JSON.stringify(body)
    });
    if (res.status === 409 || res.status === 422) { sha = null; return false; }   // retry
    if (!res.ok) throw new Error(describeHttpError(res, await res.text()));
    var json = await res.json();
    sha = json.content && json.content.sha;
    return true;
  }

  function commitMessage(st) {
    var n = st.sessions.length;
    var latest = st.sessions[st.sessions.length - 1];
    if (latest) return 'Log: ' + latest.arrows + ' arrows on ' + latest.date + ' (' + n + ' sessions)';
    return 'Update archery log (' + n + ' sessions)';
  }

  /* What actually gets written. The token is deliberately not part of it. */
  function payloadFrom(st) {
    return {
      schema: st.schema, settings: st.settings, sessions: st.sessions,
      competitions: st.competitions, gear: st.gear, planOverrides: st.planOverrides,
      deleted: st.deleted, meta: st.meta
    };
  }

  /* ---------- the one entry point ---------- */

  /**
   * sync({push}) — pull, merge, and push back if we may write.
   * Safe to call often; overlapping calls share one round trip.
   */
  function sync(opts) {
    opts = opts || {};
    if (!hasRepo()) { setStatus('off'); return Promise.resolve({ ok: false, reason: 'not configured' }); }
    if (inFlight) return inFlight;
    if (!global.navigator.onLine) {
      dirty = dirty || !!opts.push;
      setStatus('offline');
      return Promise.resolve({ ok: false, reason: 'offline' });
    }

    inFlight = (async function () {
      setStatus('syncing');
      try {
        var remote = await fetchRemote();
        var changed = Store.applyMerge(remote);

        if (!canWrite()) {
          lastSync = new Date().toISOString();
          setStatus('readonly');
          return { ok: true, changed: changed, pushed: false };
        }

        var needsPush = opts.push || dirty || changed || remote === null;
        if (!needsPush) {
          lastSync = new Date().toISOString();
          setStatus('idle');
          return { ok: true, changed: changed, pushed: false };
        }

        var st = Store.get();
        var ok = await putRemote(payloadFrom(st), commitMessage(st));
        if (!ok) {
          // Someone wrote between our read and our write. Re-read, re-merge, try once more.
          var again = await fetchRemote();
          Store.applyMerge(again);
          st = Store.get();
          ok = await putRemote(payloadFrom(st), commitMessage(st));
          if (!ok) throw new Error('Could not write — the file kept changing. Try again in a moment.');
        }
        dirty = false;
        lastSync = new Date().toISOString();
        setStatus('idle');
        return { ok: true, changed: changed, pushed: true };
      } catch (e) {
        dirty = dirty || !!opts.push;
        lastError = e.message || String(e);
        setStatus('error', lastError);
        console.warn('Sync failed:', lastError);
        return { ok: false, error: lastError };
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function markDirty() { dirty = true; }

  /* Confirms a token works and can actually write, before the user trusts it. */
  async function testConnection() {
    var c = config();
    if (!c.owner || !c.repo) return { ok: false, message: 'Set the owner and repository first.' };
    try {
      var res = await fetch(API + '/repos/' + c.owner + '/' + c.repo, { headers: apiHeaders(), cache: 'no-store' });
      if (!res.ok) return { ok: false, message: describeHttpError(res, await res.text()) };
      var repo = await res.json();
      if (!c.token) return { ok: true, message: 'Found ' + repo.full_name + '. Reading works; add a token to save from this device.', write: false };
      var perms = repo.permissions || {};
      if (!perms.push) return { ok: false, message: 'Token reached ' + repo.full_name + ' but cannot write to it. Give it Contents: Read and write.' };
      return { ok: true, message: 'Connected to ' + repo.full_name + '. This device can read and save.', write: true };
    } catch (e) {
      return { ok: false, message: 'Could not reach GitHub: ' + (e.message || e) };
    }
  }

  function init() {
    loadConfig();
    setStatus(computeIdle());
    return state();
  }

  /* Read the remote copy without touching anything locally. Used for the
     read-only view someone gets when they open the link without a token. */
  function peek() {
    if (!hasRepo()) return Promise.resolve(null);
    return fetchRemote();
  }

  global.Sync = {
    init: init, sync: sync, peek: peek, config: config, saveConfig: saveConfig, forgetToken: forgetToken,
    testConnection: testConnection, onChange: onChange, state: state, markDirty: markDirty,
    detectRepo: detectRepo, hasRepo: hasRepo, canWrite: canWrite, DEFAULT_PATH: DEFAULT_PATH
  };
})(window);
