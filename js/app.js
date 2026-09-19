/* app.js — wiring: routing, dialogs, plan rebuild, share-link handling. */
(function (global) {
  'use strict';

  var U = global.ViewUtil, h = U.h, clear = U.clear;
  var D = Store.date;
  global.__wireDate(D);
  global.__wireDate2(D);

  var current = 'dash';
  var viewingShared = false;

  var ctx = {
    state: null,
    plan: null,
    pending: null,
    go: go,
    render: render,
    toast: toast,
    editSession: editSession,
    addCompetition: addCompetition,
    overrideArrows: overrideArrows,
    dayDetail: dayDetail,
    newString: newString,
    download: download,
    importFile: importFile,
    confirm: confirmDlg,
    syncNow: syncNow,
    syncState: function () { return Sync.state(); }
  };

  /* ---------- plan ---------- */
  function rebuildPlan() {
    var st = Store.get();
    var comp = Store.nextCompetition();
    if (!comp) { ctx.plan = null; return; }
    var todayISO = D.iso(D.today());
    if (comp.date <= todayISO) { ctx.plan = null; return; }
    /* Start from the beginning of this week, not from today, so the current
       week's target covers sessions already shot earlier in the week. */
    ctx.plan = Plan.generate({
      from: D.iso(D.weekStart(D.today())),
      to: comp.date,
      practiceDays: st.settings.practiceDays,
      baseArrows: st.settings.baseArrows,
      sessionMinutes: st.settings.sessionMinutes,
      rampPerWeek: st.settings.rampPerWeek,
      setSize: st.settings.defaultSetSize,
      distance: comp.distance || st.settings.defaultDistance,
      overrides: st.planOverrides
    });
  }

  /* ---------- routing ---------- */
  function go(view, opts) {
    current = view;
    ctx.pending = opts || null;
    document.querySelectorAll('nav.tabs button').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.view === view ? 'true' : 'false');
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('active', v.id === 'view-' + view);
    });
    render();
    global.scrollTo({ top: 0, behavior: 'auto' });
  }

  function render() {
    ctx.state = Store.get();
    rebuildPlan();
    var root = document.getElementById('view-' + current);
    if (!root || !Views[current]) return;
    try {
      Views[current](root, ctx);
    } catch (e) {
      console.error('Render failed for view "' + current + '"', e);
      clear(root).appendChild(h('div', { class: 'banner' }, [
        h('strong', { text: 'Something went wrong drawing this screen.' }),
        h('p', { style: 'margin:6px 0 0;font-size:.85rem', text: String(e && e.message || e) })
      ]));
    }
    var sub = document.getElementById('brandSub');
    if (sub) sub.textContent = ctx.state.settings.archer ? ' · ' + ctx.state.settings.archer : '';
  }

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  /* ---------- dialog helper ---------- */
  function dialog(title, bodyNodes, actions) {
    var dlg = document.getElementById('dlg');
    var body = clear(document.getElementById('dlgBody'));
    body.appendChild(h('div', { class: 'dlg-head' }, [
      h('h2', { text: title }),
      h('button', { class: 'btn ghost sm', 'aria-label': 'Close', onclick: function () { dlg.close(); } }, ['×'])
    ]));
    bodyNodes.forEach(function (n) { body.appendChild(n); });
    body.appendChild(h('div', { class: 'btn-row', style: 'margin-top:14px' }, actions));
    if (!dlg.open) dlg.showModal();
    return dlg;
  }

  function confirmDlg(title, message, onYes) {
    var dlg = document.getElementById('dlg');
    dialog(title, [h('p', { class: 'muted', text: message })], [
      h('button', { class: 'btn danger', onclick: function () { dlg.close(); onYes(); } }, ['Yes, do it']),
      h('button', { class: 'btn ghost', onclick: function () { dlg.close(); } }, ['Cancel'])
    ]);
  }

  /* ---------- session edit ---------- */
  function editSession(s) {
    var dlg = document.getElementById('dlg');
    var dateI = h('input', { type: 'date', value: s.date });
    var arrowsI = h('input', { type: 'number', inputmode: 'numeric', value: s.arrows });
    var setI = h('input', { type: 'number', inputmode: 'numeric', value: s.setSize || '' });
    var minI = h('input', { type: 'number', inputmode: 'numeric', value: s.minutes || '' });
    var distI = h('input', { type: 'number', inputmode: 'numeric', value: s.distance || '' });
    var typeI = h('select', {}, ['volume', 'form', 'scoring', 'spt', 'tune'].map(function (t) {
      return h('option', { value: t, selected: s.type === t ? true : null, text: U.TYPE_LABEL[t] });
    }));
    var rpeI = h('select', {}, [h('option', { value: '', text: '—' })].concat([1, 2, 3, 4, 5].map(function (n) {
      return h('option', { value: n, selected: s.rpe === n ? true : null, text: n });
    })));
    var scoreI = h('input', { type: 'number', inputmode: 'numeric', value: s.score ? s.score.total : '' });
    var outOfI = h('input', { type: 'number', inputmode: 'numeric', value: s.score && s.score.outOf ? s.score.outOf : '' });
    var notesI = h('textarea', {}, [s.notes || '']);

    dialog('Edit session', [
      h('div', { class: 'row' }, [
        h('div', { class: 'field' }, [h('label', { text: 'Date' }), dateI]),
        h('div', { class: 'field' }, [h('label', { text: 'Arrows' }), arrowsI])
      ]),
      h('div', { class: 'row-3' }, [
        h('div', { class: 'field' }, [h('label', { text: 'Set size' }), setI]),
        h('div', { class: 'field' }, [h('label', { text: 'Minutes' }), minI]),
        h('div', { class: 'field' }, [h('label', { text: 'Distance' }), distI])
      ]),
      h('div', { class: 'row' }, [
        h('div', { class: 'field' }, [h('label', { text: 'Type' }), typeI]),
        h('div', { class: 'field' }, [h('label', { text: 'RPE' }), rpeI])
      ]),
      h('div', { class: 'row' }, [
        h('div', { class: 'field' }, [h('label', { text: 'Score' }), scoreI]),
        h('div', { class: 'field' }, [h('label', { text: 'Out of' }), outOfI])
      ]),
      h('div', { class: 'field' }, [h('label', { text: 'Notes' }), notesI])
    ], [
      h('button', {
        class: 'btn primary', onclick: function () {
          Store.updateSession(s.id, {
            date: dateI.value, arrows: arrowsI.value, setSize: setI.value || null,
            minutes: minI.value || null, distance: distI.value || null, type: typeI.value,
            rpe: rpeI.value || null,
            score: scoreI.value ? { total: scoreI.value, outOf: outOfI.value || null, round: s.score ? s.score.round : '' } : null,
            notes: notesI.value
          });
          dlg.close(); toast('Updated'); render();
        }
      }, ['Save']),
      h('button', {
        class: 'btn danger', onclick: function () {
          dlg.close();
          confirmDlg('Delete this session?', s.arrows + ' arrows on ' + D.fmtLong(s.date) + '.', function () {
            Store.removeSession(s.id); toast('Deleted'); render();
          });
        }
      }, ['Delete']),
      h('button', { class: 'btn ghost', onclick: function () { dlg.close(); } }, ['Cancel'])
    ]);
  }

  /* ---------- competitions ---------- */
  var COMP_CHECKLIST = [
    'Bow, limbs, spare string', 'Arrows (count them) + spares', 'Tab / release + spare',
    'Quiver, bow stand, arrow puller', 'Sight marks written down', 'Allen keys + tools',
    'Water and food', 'Rain gear / layers', 'Score card, pen, backup pen',
    'Membership card and entry confirmation', 'Sunscreen, hat', 'Phone charged'
  ];

  function addCompetition(existing) {
    var dlg = document.getElementById('dlg');
    var c = existing || {};
    var nameI = h('input', { type: 'text', value: c.name || '', placeholder: 'Club indoor round 1' });
    var dateI = h('input', { type: 'date', value: c.date || D.iso(D.addDays(D.today(), 21)) });
    var locI = h('input', { type: 'text', value: c.location || '', placeholder: 'Where' });
    var roundI = h('input', { type: 'text', value: c.round || '', placeholder: 'Portsmouth / WA 18 / 720' });
    var distI = h('input', { type: 'number', inputmode: 'numeric', value: c.distance || '', placeholder: '18' });
    var scoreI = h('input', { type: 'number', inputmode: 'numeric', value: c.result && c.result.score ? c.result.score : '', placeholder: 'after the event' });
    var placeI = h('input', { type: 'number', inputmode: 'numeric', value: c.result && c.result.place ? c.result.place : '', placeholder: 'e.g. 3' });
    var notesI = h('textarea', {}, [c.notes || '']);

    var nodes = [
      h('div', { class: 'field' }, [h('label', { text: 'Name' }), nameI]),
      h('div', { class: 'row' }, [
        h('div', { class: 'field' }, [h('label', { text: 'Date' }), dateI]),
        h('div', { class: 'field' }, [h('label', { text: 'Distance (m)' }), distI])
      ]),
      h('div', { class: 'row' }, [
        h('div', { class: 'field' }, [h('label', { text: 'Location' }), locI]),
        h('div', { class: 'field' }, [h('label', { text: 'Round' }), roundI])
      ]),
      h('div', { class: 'row' }, [
        h('div', { class: 'field' }, [h('label', { text: 'Score (after)' }), scoreI]),
        h('div', { class: 'field' }, [h('label', { text: 'Place (after)' }), placeI])
      ]),
      h('div', { class: 'field' }, [h('label', { text: 'Notes' }), notesI])
    ];

    if (existing) {
      var saved = c.checklist || {};
      nodes.push(h('hr', { class: 'sep' }));
      nodes.push(h('label', { text: 'Competition day checklist' }));
      var boxes = COMP_CHECKLIST.map(function (item, i) {
        var cb = h('input', { type: 'checkbox', class: 'check', checked: saved[i] ? true : null });
        cb.dataset.idx = i;
        return h('label', { style: 'display:flex;gap:9px;align-items:center;font-size:.88rem;font-weight:400;color:var(--text);margin:0;padding:5px 0' }, [cb, h('span', { text: item })]);
      });
      nodes.push(h('div', {}, boxes));
      c.__boxes = boxes;
    }

    var actions = [
      h('button', {
        class: 'btn primary', onclick: function () {
          if (!nameI.value.trim()) { toast('Give it a name.'); return; }
          var checklist = null;
          if (existing && c.__boxes) {
            checklist = {};
            c.__boxes.forEach(function (l) { var cb = l.querySelector('input'); if (cb.checked) checklist[cb.dataset.idx] = true; });
          }
          var payload = {
            name: nameI.value.trim(), date: dateI.value, location: locI.value.trim(),
            round: roundI.value.trim(), distance: distI.value || null, notes: notesI.value,
            result: scoreI.value || placeI.value ? { score: +scoreI.value || null, place: +placeI.value || null } : null,
            checklist: checklist
          };
          if (existing && existing.id) Store.updateCompetition(existing.id, payload);
          else Store.addCompetition(payload);
          dlg.close(); toast(existing ? 'Updated' : 'Competition added'); render();
        }
      }, [existing ? 'Save' : 'Add'])
    ];
    if (existing && existing.id) {
      actions.push(h('button', {
        class: 'btn danger', onclick: function () {
          dlg.close();
          confirmDlg('Remove this competition?', existing.name + ' on ' + D.fmtLong(existing.date), function () {
            Store.removeCompetition(existing.id); toast('Removed'); render();
          });
        }
      }, ['Delete']));
    }
    actions.push(h('button', { class: 'btn ghost', onclick: function () { dlg.close(); } }, ['Cancel']));

    dialog(existing ? 'Competition' : 'Add competition', nodes, actions);
  }

  /* ---------- plan target override ---------- */
  function overrideArrows(ps) {
    var dlg = document.getElementById('dlg');
    var n = h('input', { type: 'number', inputmode: 'numeric', value: ps.arrows, min: '0', step: '1' });
    dialog('Adjust ' + D.fmtShort(ps.date), [
      h('p', { class: 'muted', text: 'The plan suggested ' + ps.arrows + ' arrows. Set your own number — everything else stays as it is.' }),
      h('div', { class: 'field' }, [h('label', { text: 'Arrows' }), n])
    ], [
      h('button', {
        class: 'btn primary', onclick: function () {
          var st = Store.get();
          st.planOverrides[ps.date] = Math.max(0, parseInt(n.value, 10) || 0);
          Store.touchSettings(); Store.save(); dlg.close(); toast('Target adjusted'); render();
        }
      }, ['Save']),
      h('button', {
        class: 'btn ghost', onclick: function () {
          var st = Store.get();
          delete st.planOverrides[ps.date];
          Store.touchSettings(); Store.save(); dlg.close(); toast('Back to the suggested target'); render();
        }
      }, ['Reset to suggestion'])
    ]);
  }

  /* ---------- day detail from the calendar ---------- */
  function dayDetail(dISO) {
    var dlg = document.getElementById('dlg');
    var sessions = Store.sessionsOn(dISO);
    var comp = Store.get().competitions.filter(function (c) { return c.date === dISO; })[0];
    var planned = ctx.plan ? ctx.plan.sessions.filter(function (p) { return p.date === dISO; })[0] : null;
    var nodes = [];

    if (comp) {
      nodes.push(h('div', { class: 'banner' }, [
        h('strong', { text: comp.name }),
        h('div', { style: 'font-size:.86rem', text: [comp.location, comp.round, comp.distance ? comp.distance + 'm' : ''].filter(Boolean).join(' · ') }),
        comp.result && comp.result.score ? h('div', { style: 'font-size:.86rem;margin-top:4px', text: 'Scored ' + comp.result.score + (comp.result.place ? ' · ' + U.ordinal(comp.result.place) : '') }) : null
      ]));
    }
    if (planned) {
      nodes.push(h('p', { class: 'muted', html: '<b>Planned:</b> ' + planned.arrows + ' arrows — ' + U.esc(planned.title) }));
    }
    if (sessions.length) {
      nodes.push(h('ul', { class: 'list' }, sessions.map(function (s) { return U.sessionRow(s, ctx); })));
    } else if (!comp) {
      nodes.push(h('p', { class: 'muted', text: 'Nothing logged on this day.' }));
    }

    var actions = [
      h('button', {
        class: 'btn primary', onclick: function () {
          dlg.close();
          go('log', { prefill: planned || { date: dISO, arrows: '', minutes: Store.get().settings.sessionMinutes, distance: Store.get().settings.defaultDistance } });
        }
      }, ['Log a session']),
      comp ? h('button', { class: 'btn', onclick: function () { dlg.close(); addCompetition(comp); } }, ['Edit competition']) : null,
      h('button', { class: 'btn ghost', onclick: function () { dlg.close(); } }, ['Close'])
    ].filter(Boolean);

    dialog(D.fmtLong(dISO), nodes, actions);
  }

  /* ---------- gear ---------- */
  function newString() {
    var dlg = document.getElementById('dlg');
    var n = h('input', { type: 'text', placeholder: 'e.g. 8125G, 18 strands' });
    dialog('New string', [
      h('p', { class: 'muted', text: 'Arrow counting starts from today. Any string currently fitted is retired.' }),
      h('div', { class: 'field' }, [h('label', { text: 'Name or spec' }), n])
    ], [
      h('button', { class: 'btn primary', onclick: function () { Store.addString(n.value.trim()); dlg.close(); toast('String registered'); render(); } }, ['Add']),
      h('button', { class: 'btn ghost', onclick: function () { dlg.close(); } }, ['Cancel'])
    ]);
  }

  /* ---------- files ---------- */
  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Downloaded ' + filename);
  }

  function importFile() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var file = inp.files && inp.files[0];
      if (!file) return;
      var fr = new FileReader();
      fr.onload = function () {
        var dlg = document.getElementById('dlg');
        dialog('Restore backup', [
          h('p', { class: 'muted', text: 'Merge keeps what is already here and adds anything new. Replace throws away the current data.' })
        ], [
          h('button', {
            class: 'btn primary', onclick: function () {
              try { Store.importJSON(fr.result, 'merge'); dlg.close(); toast('Merged'); render(); }
              catch (e) { dlg.close(); toast('That file did not look right.'); }
            }
          }, ['Merge']),
          h('button', {
            class: 'btn danger', onclick: function () {
              try { Store.importJSON(fr.result, 'replace'); dlg.close(); toast('Replaced'); render(); }
              catch (e) { dlg.close(); toast('That file did not look right.'); }
            }
          }, ['Replace']),
          h('button', { class: 'btn ghost', onclick: function () { dlg.close(); } }, ['Cancel'])
        ]);
      };
      fr.readAsText(file);
    };
    inp.click();
  }

  /* ---------- share links ---------- */
  function handleShareLink() {
    var shared = Store.readShareFragment();
    if (!shared) return false;
    var banner = document.getElementById('shareBanner');
    var name = shared.settings.archer ? shared.settings.archer + "'s" : 'A shared';
    var total = shared.sessions.reduce(function (n, s) { return n + s.arrows; }, 0);

    Store.adoptState(shared);
    viewingShared = true;

    clear(banner).appendChild(h('div', { class: 'banner' }, [
      h('strong', { text: 'You are looking at ' + name + ' archery log' }),
      h('div', { style: 'font-size:.87rem;margin-top:3px', text: shared.sessions.length + ' sessions, ' + total.toLocaleString() + ' arrows. Nothing here is saved to this device yet.' }),
      h('div', { class: 'btn-row' }, [
        h('button', {
          class: 'btn primary sm', onclick: function () {
            Store.commitAdopted();
            location.hash = '';
            location.reload();
          }
        }, ['Keep this on this device']),
        h('button', {
          class: 'btn sm', onclick: function () { location.hash = ''; location.reload(); }
        }, ['Discard and use my own'])
      ])
    ]));
    return true;
  }

  /* ---------- sync ---------- */
  var pushTimer = null;

  function syncNow(opts) {
    return Sync.sync(opts || {}).then(function (r) {
      if (r && r.changed) render();
      return r;
    });
  }

  /* Local edits are pushed on a short delay so a burst of changes
     (editing three fields in a dialog) becomes one commit, not three. */
  function schedulePush() {
    if (!Sync.canWrite()) { if (Sync.hasRepo()) Sync.markDirty(); return; }
    Sync.markDirty();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { syncNow({ push: true }); }, 2500);
  }

  function renderSyncChip(st) {
    var chip = document.getElementById('syncChip');
    if (!chip) return;
    if (!st.hasRepo) { chip.setAttribute('hidden', 'hidden'); return; }
    chip.removeAttribute('hidden');
    chip.dataset.status = st.status;
    var label = {
      idle: st.dirty ? 'Unsaved' : 'Synced',
      syncing: 'Syncing',
      error: 'Sync failed',
      offline: 'Offline',
      readonly: 'Read only',
      off: ''
    }[st.status] || '';
    chip.innerHTML = '<span class="sync-text">' + U.esc(label) + '</span>';
    chip.title = st.status === 'error' ? (st.error || 'Sync failed') :
      st.status === 'readonly' ? 'Viewing the shared log. Add a token under You to save from this device.' :
        st.lastSync ? 'Last synced ' + new Date(st.lastSync).toLocaleTimeString() : 'Not synced yet';
  }

  function wireSync() {
    Sync.init();
    Sync.onChange(renderSyncChip);
    renderSyncChip(Sync.state());

    document.getElementById('syncChip').addEventListener('click', function () {
      var st = Sync.state();
      if (st.status === 'error') { toast(st.error || 'Sync failed'); }
      syncNow({ push: st.canWrite });
    });

    if (!Sync.hasRepo()) return;

    /* Without a token this is somebody else's log (or your own, on a device you
       have not set up yet). Show it, but never merge it into this browser's
       own data — that would quietly overwrite a visitor's log with yours. */
    if (!Sync.canWrite()) { viewRemote(); return; }

    syncNow();                                    // catch up on whatever happened elsewhere
    Store.subscribe(schedulePush);                // push local edits
    global.addEventListener('online', function () { syncNow({ push: true }); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) syncNow();            // pull whatever the other device did
    });
    setInterval(function () { if (!document.hidden) syncNow(); }, 120000);
    /* A pending push must not be lost if the tab closes first. */
    global.addEventListener('pagehide', function () {
      if (Sync.state().dirty && Sync.canWrite()) { clearTimeout(pushTimer); syncNow({ push: true }); }
    });
  }

  function viewRemote() {
    Sync.peek().then(function (remote) {
      if (!remote || !remote.sessions || !remote.sessions.length) return;
      var owner = (remote.settings && remote.settings.archer) || Sync.config().owner;
      var total = remote.sessions.reduce(function (n, x) { return n + (x.arrows || 0); }, 0);
      var hadOwnData = Store.get().sessions.length > 0;

      Store.adoptState(Store.fromPayload(remote));
      viewingShared = true;
      render();

      clear(document.getElementById('shareBanner')).appendChild(h('div', { class: 'banner' }, [
        h('strong', { text: 'Viewing ' + owner + '\u2019s log' }),
        h('div', { style: 'font-size:.87rem;margin-top:3px', text:
          remote.sessions.length + ' sessions, ' + total.toLocaleString() + ' arrows. Read only \u2014 nothing you do here is saved to GitHub.' +
          (hadOwnData ? ' Your own log on this device is untouched.' : '') }),
        h('div', { class: 'btn-row' }, [
          h('button', { class: 'btn primary sm', onclick: function () { go('settings'); } }, ['This is mine \u2014 set up saving']),
          h('button', {
            class: 'btn sm', onclick: function () {
              Sync.saveConfig({ enabled: false });
              location.reload();
            }
          }, [hadOwnData ? 'Back to my own log' : 'Start my own log'])
        ])
      ]));
    }).catch(function (e) {
      console.info('Could not load the shared log:', e.message);
    });
  }

  /* ---------- theme ---------- */
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }
  function cycleTheme() {
    var order = ['auto', 'light', 'dark'];
    var st = Store.get();
    var next = order[(order.indexOf(st.settings.theme || 'auto') + 1) % order.length];
    st.settings.theme = next;
    if (!viewingShared) Store.save();
    applyTheme(next);
    toast('Theme: ' + next);
  }

  /* ---------- first run ---------- */
  var SEED_COMP = { date: '2026-10-11', name: 'First competition', distance: 18 };

  function seedIfEmpty() {
    var st = Store.get();
    if (st.sessions.length || st.competitions.length) return;
    // A starting competition so the plan has something to aim at on first open.
    // Skipped once the date has passed, so a fresh copy of this app later does
    // not open with a competition already in the past.
    if (SEED_COMP.date <= D.iso(D.today())) return;
    Store.addCompetition({
      name: SEED_COMP.name, date: SEED_COMP.date, location: '', round: '',
      distance: SEED_COMP.distance,
      notes: 'Edit or replace this — the plan works backwards from whatever date is here.'
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    Store.load();
    var isShared = handleShareLink();
    if (!isShared) seedIfEmpty();
    applyTheme(Store.get().settings.theme || 'auto');

    document.querySelectorAll('nav.tabs button').forEach(function (b) {
      b.addEventListener('click', function () { go(b.dataset.view); });
    });
    document.getElementById('themeBtn').addEventListener('click', cycleTheme);
    document.getElementById('dlg').addEventListener('click', function (e) {
      if (e.target.id === 'dlg') e.target.close();   // click the backdrop to dismiss
    });

    /* Pasting a share link into an already-open tab only changes the fragment,
       so pick it up here and boot cleanly rather than silently ignoring it. */
    global.addEventListener('hashchange', function () {
      if (/#share=/.test(location.hash) && !viewingShared) location.reload();
    });

    Store.subscribe(function () { /* re-render is driven explicitly by callers */ });
    go('dash');
    wireSync();

    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.info('Offline mode unavailable:', e.message); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
