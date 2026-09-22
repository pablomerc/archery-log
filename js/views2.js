/* views2.js — calendar, gear and settings screens. */
(function (global) {
  'use strict';
  var U = global.ViewUtil, h = U.h, esc = U.esc, clear = U.clear, card = U.card,
    cardHead = U.cardHead, empty = U.empty, ordinal = U.ordinal;
  var Views = global.Views;
  var D;
  var calCursor = null;   // month being viewed

  global.__wireDate2 = function (d) { D = d; };

  /* =========================================================
     CALENDAR
     ========================================================= */
  Views.cal = function (root, ctx) {
    clear(root);
    var st = ctx.state, plan = ctx.plan;
    var todayISO = D.iso(D.today());
    if (!calCursor) { var t = D.today(); calCursor = new Date(t.getFullYear(), t.getMonth(), 1); }

    var planByDate = {};
    if (plan) plan.sessions.forEach(function (p) { planByDate[p.date] = p; });
    var compByDate = {};
    st.competitions.forEach(function (c) { compByDate[c.date] = c; });

    function draw() {
      clear(root);
      var y = calCursor.getFullYear(), m = calCursor.getMonth();
      var first = new Date(y, m, 1);
      var lead = (first.getDay() + 6) % 7;                 // Monday-start grid
      var nDays = new Date(y, m + 1, 0).getDate();
      var monthArrows = 0, monthSessions = 0;

      var cells = [];
      for (var i = 0; i < lead; i++) cells.push(h('div', { class: 'cal-cell blank' }));
      for (var day = 1; day <= nDays; day++) {
        (function (day) {
          var dISO = D.iso(new Date(y, m, day));
          var actual = Store.arrowsOn(dISO);
          var planned = planByDate[dISO];
          var comp = compByDate[dISO];
          if (actual) { monthArrows += actual; monthSessions += Store.sessionsOn(dISO).length; }

          var cls = 'cal-cell';
          if (dISO === todayISO) cls += ' today';
          if (comp) cls += ' comp';
          else if (actual) cls += ' done';
          else if (planned && dISO >= todayISO) cls += ' planned';

          cells.push(h('div', {
            class: cls, role: 'button', tabindex: '0',
            title: D.fmtLong(dISO) + (comp ? ' — ' + comp.name : '') + (actual ? ' — ' + actual + ' arrows' : planned ? ' — ' + planned.arrows + ' planned' : ''),
            onclick: function () { ctx.dayDetail(dISO); },
            onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.dayDetail(dISO); } }
          }, [
            h('span', { class: 'd', text: day }),
            comp ? h('span', { class: 'n', text: '◆' }) :
              actual ? h('span', { class: 'n', text: actual }) :
                planned && dISO >= todayISO ? h('span', { class: 'n', text: planned.arrows }) : null,
            (planned && actual && actual >= planned.arrows) ? h('i', { class: 'dot' }) : null
          ]));
        })(day);
      }

      var label = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      root.appendChild(card([
        h('div', { class: 'cal-head' }, [
          h('button', { class: 'btn ghost sm', 'aria-label': 'Previous month', onclick: function () { calCursor = new Date(y, m - 1, 1); draw(); } }, ['‹']),
          h('h2', { text: label, style: 'text-align:center' }),
          h('button', { class: 'btn ghost sm', 'aria-label': 'Next month', onclick: function () { calCursor = new Date(y, m + 1, 1); draw(); } }, ['›'])
        ]),
        h('div', { class: 'cal-grid' }, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (d) {
          return h('div', { class: 'cal-dow', text: d });
        }).concat(cells)),
        h('div', { class: 'legend', style: 'margin-top:12px' }, [
          h('span', {}, [h('i', { class: 'swatch', style: 'background:color-mix(in srgb,var(--green) 40%,var(--surface))' }), 'shot']),
          h('span', {}, [h('i', { class: 'swatch', style: 'background:color-mix(in srgb,var(--blue) 30%,var(--surface))' }), 'planned']),
          h('span', {}, [h('i', { class: 'swatch', style: 'background:var(--accent)' }), 'competition'])
        ]),
        h('div', { class: 'hint', text: monthArrows ? monthArrows.toLocaleString() + ' arrows across ' + monthSessions + ' sessions this month.' : 'Nothing logged this month yet.' })
      ]));

      root.appendChild(competitionList(ctx));
    }
    draw();
  };

  /* ---------- the competition schedule, as a plain list ---------- */
  /* Shared with the Plan tab so there is exactly one competition list in the app. */
  function competitionList(ctx) {
    var st = ctx.state;
    var todayISO = D.iso(D.today());
    var comps = st.competitions.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var upcoming = comps.filter(function (c) { return c.date >= todayISO; });
    var past = comps.filter(function (c) { return c.date < todayISO; }).reverse();

    if (!comps.length) {
      return card([
        cardHead('Competitions', h('button', { class: 'btn primary sm', onclick: function () { ctx.addCompetition(); } }, ['+ Add'])),
        empty('Nothing on the calendar.', 'Add a competition and the plan builds itself around the date.')
      ]);
    }

    /* A list rather than a table: on a phone a six-column table either scrolls
       sideways or wraps every cell into a tall unreadable block. */
    function row(c) {
      var days = D.daysBetween(todayISO, c.date);
      var d = D.parseISO(c.date);
      var when = days === 0 ? 'Today' : days > 0 ? 'in ' + days + ' days' : Math.abs(days) + ' days ago';
      var meta = [c.location, c.round].filter(Boolean);

      return h('li', {
        class: 'comp-row' + (days < 0 ? ' past' : ''), tabindex: '0', role: 'button',
        onclick: function () { ctx.addCompetition(c); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.addCompetition(c); } }
      }, [
        h('div', { class: 'comp-date' }, [
          h('div', { class: 'm', text: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase() }),
          h('div', { class: 'dd', text: d.getDate() }),
          h('div', { class: 'y', text: D.dowName(d.getDay()) + ' ' + d.getFullYear() })
        ]),
        h('div', { class: 'comp-body' }, [
          h('div', { class: 'comp-name', text: c.name }),
          meta.length ? h('div', { class: 'comp-meta', text: meta.join(' \u00b7 ') }) : null,
          h('div', { class: 'comp-tags' }, [
            c.confirmed === false
              ? h('span', { class: 'tag scoring', text: 'date estimated' })
              : h('span', { class: 'tag volume', text: 'confirmed' }),
            c.priority === 'B' ? h('span', { class: 'tag', text: 'shoot through' }) : h('span', { class: 'tag taper', text: 'target event' }),
            h('span', { class: 'comp-when', text: when }),
            c.result && c.result.score
              ? h('strong', { style: 'margin-left:auto', text: c.result.score + (c.result.place ? ' \u00b7 ' + ordinal(c.result.place) : '') })
              : c.url ? h('a', {
                href: c.url, target: '_blank', rel: 'noopener', style: 'margin-left:auto',
                onclick: function (e) { e.stopPropagation(); }, text: 'entry \u2197'
              }) : null
          ])
        ])
      ]);
    }

    var anyEstimated = comps.some(function (c) { return c.confirmed === false; });

    return card([
      cardHead('Competition schedule',
        h('button', { class: 'btn ghost sm', onclick: function () { ctx.addCompetition(); } }, ['+ Add'])),
      h('ul', { class: 'comp-list' }, upcoming.map(row)),
      anyEstimated ? h('div', { class: 'hint', text: 'Events marked "date estimated" have not published a date for this season yet \u2014 those are the best guess from previous years. Check the entry link before booking anything.' }) : null,
      past.length ? h('details', { style: 'margin-top:12px' }, [
        h('summary', { style: 'cursor:pointer;font-size:.86rem;font-weight:620;color:var(--text-dim)', text: past.length + ' past ' + (past.length === 1 ? 'competition' : 'competitions') }),
        h('ul', { class: 'comp-list', style: 'margin-top:6px' }, past.map(row))
      ]) : null,
      h('div', { class: 'hint', text: 'Tap any event to edit it, record a result, or change whether the plan tapers for it.' })
    ]);
  }

  /* =========================================================
     GEAR
     ========================================================= */
  Views.gear = function (root, ctx) {
    clear(root);
    var st = ctx.state;
    var lifetime = Store.lifetimeArrows();
    var str = Store.activeString();
    var strArrows = Store.stringArrows();

    /* string life — archers replace by arrow count, not calendar */
    var STRING_LIFE = 2500;
    var body = [cardHead('String life', h('button', {
      class: 'btn ghost sm', onclick: function () { ctx.newString(); }
    }, ['New string']))];

    if (str) {
      var pct = Math.min(100, Math.round(strArrows / STRING_LIFE * 100));
      body.push(h('div', { style: 'display:flex;align-items:baseline;gap:8px' }, [
        h('strong', { style: 'font-size:1.5rem;font-variant-numeric:tabular-nums', text: strArrows.toLocaleString() }),
        h('span', { class: 'muted', text: 'of ~' + STRING_LIFE.toLocaleString() + ' arrows' })
      ]));
      body.push(h('div', { class: 'bar-mini' }, [h('i', { class: pct < 80 ? 'good' : '', style: 'width:' + pct + '%' })]));
      body.push(h('div', { class: 'hint', text: str.name + ', on since ' + D.fmtShort(str.installedOn) + '. ' +
        (pct >= 100 ? 'Past its usual life — check for fraying and serving wear.'
          : pct >= 80 ? 'Getting on. Worth having a spare built before your next competition.'
            : 'Plenty of life left.') }));
      body.push(h('div', { class: 'hint faint', text: 'Rule of thumb only — inspect the serving and the loops rather than trusting the number.' }));
    } else {
      body.push(empty('No string registered.', 'Add one and it counts arrows from today so you know when to replace it.'));
    }
    root.appendChild(card(body));

    if (st.gear.strings.length > 1) {
      root.appendChild(card([
        cardHead('Previous strings'),
        h('ul', { class: 'list' }, st.gear.strings.slice().reverse().slice(1).map(function (s) {
          var next = st.gear.strings[st.gear.strings.indexOf(s) + 1];
          var used = (next ? next.installedAt : lifetime) - s.installedAt;
          return h('li', {}, [
            h('div', { class: 'when', text: D.fmtShort(s.installedOn) }),
            h('div', { class: 'main' }, [h('div', { class: 'title', text: s.name }), h('div', { class: 'meta', text: s.retired ? 'retired ' + D.fmtShort(s.retired) : 'in use' })]),
            h('div', { class: 'amt', text: Math.max(0, used).toLocaleString() })
          ]);
        }))
      ]));
    }

    /* sight marks */
    var distI = h('input', { type: 'number', inputmode: 'numeric', placeholder: '18' });
    var markI = h('input', { type: 'text', placeholder: '6.4' });
    var noteI = h('input', { type: 'text', placeholder: 'indoor, 45lb' });
    root.appendChild(card([
      cardHead('Sight marks'),
      st.gear.sightMarks.length ? h('ul', { class: 'list' }, st.gear.sightMarks.map(function (m) {
        return h('li', {}, [
          h('div', { class: 'when', style: 'font-weight:700;color:var(--text)', text: m.distance + 'm' }),
          h('div', { class: 'main' }, [h('div', { class: 'title', text: m.mark }), m.note ? h('div', { class: 'meta', text: m.note }) : null]),
          h('button', { class: 'btn ghost sm', 'aria-label': 'Delete sight mark', onclick: function () { Store.removeSightMark(m.id); ctx.render(); } }, ['×'])
        ]);
      })) : h('p', { class: 'muted', text: 'No marks saved. Worth doing — they are exactly what you forget on competition morning.' }),
      h('hr', { class: 'sep' }),
      h('div', { class: 'row-3' }, [
        h('div', { class: 'field' }, [h('label', { text: 'Distance' }), distI]),
        h('div', { class: 'field' }, [h('label', { text: 'Mark' }), markI]),
        h('div', { class: 'field' }, [h('label', { text: 'Note' }), noteI])
      ]),
      h('button', {
        class: 'btn', onclick: function () {
          if (!distI.value || !markI.value) { ctx.toast('Distance and mark, please.'); return; }
          Store.setSightMark(distI.value, markI.value, noteI.value);
          distI.value = ''; markI.value = ''; noteI.value = '';
          ctx.render();
        }
      }, ['Save mark'])
    ]));

    /* personal bests */
    var pbs = Store.personalBests();
    root.appendChild(card([
      cardHead('Personal bests'),
      pbs.length ? h('ul', { class: 'list' }, pbs.map(function (p) {
        return h('li', {}, [
          h('div', { class: 'main' }, [
            h('div', { class: 'title', text: p.round }),
            h('div', { class: 'meta', text: D.fmtLong(p.session.date) })
          ]),
          h('div', { class: 'amt', text: p.session.score.total + (p.session.score.outOf ? '/' + p.session.score.outOf : '') })
        ]);
      })) : empty('No scores logged yet.', 'Add a score when you shoot a round and bests appear here.')
    ]));
  };

  /* =========================================================
     SETTINGS
     ========================================================= */
  Views.settings = function (root, ctx) {
    clear(root);
    var st = ctx.state, s = st.settings;

    var nameI = h('input', { type: 'text', value: s.archer, placeholder: 'Your name' });
    var bowI = h('select', {}, ['recurve', 'compound', 'barebow', 'traditional'].map(function (b) {
      return h('option', { value: b, selected: s.bow === b ? true : null, text: b.charAt(0).toUpperCase() + b.slice(1) });
    }));
    var dayBoxes = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function (nm, i) {
      var cb = h('input', { type: 'checkbox', class: 'check', checked: s.practiceDays.indexOf(i) >= 0 ? true : null });
      cb.dataset.day = i;
      return h('label', {
        style: 'display:flex;align-items:center;gap:6px;font-size:.84rem;margin:0;padding:7px 9px;border:1px solid var(--border);border-radius:8px;cursor:pointer'
      }, [cb, h('span', { text: nm })]);
    });
    var minI = h('input', { type: 'number', min: '15', step: '15', inputmode: 'numeric', value: s.sessionMinutes });
    var baseI = h('input', { type: 'number', min: '6', step: '1', inputmode: 'numeric', value: s.baseArrows });
    var setI = h('input', { type: 'number', min: '1', step: '1', inputmode: 'numeric', value: s.defaultSetSize });
    var distI = h('input', { type: 'number', min: '1', step: '1', inputmode: 'numeric', value: s.defaultDistance });
    var rampI = h('select', {}, [
      { v: 0.05, t: 'Gentle (+5% a week)' }, { v: 0.08, t: 'Steady (+8% a week)' }, { v: 0.12, t: 'Aggressive (+12% a week)' }
    ].map(function (o) { return h('option', { value: o.v, selected: Math.abs(s.rampPerWeek - o.v) < 0.001 ? true : null, text: o.t }); }));

    root.appendChild(card([
      cardHead('You'),
      h('div', { class: 'field' }, [h('label', { text: 'Name (shown on shared links)' }), nameI]),
      h('div', { class: 'field' }, [h('label', { text: 'Bow' }), bowI]),
      h('div', { class: 'field' }, [
        h('label', { text: 'Days you can practise' }),
        h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, dayBoxes)
      ]),
      h('div', { class: 'row' }, [
        h('div', { class: 'field' }, [h('label', { text: 'Minutes per session' }), minI]),
        h('div', { class: 'field' }, [h('label', { text: 'Arrows per session now' }), baseI])
      ]),
      h('div', { class: 'row' }, [
        h('div', { class: 'field' }, [h('label', { text: 'Usual set size' }), setI]),
        h('div', { class: 'field' }, [h('label', { text: 'Usual distance (m)' }), distI])
      ]),
      h('div', { class: 'field' }, [h('label', { text: 'How fast to build volume' }), rampI]),
      h('button', {
        class: 'btn primary', onclick: function () {
          var days = dayBoxes.map(function (l) { return l.querySelector('input'); })
            .filter(function (cb) { return cb.checked; })
            .map(function (cb) { return +cb.dataset.day; });
          if (!days.length) { ctx.toast('Pick at least one practice day.'); return; }
          Store.setSettings({
            archer: nameI.value.trim(), bow: bowI.value, practiceDays: days,
            sessionMinutes: +minI.value || 120, baseArrows: +baseI.value || 55,
            defaultSetSize: +setI.value || 4, defaultDistance: +distI.value || 18,
            rampPerWeek: +rampI.value
          });
          ctx.toast('Saved — plan rebuilt');
          ctx.render();
        }
      }, ['Save and rebuild the plan']),
      h('div', { class: 'hint', text: 'Changing any of these regenerates the training plan. Targets you adjusted by hand are kept.' })
    ]));

    /* ---- sync ---- */
    (function () {
      var sc = Sync.config();
      var ss = Sync.state();

      var ownerI = h('input', { type: 'text', value: sc.owner, placeholder: 'your-github-username', autocapitalize: 'off', spellcheck: 'false' });
      var repoI = h('input', { type: 'text', value: sc.repo, placeholder: 'archery-log', autocapitalize: 'off', spellcheck: 'false' });
      var branchI = h('input', { type: 'text', value: sc.branch, placeholder: 'main', autocapitalize: 'off', spellcheck: 'false' });
      var tokenI = h('input', {
        type: 'password', value: '', placeholder: sc.token ? '\u2022\u2022\u2022\u2022 saved on this device' : 'github_pat_...',
        autocapitalize: 'off', spellcheck: 'false', autocomplete: 'off'
      });
      var out = h('div');

      function statusLine() {
        if (!ss.hasRepo) return 'Not set up. Fill this in and every device you own shares one log.';
        if (!ss.canWrite) return 'Reading the shared log. Add a token below to save from this device too.';
        return 'This device can read and save.' + (ss.lastSync ? ' Last synced ' + new Date(ss.lastSync).toLocaleString() + '.' : '');
      }

      var body = [
        cardHead('Sync across devices', ss.hasRepo
          ? h('span', { class: 'tag ' + (ss.canWrite ? 'volume' : 'taper'), text: ss.canWrite ? 'read + write' : 'read only' })
          : null),
        h('p', { class: 'muted', style: 'font-size:.9rem', text: statusLine() })
      ];

      if (sc.autodetected && sc.owner) {
        body.push(h('div', { class: 'hint', text: 'Repository detected from this page\u2019s address: ' + sc.owner + '/' + sc.repo }));
      }

      body.push(h('hr', { class: 'sep' }));
      body.push(h('div', { class: 'row' }, [
        h('div', { class: 'field' }, [h('label', { text: 'GitHub username' }), ownerI]),
        h('div', { class: 'field' }, [h('label', { text: 'Repository' }), repoI])
      ]));
      body.push(h('div', { class: 'field' }, [h('label', { text: 'Branch' }), branchI]));

      body.push(h('details', { style: 'margin:6px 0 12px' }, [
        h('summary', { style: 'cursor:pointer;font-size:.86rem;font-weight:620;color:var(--text-dim)', text: 'How to get a token' }),
        h('div', { style: 'margin-top:9px' }, [
          h('div', { class: 'step' }, [h('span', { class: 'num', text: '1' }), h('div', { class: 'txt', html: 'Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>' })]),
          h('div', { class: 'step' }, [h('span', { class: 'num', text: '2' }), h('div', { class: 'txt', text: 'Give it a name and an expiry. A year is reasonable; you will need to replace it when it runs out.' })]),
          h('div', { class: 'step' }, [h('span', { class: 'num', text: '3' }), h('div', { class: 'txt', html: 'Under <b>Repository access</b> choose <b>Only select repositories</b> and pick just this one.' })]),
          h('div', { class: 'step' }, [h('span', { class: 'num', text: '4' }), h('div', { class: 'txt', html: 'Under <b>Permissions \u2192 Repository permissions</b>, set <b>Contents</b> to <b>Read and write</b>. Nothing else is needed.' })]),
          h('div', { class: 'step' }, [h('span', { class: 'num', text: '5' }), h('div', { class: 'txt', text: 'Generate it, copy it, and paste it below. GitHub only shows it once.' })]),
          h('div', { class: 'hint', text: 'The token is stored in this browser only and is never written into the repository. Anyone holding it could change that one repository, so do not paste it anywhere else. If it leaks, delete it on GitHub and make a new one.' })
        ])
      ]));

      body.push(h('div', { class: 'field' }, [h('label', { text: sc.token ? 'Replace token' : 'Token' }), tokenI]));
      body.push(h('div', { class: 'btn-row' }, [
        h('button', {
          class: 'btn primary', onclick: async function () {
            var patch = {
              owner: ownerI.value.trim().replace(/^@/, ''), repo: repoI.value.trim(),
              branch: branchI.value.trim() || 'main', enabled: true
            };
            if (tokenI.value.trim()) patch.token = tokenI.value.trim();
            Sync.saveConfig(patch);
            tokenI.value = '';
            clear(out).appendChild(h('div', { class: 'result', text: 'Checking\u2026' }));
            var r = await Sync.testConnection();
            clear(out).appendChild(h('div', { class: 'result ' + (r.ok ? 'ok' : 'bad'), text: r.message }));
            if (r.ok) {
              var res = await ctx.syncNow({ push: !!r.write });
              if (res && res.ok) {
                ctx.toast(res.pushed ? 'Saved to GitHub' : 'Up to date');
                ctx.render();
              }
            }
          }
        }, ['Save and test']),
        ss.hasRepo ? h('button', {
          class: 'btn', onclick: async function () {
            clear(out).appendChild(h('div', { class: 'result', text: 'Syncing\u2026' }));
            var r = await ctx.syncNow({ push: Sync.canWrite() });
            clear(out).appendChild(h('div', {
              class: 'result ' + (r && r.ok ? 'ok' : 'bad'),
              text: r && r.ok ? (r.pushed ? 'Saved to GitHub.' : 'Already up to date.') : (r && r.error) || 'Sync failed.'
            }));
          }
        }, ['Sync now']) : null,
        sc.token ? h('button', {
          class: 'btn danger', onclick: function () {
            ctx.confirm('Remove the token from this device?', 'The log stays on GitHub and this device can still read it, but it will no longer save changes.', function () {
              Sync.forgetToken(); ctx.toast('Token removed'); ctx.render();
            });
          }
        }, ['Remove token']) : null
      ].filter(Boolean)));
      body.push(out);
      body.push(h('div', { class: 'hint', text: 'Changes are saved a couple of seconds after you make them, and pulled again whenever you come back to the page. Log while offline and it uploads once you have signal.' }));

      root.appendChild(card(body));
    })();

    /* ---- sharing & backup ---- */
    var shareOut = h('textarea', { class: 'share-box', readonly: true, rows: '3', hidden: 'hidden' });
    root.appendChild(card([
      cardHead('Share & back up'),
      h('p', { class: 'muted', style: 'font-size:.9rem' , text: 'Your data lives only in this browser. Nothing is uploaded anywhere. These are the ways to move it or show it to someone.'}),
      h('div', { class: 'btn-row' }, [
        h('button', {
          class: 'btn primary', onclick: function () {
            var url = Store.shareURL();
            /* Some browsers and chat apps choke on very long URLs. Well before
               that point, point people at the file export instead. */
            if (url.length > 28000) {
              ctx.toast('Your log is too big for a link now — use Download backup instead.');
              return;
            }
            shareOut.value = url;
            shareOut.removeAttribute('hidden');
            if (navigator.share) {
              navigator.share({ title: 'My archery log', url: url }).catch(function () { });
            } else if (navigator.clipboard) {
              navigator.clipboard.writeText(url).then(function () { ctx.toast('Link copied'); },
                function () { shareOut.select(); });
            }
          }
        }, ['Share a snapshot']),
        h('button', { class: 'btn', onclick: function () { ctx.download('archery-log.json', Store.exportJSON(), 'application/json'); } }, ['Download backup']),
        h('button', { class: 'btn', onclick: function () { ctx.download('archery-log.csv', Store.toCSV(), 'text/csv'); } }, ['Export CSV']),
        h('button', { class: 'btn', onclick: function () { ctx.importFile(); } }, ['Restore from file'])
      ]),
      shareOut,
      h('div', { class: 'hint', text: 'The share link carries your data inside the link itself — it never touches a server. Open it on another device and you can pull the data in there, which is also the simplest way to move from computer to phone.' })
    ]));

    /* ---- about / danger ---- */
    root.appendChild(card([
      cardHead('This app'),
      h('div', { class: 'kv' }, [h('span', { class: 'k', text: 'Sessions stored' }), h('span', { class: 'v', text: st.sessions.length })]),
      h('div', { class: 'kv' }, [h('span', { class: 'k', text: 'Competitions' }), h('span', { class: 'v', text: st.competitions.length })]),
      h('div', { class: 'kv' }, [h('span', { class: 'k', text: 'Lifetime arrows' }), h('span', { class: 'v', text: Store.lifetimeArrows().toLocaleString() })]),
      h('div', { class: 'kv' }, [h('span', { class: 'k', text: 'Last saved' }), h('span', { class: 'v', text: st.meta.lastSaved ? new Date(st.meta.lastSaved).toLocaleString() : 'never' })]),
      h('hr', { class: 'sep' }),
      h('button', {
        class: 'btn danger', onclick: function () {
          ctx.confirm('Delete everything?', 'This wipes every session, competition and setting in this browser. Download a backup first if you are not sure.', function () {
            localStorage.removeItem(Store.KEY);
            location.hash = '';
            location.reload();
          });
        }
      }, ['Erase all data'])
    ]));
  };
  global.CompetitionList = competitionList;
})(window);
