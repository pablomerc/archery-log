/* scores.js — arrow-by-arrow scorecards: the grid, a keypad editor, and the
   Scores tab. Cards live on sessions (session.card), so they sync and merge
   like everything else. */
(function (global) {
  'use strict';
  var U = global.ViewUtil, h = U.h, esc = U.esc, clear = U.clear, card = U.card, cardHead = U.cardHead, empty = U.empty;
  var D;
  global.__wireDate3 = function (d) { D = d; };

  var RING = { X: 'gold', '10': 'gold', '9': 'gold', '8': 'red', '7': 'red', '6': 'blue', '5': 'blue', '4': 'black', '3': 'black', '2': 'white', '1': 'white', M: 'miss' };

  function pct(t) { return t.outOf ? Math.round(t.score / t.outOf * 1000) / 10 : 0; }
  function xLabel(n) { return n + (n === 1 ? ' X' : " X's"); }

  /* ---------- the grid ----------
     Read-only by default. Pass onCell(endIdx, arrowIdx) and active {e, a}
     to make it an input surface. */
  function grid(c, opts) {
    opts = opts || {};
    var t = Store.cardTotals(c);
    var per = c.arrowsPerEnd;
    var head = [h('th', { text: 'End' })];
    for (var i = 0; i < per; i++) head.push(h('th', { text: String(i + 1), class: 'ar' }));
    head.push(h('th', { text: "X's" }), h('th', { text: 'End' }), h('th', { text: 'Run' }));

    var body = t.rows.map(function (r) {
      var cells = [h('td', { class: 'end-no', text: r.i + 1 })];
      r.a.forEach(function (v, ai) {
        var isActive = opts.active && opts.active.e === r.i && opts.active.a === ai;
        var cls = 'ar ring-' + (RING[v] || 'empty') + (isActive ? ' active' : '');
        if (opts.onCell) {
          cells.push(h('td', { class: cls }, [h('button', {
            type: 'button', class: 'cell', 'aria-label': 'End ' + (r.i + 1) + ' arrow ' + (ai + 1),
            onclick: function () { opts.onCell(r.i, ai); }
          }, [v || '·'])]));
        } else {
          cells.push(h('td', { class: cls, text: v || '·' }));
        }
      });
      cells.push(h('td', { class: 'xs', text: r.filled ? r.xs : '' }));
      cells.push(h('td', { class: 'tot', text: r.filled ? r.total : '' }));
      cells.push(h('td', { class: 'run', text: r.filled ? r.run : '' }));
      return h('tr', {}, cells);
    });

    var foot = h('tr', {}, [
      h('td', { colspan: String(per + 1), class: 'foot-label', text: 'Total' }),
      h('td', { class: 'xs', text: t.xs }),
      h('td', { class: 'tot', text: '' }),
      h('td', { class: 'run', text: t.score })
    ]);

    return h('table', { class: 'card-grid' + (opts.compact ? ' compact' : '') }, [
      h('thead', {}, [h('tr', {}, head)]),
      h('tbody', {}, body),
      h('tfoot', {}, [foot])
    ]);
  }

  function summaryLine(c) {
    var t = Store.cardTotals(c);
    var bits = [t.score + '/' + t.outOf, xLabel(t.xs), 'avg ' + t.avg.toFixed(2)];
    if (c.distance) bits.push(c.distance + 'm');
    return bits.join(' · ');
  }

  /* ---------- editor ---------- */
  function resize(c, ends, per) {
    var out = { arrowsPerEnd: per, ends: [], round: c.round, distance: c.distance, face: c.face };
    for (var e = 0; e < ends; e++) {
      var src = c.ends[e] ? c.ends[e].a : [];
      var a = [];
      for (var i = 0; i < per; i++) a.push(src[i] || '');
      out.ends.push({ a: a, xs: c.ends[e] && c.ends[e].xs != null && per === c.arrowsPerEnd ? c.ends[e].xs : null });
    }
    return out;
  }

  /**
   * openEditor(ctx, { session })       edit the card on an existing session
   * openEditor(ctx, { date })          start a new card for that day
   */
  function openEditor(ctx, opts) {
    opts = opts || {};
    var dlg = document.getElementById('dlg');
    var body = clear(document.getElementById('dlgBody'));
    var st = Store.get();
    var existing = opts.session || null;
    var c = existing && existing.card
      ? JSON.parse(JSON.stringify(existing.card))
      : { arrowsPerEnd: st.settings.defaultSetSize === 6 ? 6 : 3, ends: [], round: '', distance: st.settings.defaultDistance, face: '' };
    if (!c.ends.length) c = resize(c, 10, c.arrowsPerEnd);
    var active = { e: 0, a: 0 };
    // Start on the first empty cell, so re-opening a half-entered card resumes.
    (function () {
      for (var e = 0; e < c.ends.length; e++) for (var a = 0; a < c.arrowsPerEnd; a++) {
        if (!c.ends[e].a[a]) { active = { e: e, a: a }; return; }
      }
    })();

    var dateI = h('input', { type: 'date', value: existing ? existing.date : (opts.date || D.iso(D.today())) });
    var endsI = h('input', { type: 'number', min: '1', max: '40', inputmode: 'numeric', value: c.ends.length });
    var perI = h('select', {}, [3, 5, 6].map(function (n) { return h('option', { value: n, selected: c.arrowsPerEnd === n ? true : null, text: n }); }));
    var distI = h('input', { type: 'number', min: '1', inputmode: 'numeric', value: c.distance || '' });
    var roundI = h('input', { type: 'text', value: c.round || '', placeholder: 'e.g. Portsmouth, WA 18' });
    var totalI = h('input', { type: 'number', min: '0', inputmode: 'numeric', value: existing ? existing.arrows : '' , placeholder: 'incl. warm-up' });

    var gridHost = h('div', { class: 'card-scroll' });
    var footer = h('div', { class: 'card-summary' });

    function draw() {
      clear(gridHost).appendChild(grid(c, {
        active: active, compact: true,
        onCell: function (e, a) { active = { e: e, a: a }; draw(); }
      }));
      var t = Store.cardTotals(c);
      clear(footer).appendChild(h('div', { class: 'card-summary-inner' }, [
        h('strong', { text: t.score + ' / ' + t.outOf }),
        h('span', { class: 'muted', text: t.xs + " X's · avg " + t.avg.toFixed(2) + (t.complete ? '' : ' · ' + (t.ends * t.per - t.shot) + ' to go') })
      ]));
      var act = gridHost.querySelector('td.active');
      if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
    }

    function enter(v) {
      if (!c.ends[active.e]) return;
      c.ends[active.e].a[active.a] = v;
      c.ends[active.e].xs = null;           // hand tally no longer applies once edited
      if (v !== '') {
        if (active.a + 1 < c.arrowsPerEnd) active.a++;
        else if (active.e + 1 < c.ends.length) { active.e++; active.a = 0; }
      }
      draw();
    }
    function back() {
      if (c.ends[active.e] && c.ends[active.e].a[active.a]) { enter(''); return; }
      if (active.a > 0) active.a--;
      else if (active.e > 0) { active.e--; active.a = c.arrowsPerEnd - 1; }
      if (c.ends[active.e]) { c.ends[active.e].a[active.a] = ''; c.ends[active.e].xs = null; }
      draw();
    }

    var keys = Store.ARROW_VALUES.map(function (v) {
      return h('button', { type: 'button', class: 'key ring-' + RING[v], onclick: function () { enter(v); } }, [v]);
    });
    keys.push(h('button', { type: 'button', class: 'key key-back', 'aria-label': 'Delete', onclick: back }, ['⌫']));

    function reshape() {
      var ends = Math.max(1, Math.min(40, parseInt(endsI.value, 10) || 10));
      var per = parseInt(perI.value, 10) || 3;
      c = resize(c, ends, per);
      c.distance = distI.value ? +distI.value : null;
      c.round = roundI.value.trim();
      active = { e: Math.min(active.e, ends - 1), a: Math.min(active.a, per - 1) };
      draw();
    }
    endsI.addEventListener('change', reshape);
    perI.addEventListener('change', reshape);

    body.appendChild(h('div', { class: 'dlg-head' }, [
      h('h2', { text: existing && existing.card ? 'Edit scorecard' : 'New scorecard' }),
      h('button', { class: 'btn ghost sm', 'aria-label': 'Close', onclick: function () { dlg.close(); } }, ['×'])
    ]));
    body.appendChild(h('div', { class: 'row-3' }, [
      h('div', { class: 'field' }, [h('label', { text: 'Date' }), dateI]),
      h('div', { class: 'field' }, [h('label', { text: 'Ends' }), endsI]),
      h('div', { class: 'field' }, [h('label', { text: 'Arrows / end' }), perI])
    ]));
    body.appendChild(h('div', { class: 'row-3' }, [
      h('div', { class: 'field' }, [h('label', { text: 'Distance (m)' }), distI]),
      h('div', { class: 'field' }, [h('label', { text: 'Round name' }), roundI]),
      h('div', { class: 'field' }, [h('label', { text: 'Arrows that day' }), totalI])
    ]));
    body.appendChild(gridHost);
    body.appendChild(h('div', { class: 'keypad' }, keys));
    body.appendChild(footer);

    var attachSel = null;
    if (!existing) {
      // A scoring round is usually part of a bigger session. Offer to attach.
      var cands = st.sessions.filter(function (s) { return !s.card; });
      attachSel = h('select', {}, [h('option', { value: '', text: 'a new session' })].concat(cands.slice().reverse().slice(0, 30).map(function (s) {
        return h('option', { value: s.id, text: D.fmtShort(s.date) + ' — ' + s.arrows + ' arrows' + (s.notes ? ' · ' + s.notes.slice(0, 24) : '') });
      })));
      var sameDay = cands.filter(function (s) { return s.date === dateI.value; })[0];
      if (sameDay) attachSel.value = sameDay.id;
      dateI.addEventListener('change', function () {
        var m = cands.filter(function (s) { return s.date === dateI.value; })[0];
        attachSel.value = m ? m.id : '';
      });
      body.appendChild(h('div', { class: 'field', style: 'margin-top:10px' }, [h('label', { text: 'Attach to' }), attachSel]));
    }

    body.appendChild(h('div', { class: 'btn-row', style: 'margin-top:12px' }, [
      h('button', {
        class: 'btn primary', onclick: function () {
          c.distance = distI.value ? +distI.value : null;
          c.round = roundI.value.trim();
          var t = Store.cardTotals(c);
          if (!t.shot) { ctx.toast('Enter at least one arrow.'); return; }
          var scored = t.ends * t.per;
          var total = parseInt(totalI.value, 10);
          if (existing) {
            Store.updateSession(existing.id, {
              card: c, type: 'scoring', date: dateI.value,
              arrows: Math.max(total || 0, existing.arrows, scored),
              distance: c.distance || existing.distance
            });
          } else if (attachSel && attachSel.value) {
            var target = st.sessions.filter(function (s) { return s.id === attachSel.value; })[0];
            Store.updateSession(target.id, {
              card: c, type: 'scoring',
              arrows: Math.max(total || 0, target.arrows, scored),
              distance: c.distance || target.distance
            });
          } else {
            Store.addSession({
              date: dateI.value, arrows: Math.max(total || 0, scored), setSize: c.arrowsPerEnd,
              distance: c.distance, type: 'scoring', card: c, minutes: null
            });
          }
          dlg.close(); ctx.toast('Scorecard saved — ' + t.score + '/' + t.outOf); ctx.render();
        }
      }, ['Save scorecard']),
      h('button', { class: 'btn ghost', onclick: function () { dlg.close(); } }, ['Cancel'])
    ]));

    draw();
    if (!dlg.open) dlg.showModal();
  }

  /* ---------- read-only view of one card ---------- */
  function openCard(ctx, session) {
    var dlg = document.getElementById('dlg');
    var body = clear(document.getElementById('dlgBody'));
    var c = session.card;
    body.appendChild(h('div', { class: 'dlg-head' }, [
      h('div', {}, [
        h('h2', { text: D.fmtLong(session.date) }),
        h('div', { class: 'muted', style: 'font-size:.86rem', text: Store.roundLabel(c) + ' · ' + summaryLine(c) })
      ]),
      h('button', { class: 'btn ghost sm', 'aria-label': 'Close', onclick: function () { dlg.close(); } }, ['×'])
    ]));
    body.appendChild(h('div', { class: 'card-scroll tall' }, [grid(c)]));
    if (session.notes) body.appendChild(h('p', { class: 'muted', style: 'font-size:.88rem;margin-top:10px', text: session.notes }));
    body.appendChild(h('div', { class: 'btn-row', style: 'margin-top:12px' }, [
      h('button', { class: 'btn primary', onclick: function () { dlg.close(); openEditor(ctx, { session: session }); } }, ['Edit']),
      h('button', {
        class: 'btn danger', onclick: function () {
          dlg.close();
          ctx.confirm('Remove this scorecard?', 'The session (' + session.arrows + ' arrows) stays; only the arrow-by-arrow scores are removed.', function () {
            Store.updateSession(session.id, { card: null, score: null }); ctx.toast('Scorecard removed'); ctx.render();
          });
        }
      }, ['Remove']),
      h('button', { class: 'btn ghost', onclick: function () { dlg.close(); } }, ['Close'])
    ]));
    if (!dlg.open) dlg.showModal();
  }

  /* ---------- the Scores tab ---------- */
  function view(root, ctx) {
    clear(root);
    var cards = Store.scorecards();

    root.appendChild(card([
      cardHead('Scores', h('button', { class: 'btn primary sm', onclick: function () { openEditor(ctx, {}); } }, ['+ New scorecard'])),
      h('p', { class: 'muted', style: 'font-size:.9rem;margin:0', text: 'Every arrow of every scoring round, laid out like the paper card. Tap a row to see it in full.' })
    ], 'tight'));

    if (!cards.length) {
      root.appendChild(card([empty('No scorecards yet.', 'Press New scorecard and tap the arrows in as you shoot them.')]));
      return;
    }

    var totals = cards.map(function (s) { return { s: s, t: Store.cardTotals(s.card) }; });
    var best = totals.reduce(function (m, x) { return !m || pct(x.t) > pct(m.t) ? x : m; }, null);
    var latest = totals[totals.length - 1];
    var allShot = totals.reduce(function (n, x) { return n + x.t.shot; }, 0);
    var allScore = totals.reduce(function (n, x) { return n + x.t.score; }, 0);
    var allX = totals.reduce(function (n, x) { return n + x.t.xs; }, 0);

    root.appendChild(h('div', { class: 'stats' }, [
      U.stat('Best', best.t.score + '/' + best.t.outOf, D.fmtShort(best.s.date), 'accent'),
      U.stat('Latest', latest.t.score + '/' + latest.t.outOf, D.fmtShort(latest.s.date)),
      U.stat('Avg per arrow', allShot ? (allScore / allShot).toFixed(2) : '—', allShot + ' scored arrows'),
      U.stat("X's", allX, cards.length + ' card' + (cards.length === 1 ? '' : 's'))
    ]));

    if (cards.length >= 2) {
      var chartHost = h('div', { class: 'chart-wrap' });
      root.appendChild(card([
        cardHead('Score over time', h('small', { class: 'faint', text: '% of maximum, so different rounds compare' })),
        chartHost
      ]));
      Charts.responsive(chartHost, function () {
        Charts.scoreLine(chartHost, totals.map(function (x) { return { date: x.s.date, pct: pct(x.t), label: x.t.score + '/' + x.t.outOf }; }));
      });
    }

    root.appendChild(card([
      cardHead('All rounds', h('button', { class: 'btn ghost sm', onclick: function () { ctx.download('archery-scores.csv', Store.scoresCSV(), 'text/csv'); } }, ['Export CSV'])),
      h('div', { class: 'table-wrap' }, [h('table', { class: 'sheet' }, [
        h('thead', {}, [h('tr', {}, ['Date', 'Round', 'Score', '%', "X's", 'Avg', 'Best end'].map(function (x) { return h('th', { text: x }); }))]),
        h('tbody', {}, totals.slice().reverse().map(function (x) {
          return h('tr', { tabindex: '0', role: 'button', onclick: function () { openCard(ctx, x.s); },
            onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(ctx, x.s); } } }, [
            h('td', { text: D.fmtShort(x.s.date) }),
            h('td', { text: Store.roundLabel(x.s.card) + (x.s.card.distance ? ' · ' + x.s.card.distance + 'm' : '') }),
            h('td', { class: 'num', html: '<b>' + x.t.score + '</b><span class="faint">/' + x.t.outOf + '</span>' }),
            h('td', { class: 'num', text: pct(x.t) + '%' }),
            h('td', { class: 'num', text: x.t.xs }),
            h('td', { class: 'num', text: x.t.avg.toFixed(2) }),
            h('td', { class: 'num', text: x.t.best })
          ]);
        }))
      ])])
    ]));

    var pbs = Store.personalBests();
    root.appendChild(card([
      cardHead('Personal bests'),
      h('ul', { class: 'list' }, pbs.map(function (p) {
        return h('li', {}, [
          h('div', { class: 'main' }, [h('div', { class: 'title', text: p.round }), h('div', { class: 'meta', text: D.fmtLong(p.session.date) })]),
          h('div', { class: 'amt', text: p.session.score.total + (p.session.score.outOf ? '/' + p.session.score.outOf : '') + (p.session.score.xs ? ' · ' + p.session.score.xs + 'X' : '') })
        ]);
      }))
    ]));
  }

  global.Views.scores = view;
  global.Scores = { grid: grid, openEditor: openEditor, openCard: openCard, summaryLine: summaryLine, pct: pct };
})(window);
