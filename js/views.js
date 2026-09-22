/* views.js — renders each screen. Plain DOM, no framework. */
(function (global) {
  'use strict';

  var D;   // Store.date, wired in App.init
  var Views = {};

  /* ---------- tiny DOM helpers ---------- */
  function h(tag, attrs, children) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function stat(label, value, sub, cls) {
    return h('div', { class: 'stat' + (cls ? ' ' + cls : '') }, [
      h('div', { class: 'label', text: label }),
      h('div', { class: 'value', text: String(value) }),
      sub ? h('div', { class: 'sub', text: sub }) : null
    ]);
  }
  function card(children, cls) { return h('div', { class: 'card' + (cls ? ' ' + cls : '') }, children); }
  function cardHead(title, right) {
    return h('div', { class: 'card-head' }, [h('h2', { text: title }), h('div', { class: 'spacer' }), right || null]);
  }
  function empty(msg, sub) {
    return h('div', { class: 'empty' }, [h('div', { text: msg, style: 'font-weight:600' }), sub ? h('div', { text: sub, style: 'font-size:.86rem;margin-top:4px' }) : null]);
  }
  var TYPE_LABEL = { form: 'Form', volume: 'Volume', scoring: 'Scoring', spt: 'SPT', tune: 'Tuning', comp: 'Comp' };

  /* =========================================================
     DASHBOARD
     ========================================================= */
  Views.dash = function (root, ctx) {
    clear(root);
    var s = ctx.state, plan = ctx.plan;
    var todayISO = D.iso(D.today());

    /* --- next competition countdown --- */
    var comp = Store.nextCompetition();
    if (comp) {
      var days = D.daysBetween(todayISO, comp.date);
      var planSessionsLeft = plan ? plan.sessions.filter(function (x) { return x.date >= todayISO; }).length : 0;
      var arrowsLeft = plan ? plan.sessions.filter(function (x) { return x.date >= todayISO; }).reduce(function (n, x) { return n + (x.arrows || 0); }, 0) : 0;
      root.appendChild(card([
        h('div', { class: 'label', text: days === 0 ? 'TODAY' : days < 0 ? 'MOST RECENT' : 'NEXT COMPETITION' }),
        h('h2', { text: comp.name }),
        h('div', { class: 'big', text: days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days > 0 ? days + ' days' : Math.abs(days) + ' days ago' }),
        h('div', { class: 'sub', text: D.fmtLong(comp.date) + (comp.location ? ' · ' + comp.location : '') }),
        days > 0 && plan ? h('div', { class: 'meta', text: planSessionsLeft + ' sessions and about ' + arrowsLeft + ' arrows left in the plan' }) : null
      ], 'countdown'));
    }

    /* --- headline numbers --- */
    var weekStart = D.iso(D.weekStart(D.today()));
    var thisWeek = Store.arrowsBetween(weekStart, todayISO);
    var lastWeekStart = D.iso(D.addDays(D.weekStart(D.today()), -7));
    var lastWeek = Store.arrowsBetween(lastWeekStart, D.iso(D.addDays(D.weekStart(D.today()), -1)));
    var lifetime = Store.lifetimeArrows();
    var streak = Store.streakWeeks();

    var weekTargetObj = plan ? plan.weeks.filter(function (w) { return w.key === weekStart; })[0] : null;
    var weekTarget = weekTargetObj ? weekTargetObj.arrows : null;

    var grid = h('div', { class: 'stats' }, [
      stat('This week', thisWeek, weekTarget ? 'of ' + weekTarget + ' planned' : (lastWeek ? 'last week ' + lastWeek : 'arrows'), 'accent'),
      stat('Today', Store.arrowsOn(todayISO), Store.sessionsOn(todayISO).length + ' session' + (Store.sessionsOn(todayISO).length === 1 ? '' : 's')),
      stat('Lifetime', lifetime.toLocaleString(), 'arrows shot'),
      stat('Streak', streak, streak === 1 ? 'week running' : 'weeks running')
    ]);
    root.appendChild(grid);

    if (weekTarget) {
      var pct = Math.min(100, Math.round(thisWeek / weekTarget * 100));
      root.appendChild(card([
        h('div', { class: 'card-head' }, [
          h('h3', { text: 'This week against the plan' }), h('div', { class: 'spacer' }),
          h('strong', { text: pct + '%' })
        ]),
        h('div', { class: 'bar-mini' }, [h('i', { class: pct >= 100 ? 'good' : '', style: 'width:' + pct + '%' })]),
        h('div', { class: 'hint', text: thisWeek + ' of ' + weekTarget + ' arrows. ' + (pct >= 100 ? 'Week complete — nicely done.' : (weekTarget - thisWeek) + ' to go.') })
      ], 'tight'));
    }

    /* --- next planned session --- */
    if (plan) {
      var next = plan.sessions.filter(function (x) { return x.date >= todayISO; })[0];
      if (next) {
        var doneToday = Store.arrowsOn(next.date) > 0;
        root.appendChild(card([
          cardHead(next.date === todayISO ? "Today's session" : 'Next session',
            h('span', { class: 'tag ' + (next.phase === 'taper' ? 'taper' : 'volume'), text: next.phase })),
          h('div', { style: 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap' }, [
            h('strong', { style: 'font-size:1.5rem;font-variant-numeric:tabular-nums', text: next.arrows + ' arrows' }),
            h('span', { class: 'muted', text: next.sets || '' })
          ]),
          h('div', { class: 'muted', style: 'margin-top:2px', text: next.title + ' · ' + D.fmtLong(next.date) }),
          h('div', { class: 'ps-focus', text: next.focus }),
          doneToday ? h('div', { class: 'tag volume', text: 'Logged ' + Store.arrowsOn(next.date) + ' arrows' })
            : h('div', { class: 'btn-row' }, [
              h('button', { class: 'btn primary', onclick: function () { ctx.go('log', { prefill: next }); } }, ['Log this session']),
              h('button', { class: 'btn', onclick: function () { ctx.go('plan'); } }, ['See the whole plan'])
            ])
        ]));
      }
    }

    /* --- charts --- */
    var from = D.iso(D.addDays(D.today(), -41));
    var series = Store.dailySeries(from, D.iso(D.addDays(D.today(), 7)));
    var planByDate = {};
    if (plan) plan.sessions.forEach(function (p) { planByDate[p.date] = p.arrows; });
    var compByDate = {};
    ctx.state.competitions.forEach(function (c) { compByDate[c.date] = true; });
    series.forEach(function (d) { d.planned = planByDate[d.date] || 0; d.comp = !!compByDate[d.date]; });

    var dailyHost = h('div', { class: 'chart-wrap' });
    root.appendChild(card([
      cardHead('Arrows per day', h('small', { class: 'faint', text: 'last 6 weeks + plan ahead' })),
      dailyHost,
      h('div', { class: 'legend' }, [
        h('span', {}, [h('i', { class: 'swatch', style: 'background:var(--accent)' }), 'shot']),
        h('span', {}, [h('i', { class: 'swatch', style: 'background:var(--green)' }), 'hit the plan']),
        h('span', {}, [h('i', { class: 'swatch', style: 'background:var(--text-faint);opacity:.35' }), 'planned']),
        h('span', {}, [h('i', { class: 'swatch', style: 'background:var(--gold)' }), 'competition'])
      ])
    ]));
    Charts.responsive(dailyHost, function () { Charts.daily(dailyHost, series); });

    var weeks = Store.weeklySeries(10);
    if (plan) {
      var planWeek = {};
      plan.weeks.forEach(function (w) { planWeek[w.key] = w.arrows; });
      weeks.forEach(function (w) { w.planned = planWeek[w.start] || 0; });
    }
    var weeklyHost = h('div', { class: 'chart-wrap' });
    root.appendChild(card([cardHead('Weekly volume', h('small', { class: 'faint', text: 'last 10 weeks' })), weeklyHost]));
    Charts.responsive(weeklyHost, function () { Charts.weekly(weeklyHost, weeks); });

    if (lifetime > 0) {
      var allFrom = ctx.state.sessions.length ? ctx.state.sessions[0].date : todayISO;
      var cumHost = h('div', { class: 'chart-wrap' });
      root.appendChild(card([cardHead('Cumulative arrows', h('small', { class: 'faint', text: 'since you started logging' })), cumHost]));
      Charts.responsive(cumHost, function () { Charts.cumulative(cumHost, Store.dailySeries(allFrom, todayISO)); });
    }

    /* --- training load --- */
    var lr = Store.loadRatio();
    var gaugeHost = h('div', { class: 'chart-wrap' });
    root.appendChild(card([
      cardHead('Training load', h('small', { class: 'faint', text: 'acute vs chronic' })),
      gaugeHost,
      h('div', { class: 'hint', html: lr.ratio == null
        ? 'Log a few more weeks and this will tell you whether you are ramping up too fast.'
        : '<b>' + esc(lr.verdict) + '</b> — you shot <b>' + lr.acute + '</b> arrows this week against a 4-week average of <b>' + lr.chronic + '</b>. Staying between 0.8 and 1.3 is the usual advice for keeping shoulders healthy.' })
    ]));
    Charts.responsive(gaugeHost, function () { Charts.gauge(gaugeHost, lr.ratio); });

    /* --- recent sessions --- */
    var recent = ctx.state.sessions.slice(-8).reverse();
    root.appendChild(card([
      cardHead('Recent sessions', recent.length ? h('button', { class: 'btn ghost sm', onclick: function () { ctx.go('log'); } }, ['Add']) : null),
      recent.length ? h('ul', { class: 'list' }, recent.map(function (x) { return sessionRow(x, ctx); }))
        : empty('Nothing logged yet.', 'Head to the Log tab and type "65 arrows in sets of 4 today".')
    ]));
  };

  function sessionRow(x, ctx) {
    var bits = [];
    if (x.setSize) bits.push('sets of ' + x.setSize);
    if (x.distance) bits.push(x.distance + 'm');
    if (x.minutes) bits.push(x.minutes + ' min');
    if (x.score) bits.push('scored ' + x.score.total + (x.score.outOf ? '/' + x.score.outOf : ''));
    if (x.rpe) bits.push('RPE ' + x.rpe);
    return h('li', {}, [
      h('div', { class: 'when', text: D.fmtShort(x.date) }),
      h('div', { class: 'main' }, [
        h('div', { class: 'title' }, [
          h('span', { class: 'tag ' + x.type, text: TYPE_LABEL[x.type] || x.type }),
          h('span', { text: ' ' + (x.notes || '') })
        ]),
        bits.length ? h('div', { class: 'meta', text: bits.join(' · ') }) : null
      ]),
      h('div', { class: 'amt', text: x.arrows }),
      h('button', {
        class: 'btn ghost sm', title: 'Edit', 'aria-label': 'Edit session',
        onclick: function () { ctx.editSession(x); }
      }, ['⋯'])
    ]);
  }

  /* =========================================================
     LOG
     ========================================================= */
  Views.log = function (root, ctx) {
    clear(root);
    var st = ctx.state;
    var prefill = ctx.pending && ctx.pending.prefill;
    ctx.pending = null;

    /* --- quick natural-language entry --- */
    var input = h('input', {
      type: 'text', id: 'quickInput', placeholder: '65 arrows in sets of 4 today',
      autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      'aria-label': 'Describe your practice'
    });
    var echo = h('div', { class: 'echo' });
    var parsed = null;

    function refresh() {
      var v = input.value.trim();
      if (!v) { clear(echo); parsed = null; return; }
      parsed = Parse.parse(v, { today: D.today() });
      clear(echo);
      if (parsed.arrows == null) {
        echo.appendChild(h('span', { class: 'faint', text: 'Tell me how many arrows and I will log it.' }));
        return;
      }
      echo.appendChild(h('span', { html: '<b>' + esc(D.fmtLong(parsed.date)) + '</b>' }));
      echo.appendChild(h('span', { class: 'pill', text: Parse.describe(parsed) }));
      if (parsed.type) echo.appendChild(h('span', { class: 'tag ' + parsed.type, text: TYPE_LABEL[parsed.type] || parsed.type }));
      if (parsed.notes) echo.appendChild(h('span', { class: 'faint', text: '“' + parsed.notes + '”' }));
    }

    function submit() {
      var v = input.value.trim();
      if (!v) return;
      var p = Parse.parse(v, { today: D.today() });
      if (p.arrows == null) { ctx.toast('I could not find an arrow count in that.'); return; }
      if (p.arrows <= 0) { ctx.toast('That works out to zero arrows.'); return; }
      if (!p.setSize) p.setSize = st.settings.defaultSetSize;
      if (!p.distance) p.distance = st.settings.defaultDistance;
      Store.addSession(p);
      input.value = '';
      clear(echo);
      ctx.toast('Logged ' + p.arrows + ' arrows on ' + D.fmtShort(p.date));
      ctx.render();
    }

    input.addEventListener('input', refresh);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

    var examples = ['65 arrows in sets of 4 today', '12 ends of 6 at 18m', '80 arrows 2h scoring 545/600', 'yesterday 50 arrows felt flat'];
    root.appendChild(card([
      cardHead('Quick log'),
      h('div', { class: 'quick' }, [input, h('button', { class: 'btn primary', onclick: submit }, ['Log'])]),
      echo,
      h('div', { class: 'examples' }, examples.map(function (ex) {
        return h('button', { onclick: function () { input.value = ex; refresh(); input.focus(); } }, [ex]);
      })),
      h('div', { class: 'hint', text: 'Plain English works: dates ("yesterday", "sep 15", "thu"), sets ("sets of 4", "12 ends of 6"), distance, time, RPE and scores are all picked up automatically.' })
    ]));

    /* --- detailed form --- */
    var f = {};
    function field(label, node, key) { f[key] = node; return h('div', { class: 'field' }, [h('label', { text: label }), node]); }

    var dateI = h('input', { type: 'date', value: prefill ? prefill.date : D.iso(D.today()) });
    var arrowsI = h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', value: prefill ? prefill.arrows : '' });
    var setI = h('input', { type: 'number', min: '1', step: '1', inputmode: 'numeric', value: st.settings.defaultSetSize });
    var minI = h('input', { type: 'number', min: '0', step: '5', inputmode: 'numeric', value: prefill ? prefill.minutes : st.settings.sessionMinutes });
    var distI = h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', value: prefill ? prefill.distance : st.settings.defaultDistance });
    var typeI = h('select', {}, ['volume', 'form', 'scoring', 'spt', 'tune'].map(function (t) {
      return h('option', { value: t, selected: prefill && prefill.template === t ? true : null, text: TYPE_LABEL[t] });
    }));
    var rpeI = h('select', {}, [h('option', { value: '', text: '—' })].concat([1, 2, 3, 4, 5].map(function (n) {
      return h('option', { value: n, text: n + ' · ' + ['very easy', 'easy', 'moderate', 'hard', 'maximal'][n - 1] });
    })));
    var scoreI = h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', placeholder: 'e.g. 545' });
    var outOfI = h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', placeholder: 'e.g. 600' });
    var roundI = h('input', { type: 'text', placeholder: 'e.g. Portsmouth, WA 18' });
    var notesI = h('textarea', { placeholder: 'How did it feel? Anything you changed?' });

    root.appendChild(card([
      cardHead('Or fill it in', h('small', { class: 'faint', text: 'more detail' })),
      h('div', { class: 'row' }, [field('Date', dateI, 'date'), field('Arrows', arrowsI, 'arrows')]),
      h('div', { class: 'row-3' }, [field('Set size', setI, 'set'), field('Minutes', minI, 'min'), field('Distance (m)', distI, 'dist')]),
      h('div', { class: 'row' }, [field('Session type', typeI, 'type'), field('How hard (RPE)', rpeI, 'rpe')]),
      h('div', { class: 'row-3' }, [field('Score', scoreI, 'score'), field('Out of', outOfI, 'outOf'), field('Round', roundI, 'round')]),
      field('Notes', notesI, 'notes'),
      h('div', { class: 'btn-row' }, [
        h('button', {
          class: 'btn primary', onclick: function () {
            var n = parseInt(arrowsI.value, 10);
            if (!n || n <= 0) { ctx.toast('How many arrows?'); arrowsI.focus(); return; }
            Store.addSession({
              date: dateI.value, arrows: n, setSize: setI.value, minutes: minI.value,
              distance: distI.value, type: typeI.value, rpe: rpeI.value,
              score: scoreI.value ? { total: scoreI.value, outOf: outOfI.value || null, round: roundI.value } : null,
              notes: notesI.value
            });
            arrowsI.value = ''; scoreI.value = ''; outOfI.value = ''; notesI.value = '';
            ctx.toast('Logged ' + n + ' arrows');
            ctx.render();
          }
        }, ['Save session'])
      ])
    ]));

    /* --- history --- */
    var all = st.sessions.slice().reverse();
    root.appendChild(card([
      cardHead('History', h('small', { class: 'faint', text: all.length + ' session' + (all.length === 1 ? '' : 's') })),
      all.length ? h('ul', { class: 'list' }, all.slice(0, 60).map(function (x) { return sessionRow(x, ctx); }))
        : empty('No sessions yet.')
    ]));

    setTimeout(function () { if (!prefill) input.focus(); }, 60);
  };

  /* ---------- season overview, drawn at the top of the Plan tab ---------- */
  function renderSeason(root, ctx) {
    var st = ctx.state;
    var season = ctx.season;
    if (!season) return;
    var todayISO = D.iso(D.today());
    var adh = Season.adherence(season, st.sessions);
    var thisWeek = adh.filter(function (a) { return a.current; })[0];

    var name = st.settings.seasonName || 'This season';
    root.appendChild(card([
      h('div', { class: 'label', text: 'SEASON PLAN' }),
      h('h2', { text: name }),
      h('div', { class: 'sub', text: D.fmtShort(season.from) + ' \u2192 ' + D.fmtShort(season.to) + ' \u00b7 ' + season.weeks.length + ' weeks' }),
      h('div', { style: 'margin-top:10px' }, [
        h('div', { class: 'kv' }, [h('span', { class: 'k', text: 'Competitions' }), h('span', { class: 'v', text: season.competitions.length })]),
        h('div', { class: 'kv' }, [h('span', { class: 'k', text: 'Starting at' }), h('span', { class: 'v', text: season.startWeekly + ' arrows / week' })]),
        h('div', { class: 'kv' }, [h('span', { class: 'k', text: 'Peak' }), h('span', { class: 'v', text: season.reaches + ' arrows / week' })]),
        h('div', { class: 'kv' }, [h('span', { class: 'k', text: 'Season total' }), h('span', { class: 'v', text: season.totalArrows.toLocaleString() + ' arrows' })]),
        thisWeek ? h('div', { class: 'kv' }, [
          h('span', { class: 'k', text: 'This week' }),
          h('span', { class: 'v', text: thisWeek.actual + ' of ' + thisWeek.target + (thisWeek.pct != null ? ' \u00b7 ' + thisWeek.pct + '%' : '') })
        ]) : null
      ])
    ], 'countdown'));

    if (thisWeek) {
      var w = season.weeks.filter(function (x) { return x.start === thisWeek.start; })[0];
      var pctv = Math.min(100, thisWeek.pct || 0);
      root.appendChild(card([
        h('div', { class: 'card-head' }, [
          h('h3', { text: 'This week' }),
          h('div', { class: 'spacer' }),
          h('span', { class: 'tag ' + phaseTag(w.phase), text: w.phase })
        ]),
        h('div', { style: 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap' }, [
          h('strong', { style: 'font-size:1.6rem;font-variant-numeric:tabular-nums', text: thisWeek.actual + ' / ' + thisWeek.target }),
          h('span', { class: 'muted', text: w.split ? 'suggested ' + w.split.days + ' \u00d7 ' + w.split.perSession : 'competition schedule' })
        ]),
        h('div', { class: 'bar-mini' }, [h('i', { class: pctv >= 100 ? 'good' : '', style: 'width:' + pctv + '%' })]),
        h('div', { class: 'hint', text: w.note })
      ], 'tight'));
    }

    var seasonHost = h('div', { class: 'chart-wrap' });
    root.appendChild(card([
      cardHead('Weekly volume across the season', h('small', { class: 'faint', text: 'planned vs actual' })),
      seasonHost,
      h('div', { class: 'legend' }, [
        h('span', {}, [h('i', { class: 'swatch', style: 'background:var(--accent)' }), 'shot']),
        h('span', {}, [h('i', { class: 'swatch', style: 'background:var(--text-faint);opacity:.35' }), 'planned']),
        h('span', {}, [h('i', { class: 'swatch', style: 'background:var(--gold)' }), 'competition'])
      ])
    ]));
    var actualByWeek = {};
    st.sessions.forEach(function (x) {
      var k = D.iso(D.weekStart(D.parseISO(x.date)));
      actualByWeek[k] = (actualByWeek[k] || 0) + x.arrows;
    });
    Charts.responsive(seasonHost, function () {
      Charts.weekly(seasonHost, season.weeks.map(function (w) {
        return {
          key: w.start, start: w.start, label: D.fmtShort(w.start),
          arrows: actualByWeek[w.start] || 0, planned: w.target,
          phase: w.comps.length ? 'comp' : (w.phase === 'taper' || w.phase === 'recover' ? 'taper' : w.phase)
        };
      }), { height: 230 });
    });

    if (season.advice && season.advice.length) {
      root.appendChild(h('div', { class: 'banner' }, [
        h('strong', { text: 'How to read this' }),
        h('div', { style: 'margin-top:5px' }, season.advice.map(function (a) {
          return h('p', { style: 'margin:0 0 7px', text: a });
        }))
      ]));
    }

    /* week-by-week sheet */
    root.appendChild(card([
      cardHead('Week by week', h('button', {
        class: 'btn ghost sm', onclick: function () { ctx.download('season-plan.csv', seasonCSV(season, actualByWeek), 'text/csv'); }
      }, ['Export CSV'])),
      h('div', { class: 'table-wrap' }, [h('table', { class: 'sheet' }, [
        h('thead', {}, [h('tr', {}, ['Week', 'Target', 'Suggested', 'Phase', 'Actual', ''].map(function (x) { return h('th', { text: x }); }))]),
        h('tbody', {}, season.weeks.map(function (w) {
          var actual = actualByWeek[w.start] || 0;
          var isNow = w.start <= todayISO && w.end >= todayISO;
          var past = w.end < todayISO;
          return h('tr', {
            style: (isNow ? 'background:var(--accent-soft)' : past ? 'opacity:.6' : '') + ';cursor:default'
          }, [
            h('td', { html: '<b>' + esc(D.fmtShort(w.start)) + '</b>' }),
            h('td', { class: 'num', html: '<b>' + w.target + '</b>' }),
            h('td', { class: 'num', text: w.split ? w.split.days + '\u00d7' + w.split.perSession : '\u2014' }),
            h('td', {}, [h('span', { class: 'tag ' + phaseTag(w.phase), text: w.phase })]),
            h('td', { class: 'num', text: past || isNow ? actual : '' }),
            h('td', { text: w.comps.map(function (c) { return c.name; }).join(', ') })
          ]);
        }))
      ])])
    ]));
  }

  function phaseTag(p) {
    return p === 'comp' ? 'comp' : p === 'taper' || p === 'recover' ? 'taper'
      : p === 'peak' ? 'scoring' : p === 'offseason' ? 'tune' : 'volume';
  }

  function seasonCSV(season, actualByWeek) {
    var head = ['week_start', 'week_end', 'phase', 'target_arrows', 'suggested_days', 'suggested_per_session', 'actual_arrows', 'competitions'];
    var rows = season.weeks.map(function (w) {
      return [w.start, w.end, w.phase, w.target, w.split ? w.split.days : '', w.split ? w.split.perSession : '',
        actualByWeek[w.start] || 0, '"' + w.comps.map(function (c) { return c.name; }).join('; ') + '"'].join(',');
    });
    return [head.join(',')].concat(rows).join('\n');
  }

  /* =========================================================
     PLAN
     ========================================================= */
  Views.plan = function (root, ctx) {
    clear(root);
    var st = ctx.state, plan = ctx.plan;
    var todayISO = D.iso(D.today());
    var comp = Store.nextCompetition();

    renderSeason(root, ctx);

    if (!comp) {
      root.appendChild(card([
        cardHead('No competition set'),
        h('p', { class: 'muted', text: 'The plan works backwards from your next competition. Add one and a schedule appears here.' }),
        h('button', { class: 'btn primary', onclick: function () { ctx.addCompetition(); } }, ['Add a competition'])
      ]));
      return renderCompList(root, ctx);
    }
    if (!plan || !plan.sessions.length) {
      root.appendChild(card([
        cardHead('Nothing to plan'),
        h('p', { class: 'muted', text: 'Either the competition has passed, or no practice days fall between now and then. Check your practice days under the You tab.' })
      ]));
      return renderCompList(root, ctx);
    }

    var adh = Plan.adherence(plan, st.sessions);
    var remaining = plan.sessions.filter(function (x) { return x.date >= todayISO; });
    var remainingArrows = remaining.reduce(function (n, x) { return n + (x.arrows || 0); }, 0);

    root.appendChild(card([
      h('div', { class: 'label', text: 'PLAN TOWARD' }),
      h('h2', { text: comp.name }),
      h('div', { class: 'sub', text: D.fmtLong(comp.date) }),
      h('div', { style: 'margin-top:10px' }, [
        h('div', { class: 'kv' }, [h('span', { class: 'k', text: 'Sessions left' }), h('span', { class: 'v', text: remaining.length })]),
        h('div', { class: 'kv' }, [h('span', { class: 'k', text: 'Arrows left' }), h('span', { class: 'v', text: remainingArrows.toLocaleString() })]),
        h('div', { class: 'kv' }, [h('span', { class: 'k', text: 'Peak session' }), h('span', { class: 'v', text: plan.peak + ' arrows' })]),
        h('div', { class: 'kv' }, [h('span', { class: 'k', text: 'Taper begins' }), h('span', { class: 'v', text: D.fmtShort(plan.taperStart) })]),
        adh.sessionsPlanned ? h('div', { class: 'kv' }, [
          h('span', { class: 'k', text: 'Stuck to it so far' }),
          h('span', { class: 'v', text: adh.sessionsDone + '/' + adh.sessionsPlanned + ' sessions · ' + (adh.arrowPct != null ? adh.arrowPct + '% of arrows' : '—') })
        ]) : null
      ])
    ], 'countdown'));

    if (plan.advice && plan.advice.length) {
      root.appendChild(h('div', { class: 'banner' }, [
        h('strong', { text: 'Before you start' }),
        h('div', { style: 'margin-top:5px' }, plan.advice.map(function (a) { return h('p', { style: 'margin:0 0 6px', text: a }); }))
      ]));
    }

    /* weekly shape */
    var weekHost = h('div', { class: 'chart-wrap' });
    root.appendChild(card([
      cardHead('The shape of it', h('small', { class: 'faint', text: 'planned arrows per week' })),
      weekHost,
      h('div', { class: 'hint', text: 'Volume climbs, then drops away into the competition. The drop is deliberate — you arrive rested, not tired.' })
    ]));
    Charts.responsive(weekHost, function () {
      Charts.weekly(weekHost, plan.weeks.map(function (w) {
        return { key: w.key, start: w.key, label: D.fmtShort(w.key), arrows: w.arrows, phase: w.phase };
      }));
    });

    /* session list */
    var listCard = card([cardHead('Every session', h('small', { class: 'faint', text: 'tap to open' }))]);
    var nextFound = false;
    plan.sessions.forEach(function (ps) {
      var actual = Store.arrowsOn(ps.date);
      var isPast = ps.date < todayISO;
      var isNext = !nextFound && ps.date >= todayISO;
      if (isNext) nextFound = true;
      var done = actual > 0;

      var body = h('div', { class: 'ps-body', hidden: !isNext ? 'hidden' : null }, [
        h('div', { class: 'ps-focus', text: ps.focus }),
        h('ul', { class: 'blocks' }, ps.blocks.map(function (b) {
          return h('li', {}, [h('span', { class: 'm', text: b.minutes ? b.minutes + ' min' : '' }), h('span', { text: b.what })]);
        })),
        h('div', { class: 'btn-row', style: 'margin-top:12px' }, [
          done ? h('span', { class: 'tag volume', text: 'Logged ' + actual + ' arrows' })
            : h('button', { class: 'btn primary sm', onclick: function () { ctx.go('log', { prefill: ps }); } }, ['Log this session']),
          h('button', {
            class: 'btn sm', onclick: function () { ctx.overrideArrows(ps); }
          }, ['Change the target'])
        ])
      ]);

      var head = h('button', {
        class: 'ps-head', 'aria-expanded': isNext ? 'true' : 'false',
        onclick: function () {
          var open = body.hasAttribute('hidden');
          if (open) body.removeAttribute('hidden'); else body.setAttribute('hidden', 'hidden');
          this.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
      }, [
        h('div', { class: 'ps-date', html: '<b>' + esc(D.dowName(ps.dow)) + '</b>' + esc(D.fmtShort(ps.date)) }),
        h('div', { class: 'ps-title' }, [
          h('div', { class: 't', text: ps.title }),
          h('div', { class: 's', text: (ps.sets || '') + (ps.overridden ? ' · adjusted' : '') })
        ]),
        h('div', { class: 'ps-arrows', html: esc(ps.arrows) + '<small>' + (done ? 'shot ' + actual : 'arrows') + '</small>' })
      ]);

      listCard.appendChild(h('div', {
        class: 'plan-session' + (isPast ? ' past' : '') + (isNext ? ' next' : '') + (done ? ' done' : '')
      }, [head, body]));
    });
    root.appendChild(listCard);

    renderCompList(root, ctx);
  };

  /* The Plan tab shows the same schedule table as the Calendar tab. */
  function renderCompList(root, ctx) {
    if (global.CompetitionList) { root.appendChild(global.CompetitionList(ctx)); return; }
  }
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  global.Views = Views;
  global.ViewUtil = { h: h, esc: esc, clear: clear, card: card, cardHead: cardHead, stat: stat, empty: empty, ordinal: ordinal, TYPE_LABEL: TYPE_LABEL, sessionRow: sessionRow };
  global.__wireDate = function (d) { D = d; };
})(window);
