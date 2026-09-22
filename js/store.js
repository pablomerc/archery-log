/* store.js — data model, persistence, import/export, share links.
   No dependencies. All data lives in this browser unless you export it. */
(function (global) {
  'use strict';

  var KEY = 'archery-tracker:v1';
  var SCHEMA = 1;

  /* ---------- date helpers (local time, never UTC-shifted) ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) {
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
  // Monday-start week key
  function weekStart(d) {
    var x = new Date(d.getTime());
    var dow = (x.getDay() + 6) % 7; // 0 = Monday
    return addDays(x, -dow);
  }
  function fmtShort(s) {
    var d = parseISO(s);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function fmtLong(s) {
    var d = parseISO(s);
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function dowName(n) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][n]; }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- defaults ---------- */
  function defaults() {
    return {
      schema: SCHEMA,
      settings: {
        archer: '',
        bow: 'recurve',              // recurve | compound | barebow | traditional
        practiceDays: [1, 4, 6],     // Mon / Thu / Sat
        sessionMinutes: 120,
        baseArrows: 55,              // current arrows per session
        defaultSetSize: 4,
        defaultDistance: 18,
        units: 'm',
        rampPerWeek: 0.08,
        /* Season-level planning: the plan works in weekly totals and these are
           the limits it must never exceed. */
        seasonName: '',
        seasonEnd: '',
        maxPerSession: 100,
        maxDays: 3,
        maxWeekly: 300,
        theme: 'auto'
      },
      sessions: [],
      competitions: [],
      gear: {
        strings: [],                 // {id, name, installedAt (lifetime arrow count), retired}
        sightMarks: [],              // {id, distance, mark, note}
        notes: ''
      },
      planOverrides: {},             // { 'YYYY-MM-DD': arrows }  manual tweaks to generated plan
      /* Deletions have to be remembered, not just applied: without a tombstone
         a row deleted here comes back from the other device on the next sync. */
      deleted: { sessions: {}, competitions: {} },
      meta: { created: iso(today()), lastSaved: null, settingsUpdated: null }
    };
  }

  /* ---------- state ---------- */
  var state = defaults();
  var listeners = [];

  function migrate(raw) {
    var base = defaults();
    if (!raw || typeof raw !== 'object') return base;
    // shallow-merge with defaults so new fields appear for old saves
    var out = base;
    out.schema = SCHEMA;
    if (raw.settings) for (var k in base.settings) if (raw.settings[k] !== undefined) out.settings[k] = raw.settings[k];
    out.sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
    out.competitions = Array.isArray(raw.competitions) ? raw.competitions : [];
    if (raw.gear) {
      out.gear.strings = Array.isArray(raw.gear.strings) ? raw.gear.strings : [];
      out.gear.sightMarks = Array.isArray(raw.gear.sightMarks) ? raw.gear.sightMarks : [];
      out.gear.notes = raw.gear.notes || '';
    }
    out.planOverrides = raw.planOverrides && typeof raw.planOverrides === 'object' ? raw.planOverrides : {};
    if (raw.deleted) {
      out.deleted.sessions = raw.deleted.sessions || {};
      out.deleted.competitions = raw.deleted.competitions || {};
    }
    if (raw.meta) {
      out.meta.created = raw.meta.created || out.meta.created;
      out.meta.settingsUpdated = raw.meta.settingsUpdated || null;
    }
    // Records saved before sync existed have no clock; treat creation as the edit time.
    out.sessions.forEach(function (x) { if (!x.updated) x.updated = x.created || new Date(0).toISOString(); });
    out.competitions.forEach(function (x) { if (!x.updated) x.updated = new Date(0).toISOString(); });
    return out;
  }

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      state = migrate(raw ? JSON.parse(raw) : null);
    } catch (e) {
      console.warn('Could not read saved data, starting fresh.', e);
      state = defaults();
    }
    return state;
  }

  function save() {
    state.meta.lastSaved = new Date().toISOString();
    try {
      global.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Save failed', e);
      alert('Could not save — your browser storage may be full or blocked (private window?). Export a backup from Settings.');
    }
    emit();
  }

  function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } }); }
  function subscribe(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }
  function get() { return state; }

  /* ---------- scorecards ----------
     A card is arrow-by-arrow scoring for one round: ends of N arrows, each
     arrow one of 'X', '10' … '1', 'M'. An end may carry an explicit X count
     (xs) for cards copied off paper where the archer tallied X's separately. */
  var ARROW_VALUES = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M'];

  function arrowValue(v) {
    if (v === 'X') return 10;
    if (v === 'M' || v == null || v === '') return 0;
    var n = parseInt(v, 10);
    return isNaN(n) ? 0 : Math.max(0, Math.min(10, n));
  }

  function normaliseCard(c) {
    if (!c || !Array.isArray(c.ends)) return null;
    var per = Math.max(1, Math.round(+c.arrowsPerEnd || (c.ends[0] && c.ends[0].a ? c.ends[0].a.length : 3)));
    var ends = c.ends.map(function (e) {
      var a = Array.isArray(e.a) ? e.a.slice(0, per) : [];
      while (a.length < per) a.push('');
      a = a.map(function (v) { return v == null ? '' : String(v).toUpperCase(); });
      return { a: a, xs: (e.xs != null && e.xs !== '') ? Math.max(0, Math.round(+e.xs)) : null };
    });
    return {
      arrowsPerEnd: per,
      ends: ends,
      round: c.round || '',
      distance: c.distance ? +c.distance : null,
      face: c.face || ''
    };
  }

  function cardTotals(card) {
    var ends = (card && card.ends) || [];
    var per = (card && card.arrowsPerEnd) || 3;
    var run = 0, xs = 0, tens = 0, shot = 0, rows = [];
    ends.forEach(function (e, i) {
      var a = e.a || [];
      var t = a.reduce(function (n, v) { return n + arrowValue(v); }, 0);
      var filled = a.filter(function (v) { return v != null && v !== ''; }).length;
      var ex = e.xs != null ? e.xs : a.filter(function (v) { return v === 'X'; }).length;
      run += t; xs += ex; shot += filled;
      tens += a.filter(function (v) { return v === 'X' || v === '10'; }).length;
      rows.push({ i: i, a: a, total: t, xs: ex, run: run, filled: filled, complete: filled === per });
    });
    var outOf = ends.length * per * 10;
    return {
      rows: rows, score: run, xs: xs, tens: tens, outOf: outOf, shot: shot, per: per,
      ends: ends.length,
      avg: shot ? run / shot : 0,
      best: rows.reduce(function (m, r) { return Math.max(m, r.total); }, 0),
      complete: shot === ends.length * per
    };
  }

  function roundLabel(card) {
    if (card.round) return card.round;
    return card.ends.length + ' ends \u00d7 ' + card.arrowsPerEnd;
  }

  /* ---------- sessions ---------- */
  function normaliseSession(s) {
    var card = normaliseCard(s.card);
    var score = (s.score && s.score.total != null)
      ? { total: +s.score.total, outOf: s.score.outOf ? +s.score.outOf : null, round: s.score.round || '', xs: s.score.xs != null ? +s.score.xs : null }
      : null;
    if (card) {
      // The card is the source of truth; the summary is derived from it.
      var t = cardTotals(card);
      score = { total: t.score, outOf: t.outOf, round: roundLabel(card), xs: t.xs };
    }
    return {
      id: s.id || uid(),
      date: s.date,
      arrows: Math.max(0, Math.round(+s.arrows || 0)),
      setSize: s.setSize ? Math.round(+s.setSize) : null,
      minutes: s.minutes ? Math.round(+s.minutes) : null,
      distance: s.distance ? +s.distance : null,
      type: s.type || 'volume',
      rpe: s.rpe ? Math.min(5, Math.max(1, Math.round(+s.rpe))) : null,
      score: score,
      card: card,
      notes: s.notes || '',
      created: s.created || new Date().toISOString(),
      updated: s.updated || new Date().toISOString()
    };
  }

  function addSession(s) {
    var rec = normaliseSession(Object.assign({}, s, { updated: new Date().toISOString() }));
    state.sessions.push(rec);
    sortSessions();
    save();
    return rec;
  }

  function updateSession(id, patch) {
    var i = state.sessions.findIndex(function (s) { return s.id === id; });
    if (i < 0) return null;
    var merged = Object.assign({}, state.sessions[i], patch, { id: id, updated: new Date().toISOString() });
    state.sessions[i] = normaliseSession(merged);
    sortSessions();
    save();
    return state.sessions[i];
  }

  function removeSession(id) {
    state.sessions = state.sessions.filter(function (s) { return s.id !== id; });
    state.deleted.sessions[id] = new Date().toISOString();
    save();
  }

  function sortSessions() {
    state.sessions.sort(function (a, b) {
      if (a.date === b.date) return (a.created || '').localeCompare(b.created || '');
      return a.date < b.date ? -1 : 1;
    });
  }

  function sessionsOn(dateISO) {
    return state.sessions.filter(function (s) { return s.date === dateISO; });
  }

  function arrowsOn(dateISO) {
    return sessionsOn(dateISO).reduce(function (n, s) { return n + s.arrows; }, 0);
  }

  /* ---------- competitions ---------- */
  function addCompetition(c) {
    var rec = {
      id: c.id || uid(),
      date: c.date,
      name: c.name || 'Competition',
      location: c.location || '',
      round: c.round || '',
      distance: c.distance ? +c.distance : null,
      notes: c.notes || '',
      /* 'A' events get a taper before and a recovery week after; 'B' events are
         shot through without reshaping the block around them. */
      priority: c.priority === 'B' ? 'B' : 'A',
      arrows: c.arrows ? +c.arrows : null,
      url: c.url || '',
      confirmed: c.confirmed !== false,
      result: c.result || null,      // {score, outOf, place, fieldSize}
      checklist: c.checklist || null,
      updated: new Date().toISOString()
    };
    state.competitions.push(rec);
    state.competitions.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    save();
    return rec;
  }

  function updateCompetition(id, patch) {
    var i = state.competitions.findIndex(function (c) { return c.id === id; });
    if (i < 0) return null;
    state.competitions[i] = Object.assign({}, state.competitions[i], patch, { id: id, updated: new Date().toISOString() });
    state.competitions.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    save();
    return state.competitions[i];
  }

  function removeCompetition(id) {
    state.competitions = state.competitions.filter(function (c) { return c.id !== id; });
    state.deleted.competitions[id] = new Date().toISOString();
    save();
  }

  function nextCompetition(fromISO) {
    var from = fromISO || iso(today());
    return state.competitions.filter(function (c) { return c.date >= from; })[0] || null;
  }

  /* ---------- derived stats ---------- */
  function lifetimeArrows() {
    return state.sessions.reduce(function (n, s) { return n + s.arrows; }, 0);
  }

  function arrowsBetween(fromISO, toISO) {
    return state.sessions.reduce(function (n, s) {
      return (s.date >= fromISO && s.date <= toISO) ? n + s.arrows : n;
    }, 0);
  }

  // Dense daily series, oldest → newest, inclusive.
  function dailySeries(fromISO, toISO) {
    var out = [], d = parseISO(fromISO), end = parseISO(toISO);
    var byDate = {};
    state.sessions.forEach(function (s) { byDate[s.date] = (byDate[s.date] || 0) + s.arrows; });
    while (d <= end) {
      var k = iso(d);
      out.push({ date: k, arrows: byDate[k] || 0 });
      d = addDays(d, 1);
    }
    return out;
  }

  function weeklySeries(nWeeks) {
    var ws = weekStart(today());
    var out = [];
    for (var i = nWeeks - 1; i >= 0; i--) {
      var start = addDays(ws, -7 * i);
      var end = addDays(start, 6);
      out.push({
        start: iso(start),
        end: iso(end),
        label: fmtShort(iso(start)),
        arrows: arrowsBetween(iso(start), iso(end)),
        sessions: state.sessions.filter(function (s) { return s.date >= iso(start) && s.date <= iso(end); }).length
      });
    }
    return out;
  }

  // Acute:chronic workload ratio — sports-science overuse flag.
  // acute = last 7 days, chronic = average 7-day load over the last 28.
  function loadRatio() {
    var t = iso(today());
    var acute = arrowsBetween(iso(addDays(today(), -6)), t);
    var chronic28 = arrowsBetween(iso(addDays(today(), -27)), t);
    var chronic = chronic28 / 4;
    if (chronic < 1) return { acute: acute, chronic: Math.round(chronic), ratio: null, verdict: 'not enough history yet' };
    var r = acute / chronic;
    var verdict = r < 0.8 ? 'detraining — you are shooting less than usual'
      : r <= 1.3 ? 'sweet spot'
        : r <= 1.5 ? 'ramping fast — watch your shoulder'
          : 'spike — high overuse risk';
    return { acute: acute, chronic: Math.round(chronic), ratio: r, verdict: verdict };
  }

  // Consecutive weeks in which at least one session was logged.
  function streakWeeks() {
    var ws = weekStart(today()), n = 0;
    for (var i = 0; i < 260; i++) {
      var start = addDays(ws, -7 * i), end = addDays(start, 6);
      var has = arrowsBetween(iso(start), iso(end)) > 0;
      if (i === 0 && !has) continue;      // current week may not have happened yet
      if (!has) break;
      n++;
    }
    return n;
  }

  function personalBests() {
    var scored = state.sessions.filter(function (s) { return s.score && s.score.total != null; });
    var byRound = {};
    scored.forEach(function (s) {
      var key = (s.score.round || 'Unnamed round') + (s.distance ? ' @' + s.distance + 'm' : '');
      if (!byRound[key] || s.score.total > byRound[key].score.total) byRound[key] = s;
    });
    return Object.keys(byRound).map(function (k) { return { round: k, session: byRound[k] }; });
  }

  function scorecards() {
    return state.sessions.filter(function (s) { return !!s.card; });
  }

  function scoresCSV() {
    var head = ['date', 'round', 'distance', 'end', 'arrows', 'end_total', 'end_xs', 'running_total', 'session_score', 'session_out_of'];
    var rows = [];
    scorecards().forEach(function (s) {
      var t = cardTotals(s.card);
      t.rows.forEach(function (r) {
        rows.push([s.date, '"' + roundLabel(s.card).replace(/"/g, '""') + '"', s.card.distance || s.distance || '',
          r.i + 1, '"' + r.a.join(' ') + '"', r.total, r.xs, r.run, t.score, t.outOf].join(','));
      });
    });
    return [head.join(',')].concat(rows).join('\n');
  }

  /* ---------- gear ---------- */
  function activeString() {
    var live = state.gear.strings.filter(function (s) { return !s.retired; });
    return live.length ? live[live.length - 1] : null;
  }
  function stringArrows() {
    var s = activeString();
    if (!s) return null;
    return Math.max(0, lifetimeArrows() - (s.installedAt || 0));
  }
  function addString(name) {
    state.gear.strings.forEach(function (s) { s.retired = s.retired || iso(today()); });
    var rec = { id: uid(), name: name || 'String ' + (state.gear.strings.length + 1), installedAt: lifetimeArrows(), installedOn: iso(today()), retired: null };
    state.gear.strings.push(rec);
    touchSettings();
    save();
    return rec;
  }
  function setSightMark(distance, mark, note) {
    var i = state.gear.sightMarks.findIndex(function (m) { return +m.distance === +distance; });
    if (i >= 0) { state.gear.sightMarks[i].mark = mark; state.gear.sightMarks[i].note = note || ''; }
    else state.gear.sightMarks.push({ id: uid(), distance: +distance, mark: mark, note: note || '' });
    state.gear.sightMarks.sort(function (a, b) { return a.distance - b.distance; });
    touchSettings();
    save();
  }
  function removeSightMark(id) {
    state.gear.sightMarks = state.gear.sightMarks.filter(function (m) { return m.id !== id; });
    touchSettings();
    save();
  }

  /* ---------- settings ---------- */
  function touchSettings() { state.meta.settingsUpdated = new Date().toISOString(); }

  function setSettings(patch) {
    Object.assign(state.settings, patch);
    touchSettings();
    save();
  }

  /* ---------- import / export / share ---------- */
  function exportJSON() { return JSON.stringify(state, null, 2); }

  function importJSON(text, mode) {
    var incoming = JSON.parse(text);
    var clean = migrate(incoming);
    if (mode === 'merge') {
      var seen = {};
      state.sessions.forEach(function (s) { seen[s.id] = true; });
      clean.sessions.forEach(function (s) { if (!seen[s.id]) state.sessions.push(normaliseSession(s)); });
      var cseen = {};
      state.competitions.forEach(function (c) { cseen[c.id] = true; });
      clean.competitions.forEach(function (c) { if (!cseen[c.id]) state.competitions.push(c); });
      sortSessions();
      state.competitions.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    } else {
      state = clean;
    }
    save();
    return state;
  }

  /* Share links carry a compact snapshot in the URL fragment.
     Fragments are never sent to any server — the link is the data. */
  function b64urlEncode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // Compact tuple form keeps share URLs short.
  function snapshot() {
    return {
      v: 1,
      n: state.settings.archer || '',
      b: state.settings.bow,
      st: state.settings.practiceDays.join('') + '|' + state.settings.sessionMinutes + '|' + state.settings.baseArrows,
      s: state.sessions.map(function (x) {
        return [x.date, x.arrows, x.setSize || 0, x.minutes || 0, x.distance || 0, x.type || '', x.rpe || 0,
        x.score ? x.score.total : 0, x.score && x.score.outOf ? x.score.outOf : 0, x.notes || '', x.card || 0];
      }),
      c: state.competitions.map(function (x) {
        return [x.date, x.name, x.location || '', x.round || '', x.distance || 0,
        x.result ? (x.result.score || 0) : 0, x.result ? (x.result.place || 0) : 0,
        x.priority || 'A', x.arrows || 0, x.confirmed === false ? 0 : 1];
      })
    };
  }

  function fromSnapshot(snap) {
    var out = defaults();
    out.settings.archer = snap.n || '';
    out.settings.bow = snap.b || 'recurve';
    if (snap.st) {
      var parts = String(snap.st).split('|');
      out.settings.practiceDays = parts[0].split('').map(Number);
      out.settings.sessionMinutes = +parts[1] || 120;
      out.settings.baseArrows = +parts[2] || 55;
    }
    out.sessions = (snap.s || []).map(function (a) {
      return normaliseSession({
        date: a[0], arrows: a[1], setSize: a[2] || null, minutes: a[3] || null, distance: a[4] || null,
        type: a[5] || 'volume', rpe: a[6] || null,
        score: a[7] ? { total: a[7], outOf: a[8] || null, round: '' } : null,
        notes: a[9] || '',
        card: a[10] || null
      });
    });
    out.competitions = (snap.c || []).map(function (a) {
      return {
        id: uid(), date: a[0], name: a[1], location: a[2], round: a[3], distance: a[4] || null,
        notes: '', result: a[5] ? { score: a[5], place: a[6] || null } : null, checklist: null,
        priority: a[7] || 'A', arrows: a[8] || null, confirmed: a[9] !== 0
      };
    });
    return out;
  }

  function shareURL() {
    var base = global.location.origin + global.location.pathname;
    return base + '#share=' + b64urlEncode(JSON.stringify(snapshot()));
  }

  function readShareFragment() {
    var h = global.location.hash || '';
    var m = h.match(/#share=([A-Za-z0-9\-_]+)/);
    if (!m) return null;
    try {
      return fromSnapshot(JSON.parse(b64urlDecode(m[1])));
    } catch (e) {
      console.warn('Bad share link', e);
      return null;
    }
  }

  function adoptState(s) { state = s; emit(); }   // view a shared snapshot without saving
  function commitAdopted() { save(); }            // ...then keep it

  /* ---------- merging two devices' copies ----------
     Rules, in order:
       - a record edited more recently wins (per record, not per file)
       - a record deleted more recently than it was edited stays deleted
       - a record edited more recently than it was deleted comes back
       - settings, gear and plan overrides move as one block, newest wins
     Tombstones are pruned after a year; by then every device has seen them. */
  function mergeStates(local, remote) {
    var out = JSON.parse(JSON.stringify(local));
    if (!remote || typeof remote !== 'object') return out;

    ['sessions', 'competitions'].forEach(function (kind) {
      var ld = out.deleted[kind] || {};
      var rd = (remote.deleted && remote.deleted[kind]) || {};
      Object.keys(rd).forEach(function (id) {
        if (!ld[id] || rd[id] > ld[id]) ld[id] = rd[id];
      });
      out.deleted[kind] = ld;

      var byId = {};
      (local[kind] || []).forEach(function (r) { byId[r.id] = r; });
      (remote[kind] || []).forEach(function (r) {
        var cur = byId[r.id];
        if (!cur || (r.updated || '') > (cur.updated || '')) byId[r.id] = r;
      });

      out[kind] = Object.keys(byId)
        .filter(function (id) {
          var killedAt = ld[id];
          return !killedAt || (byId[id].updated || '') > killedAt;
        })
        .map(function (id) { return byId[id]; });
    });

    out.sessions = out.sessions.map(normaliseSession);
    out.sessions.sort(function (a, b) {
      if (a.date === b.date) return (a.created || '').localeCompare(b.created || '');
      return a.date < b.date ? -1 : 1;
    });
    out.competitions.sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    var localClock = (local.meta && local.meta.settingsUpdated) || '';
    var remoteClock = (remote.meta && remote.meta.settingsUpdated) || '';
    if (remoteClock > localClock) {
      out.settings = Object.assign(defaults().settings, remote.settings || {});
      out.gear = remote.gear || out.gear;
      out.planOverrides = remote.planOverrides || out.planOverrides;
      out.meta.settingsUpdated = remoteClock;
    }

    var cutoff = new Date(Date.now() - 365 * 86400000).toISOString();
    ['sessions', 'competitions'].forEach(function (kind) {
      Object.keys(out.deleted[kind]).forEach(function (id) {
        if (out.deleted[kind][id] < cutoff) delete out.deleted[kind][id];
      });
    });

    if (remote.meta && remote.meta.created && remote.meta.created < out.meta.created) {
      out.meta.created = remote.meta.created;
    }
    return out;
  }

  /* Replace local state with the merged result. Returns true if anything moved,
     so the caller knows whether a re-render or a push is needed. */
  function applyMerge(remote) {
    var before = JSON.stringify([state.sessions, state.competitions, state.settings, state.gear, state.planOverrides, state.deleted]);
    var merged = mergeStates(state, remote);
    var after = JSON.stringify([merged.sessions, merged.competitions, merged.settings, merged.gear, merged.planOverrides, merged.deleted]);
    state = merged;
    if (before !== after) { save(); return true; }
    return false;
  }

  function toCSV() {
    var head = ['date', 'arrows', 'set_size', 'minutes', 'distance', 'type', 'rpe', 'score', 'score_out_of', 'xs', 'notes'];
    var rows = state.sessions.map(function (s) {
      return [s.date, s.arrows, s.setSize || '', s.minutes || '', s.distance || '', s.type, s.rpe || '',
      s.score ? s.score.total : '', s.score && s.score.outOf ? s.score.outOf : '', s.score && s.score.xs != null ? s.score.xs : '',
      '"' + String(s.notes || '').replace(/"/g, '""') + '"'].join(',');
    });
    return [head.join(',')].concat(rows).join('\n');
  }

  global.Store = {
    KEY: KEY, load: load, save: save, get: get, subscribe: subscribe, defaults: defaults,
    addSession: addSession, updateSession: updateSession, removeSession: removeSession,
    sessionsOn: sessionsOn, arrowsOn: arrowsOn,
    addCompetition: addCompetition, updateCompetition: updateCompetition,
    removeCompetition: removeCompetition, nextCompetition: nextCompetition,
    lifetimeArrows: lifetimeArrows, arrowsBetween: arrowsBetween, dailySeries: dailySeries,
    weeklySeries: weeklySeries, loadRatio: loadRatio, streakWeeks: streakWeeks, personalBests: personalBests,
    scorecards: scorecards, cardTotals: cardTotals, normaliseCard: normaliseCard, arrowValue: arrowValue,
    roundLabel: roundLabel, ARROW_VALUES: ARROW_VALUES, scoresCSV: scoresCSV,
    activeString: activeString, stringArrows: stringArrows, addString: addString,
    setSightMark: setSightMark, removeSightMark: removeSightMark,
    setSettings: setSettings,
    exportJSON: exportJSON, importJSON: importJSON, toCSV: toCSV, fromPayload: migrate,
    mergeStates: mergeStates, applyMerge: applyMerge, touchSettings: touchSettings,
    shareURL: shareURL, readShareFragment: readShareFragment, adoptState: adoptState, commitAdopted: commitAdopted,
    uid: uid,
    date: {
      iso: iso, parseISO: parseISO, today: today, addDays: addDays, daysBetween: daysBetween,
      weekStart: weekStart, fmtShort: fmtShort, fmtLong: fmtLong, dowName: dowName, pad: pad
    }
  };
})(window);
