/* plan.js — builds a periodised training plan from now until a target competition.
   Model: gentle weekly volume ramp, undulating load inside each week, then a taper.
   Nothing here is sacred — every session's arrow count can be overridden by hand. */
(function (global) {
  'use strict';

  var D = null;  // Store.date, wired on first use

  /* Session templates. Each returns the shape of a session given its arrow target
     and how long the archer has on the line. */
  var TEMPLATES = {
    form: {
      title: 'Form & control',
      focus: 'Rebuild the shot from the ground up. Quality over count.',
      blocks: function (n, min, dist) {
        return [
          [12, 'Physical warm-up: shoulders, rotator cuff, band pulls'],
          [15, Math.round(n * 0.25) + ' arrows blank bale at 3m — eyes closed, feel the back tension'],
          [Math.max(10, min - 75), Math.round(n * 0.6) + ' arrows at ' + dist + 'm in your normal rhythm'],
          [15, Math.round(n * 0.15) + ' arrows — one arrow at a time, full routine, no rushing'],
          [10, 'Stretch. Write one sentence about what felt different.']
        ];
      }
    },
    volume: {
      title: 'Volume + SPT',
      focus: 'Biggest day of the week. Build the engine that holds your form together at the end of a round.',
      blocks: function (n, min, dist) {
        return [
          [12, 'Warm-up + 10 arrows close range'],
          [20, 'SPT: 3 sets of 3 × 30s holds at full draw (no release), 2 min rest between sets'],
          [Math.max(15, min - 82), Math.round(n * 0.75) + ' arrows at ' + dist + 'm, steady pace'],
          [25, Math.round(n * 0.25) + ' arrows — last third is the one that counts. Hold your routine when tired.'],
          [10, 'Cool down + stretch']
        ];
      }
    },
    scoring: {
      title: 'Scoring round',
      focus: 'Rehearse the competition, not just the shot. Score everything, including the bad ends.',
      blocks: function (n, min, dist) {
        return [
          [20, 'Full warm-up exactly as you would on competition day'],
          [Math.max(20, min - 60), Math.round(n * 0.85) + ' arrows scored at ' + dist + 'm — 4 min per end, write every end down'],
          [20, Math.round(n * 0.15) + ' arrows free shooting to finish on a good feeling'],
          [15, 'Log the score. What cost you the most points today?']
        ];
      }
    },
    sharpen: {
      title: 'Sharpening',
      focus: 'Volume comes down, precision goes up. You are no longer building fitness — you are banking confidence.',
      blocks: function (n, min, dist) {
        return [
          [15, 'Warm-up, unhurried'],
          [Math.max(15, min - 70), Math.round(n * 0.7) + ' arrows scored at ' + dist + 'm, competition timing'],
          [25, Math.round(n * 0.3) + ' arrows — shoot only when the shot feels right. Let down freely.'],
          [15, 'Mental rehearsal: walk through competition day start to finish']
        ];
      }
    },
    simulate: {
      title: 'Competition simulation',
      focus: 'Full dress rehearsal. Same warm-up, same timing, same kit you will use on the day.',
      blocks: function (n, min, dist) {
        return [
          [20, 'Competition warm-up routine — time it, you get the same on the day'],
          [Math.max(20, min - 55), n + ' arrows scored at ' + dist + 'm with full competition timing and scoring'],
          [20, 'Pack your kit for the competition while it is fresh. Use the checklist.'],
          [15, 'Stop. Do not "fix" anything you find today.']
        ];
      }
    },
    tuneup: {
      title: 'Tune-up (day before)',
      focus: 'Confirm, do not change. The goal is to arrive fresh and certain.',
      blocks: function (n, min, dist) {
        return [
          [15, 'Gentle warm-up'],
          [30, n + ' arrows at ' + dist + 'm — confirm sight mark, confirm nothing has moved'],
          [15, 'Equipment check: string, nocking point, limb bolts, spare nocks, spare string'],
          [10, 'Pack. Then leave the bow alone.']
        ];
      }
    },
    rest: {
      title: 'Rest',
      focus: 'Rest is part of the plan.',
      blocks: function () { return [[0, 'No shooting. Light stretching if you feel like it.']]; }
    }
  };

  /* Which template fills which slot of a build week (M / Th / Sat = 0 / 1 / 2). */
  var BUILD_SLOTS = ['form', 'volume', 'scoring'];
  var SLOT_LOAD = [1.0, 1.12, 0.92];       // undulating load inside the week

  function roundTo(n, step) {
    step = step || 1;
    return Math.max(step, Math.round(n / step) * step);
  }

  /* Rough ceiling on arrows a session can hold: ~15 min of warm-up, then
     a deliberate shot roughly every 45 s once you include walking to the target. */
  function timeCap(minutes) {
    return Math.max(12, Math.round((minutes - 15) * 0.8));
  }

  /**
   * generate({ from, to, practiceDays, baseArrows, sessionMinutes, rampPerWeek,
   *            maxArrows, distance, setSize, overrides })
   */
  function generate(opts) {
    D = global.Store.date;
    opts = opts || {};
    var from = opts.from ? D.parseISO(opts.from) : D.today();
    var to = opts.to ? D.parseISO(opts.to) : D.addDays(from, 28);
    var days = opts.practiceDays && opts.practiceDays.length ? opts.practiceDays.slice() : [1, 4, 6];
    var base = +opts.baseArrows || 55;
    var minutes = +opts.sessionMinutes || 120;
    var ramp = opts.rampPerWeek != null ? +opts.rampPerWeek : 0.08;
    var setSize = +opts.setSize || 4;
    var distance = opts.distance || 18;
    var overrides = opts.overrides || {};
    var cap = opts.maxArrows ? +opts.maxArrows : Math.min(Math.round(base * 1.7), timeCap(minutes));

    var runway = Math.max(0, Math.round((to - from) / 86400000));

    /* Taper length scales with how much runway there is. A three-week run-up
       cannot afford a ten-day taper; a three-month one should have more. */
    var taperDays = runway <= 10 ? Math.max(2, Math.round(runway * 0.25))
      : Math.min(14, Math.max(5, Math.round(runway * 0.3)));
    var taperStart = D.addDays(to, -taperDays);

    /* 1. enumerate every practice date in the window (competition day excluded) */
    var dates = [];
    for (var d = new Date(from.getTime()); d < to; d = D.addDays(d, 1)) {
      if (days.indexOf(d.getDay()) >= 0) dates.push(new Date(d.getTime()));
    }

    /* 2. group them into Monday-start weeks so slot roles are stable */
    var weeks = [];
    var wkIndex = {};
    dates.forEach(function (dt) {
      var k = D.iso(D.weekStart(dt));
      if (wkIndex[k] == null) { wkIndex[k] = weeks.length; weeks.push({ key: k, dates: [] }); }
      weeks[wkIndex[k]].dates.push(dt);
    });

    /* 3. build sessions */
    var sessions = [];
    var peak = base;

    weeks.forEach(function (wk, wi) {
      var weekTarget = base * Math.pow(1 + ramp, wi);
      wk.dates.forEach(function (dt, si) {
        var dISO = D.iso(dt);
        var isTaper = dt >= taperStart;
        var slot = si % BUILD_SLOTS.length;
        var arrows, tplKey;

        if (isTaper) {
          // Placeholder; taper volumes are assigned below once the peak is known.
          tplKey = 'sharpen';
          arrows = null;
        } else {
          arrows = roundTo(Math.min(weekTarget * SLOT_LOAD[slot], cap), setSize);
          tplKey = BUILD_SLOTS[slot];
          if (arrows > peak) peak = arrows;
        }

        sessions.push({
          date: dISO,
          dow: dt.getDay(),
          week: wi,
          slot: slot,
          phase: isTaper ? 'taper' : (wi === 0 ? 'base' : 'build'),
          template: tplKey,
          arrows: arrows,
          distance: distance,
          minutes: minutes
        });
      });
    });

    /* 4. assign taper volumes, indexed backwards from the competition so the
          last session before it is always the lightest */
    var taperSessions = sessions.filter(function (s) { return s.phase === 'taper'; });
    var CURVE_FROM_END = [0.35, 0.55, 0.75];      // last, second-last, third-last
    var TPL_FROM_END = ['tuneup', 'simulate', 'sharpen'];
    taperSessions.forEach(function (s, i) {
      var fromEnd = taperSessions.length - 1 - i;
      var frac = fromEnd < CURVE_FROM_END.length ? CURVE_FROM_END[fromEnd] : 0.85;
      var tpl = fromEnd < TPL_FROM_END.length ? TPL_FROM_END[fromEnd] : 'sharpen';
      s.arrows = roundTo(peak * frac, setSize);
      s.template = tpl;
    });

    /* 5. attach template detail + manual overrides */
    sessions.forEach(function (s) {
      if (overrides[s.date] != null) { s.arrows = +overrides[s.date]; s.overridden = true; }
      var tpl = TEMPLATES[s.template] || TEMPLATES.volume;
      s.title = tpl.title;
      s.focus = tpl.focus;
      s.blocks = tpl.blocks(s.arrows, s.minutes, s.distance).map(function (b) {
        return { minutes: b[0], what: b[1] };
      });
      s.sets = s.arrows && setSize ? Math.round(s.arrows / setSize) + ' sets of ' + setSize : null;
    });

    /* 6. weekly rollup */
    var byWeek = {};
    sessions.forEach(function (s) {
      var k = D.iso(D.weekStart(D.parseISO(s.date)));
      byWeek[k] = byWeek[k] || { key: k, arrows: 0, sessions: 0, taperCount: 0, phase: s.phase };
      byWeek[k].arrows += s.arrows || 0;
      byWeek[k].sessions++;
      if (s.phase === 'taper') byWeek[k].taperCount++;
    });
    Object.keys(byWeek).forEach(function (k) {
      var w = byWeek[k];
      // A week that merely contains the taper's first day is still a build week.
      w.phase = w.taperCount * 2 > w.sessions ? 'taper' : w.phase;
    });

    return {
      generatedAt: D.iso(D.today()),
      from: D.iso(from),
      to: D.iso(to),
      runwayDays: runway,
      taperStart: D.iso(taperStart),
      taperDays: taperDays,
      peak: peak,
      cap: cap,
      sessions: sessions,
      weeks: Object.keys(byWeek).sort().map(function (k) { return byWeek[k]; }),
      total: sessions.reduce(function (n, s) { return n + (s.arrows || 0); }, 0),
      /* Advice is about what is still ahead, not about the window the plan
         happens to span (which starts at the beginning of the current week). */
      advice: advice(
        Math.max(0, Math.round((to - D.today()) / 86400000)),
        sessions.filter(function (s) { return s.date >= D.iso(D.today()); }).length,
        base, peak
      )
    };
  }

  /* Honest framing so the plan isn't read as a promise. */
  function advice(runway, nSessions, base, peak) {
    var out = [];
    if (runway <= 0) { out.push('That competition is in the past — set a future one to build a plan.'); return out; }
    var weeks = runway / 7;
    if (weeks < 4) {
      out.push('Only ' + Math.round(weeks * 10) / 10 + ' weeks and ' + nSessions + ' sessions to work with. That is too short to gain real strength, so this plan is built around consistency and competition rehearsal rather than fitness. Expect to arrive sharp, not stronger.');
    } else if (weeks < 9) {
      out.push(Math.round(weeks) + ' weeks is a solid block. Volume climbs for the first two thirds, then backs off so you arrive fresh.');
    } else {
      out.push(Math.round(weeks) + ' weeks is a full preparation cycle. Treat the early weeks as base building — it is fine to be a little bored.');
    }
    if (peak > base * 1.5) {
      out.push('Peak sessions reach ' + peak + ' arrows, well above your current ' + base + '. Back off if your shoulder or your groups start complaining — the plan is a suggestion, your body is the authority.');
    }
    out.push('Miss a session? Do not double up the next one. Just carry on with the plan as written.');
    return out;
  }

  /* Compare what was planned with what was actually shot. */
  function adherence(plan, sessions) {
    var byDate = {};
    sessions.forEach(function (s) { byDate[s.date] = (byDate[s.date] || 0) + s.arrows; });
    var todayISO = global.Store.date.iso(global.Store.date.today());
    var past = plan.sessions.filter(function (s) { return s.date <= todayISO; });
    var done = past.filter(function (s) { return (byDate[s.date] || 0) > 0; });
    var plannedArrows = past.reduce(function (n, s) { return n + (s.arrows || 0); }, 0);
    var actualArrows = past.reduce(function (n, s) { return n + (byDate[s.date] || 0); }, 0);
    return {
      sessionsPlanned: past.length,
      sessionsDone: done.length,
      plannedArrows: plannedArrows,
      actualArrows: actualArrows,
      pct: past.length ? Math.round(done.length / past.length * 100) : null,
      arrowPct: plannedArrows ? Math.round(actualArrows / plannedArrows * 100) : null
    };
  }

  global.Plan = { generate: generate, adherence: adherence, TEMPLATES: TEMPLATES, timeCap: timeCap };
})(window);
