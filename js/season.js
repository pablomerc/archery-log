/* season.js — a whole-season plan across several competitions.
   Plans in WEEKLY arrow totals rather than fixed sessions, because real weeks
   move around: 3x80 and 2x100+1x40 are the same week as far as your shoulder
   is concerned. Each week suggests a split, but the target is the number. */
(function (global) {
  'use strict';
  var D = null;

  /* Volume is capped by two separate things: how much you can do in one
     session, and how many days you can get to the range. Derive the split
     from the weekly target and let the archer shuffle it. */
  function split(weekly, opts) {
    var per = opts.maxPerSession, minD = opts.minDays, maxD = opts.maxDays;
    var days = Math.max(minD, Math.min(maxD, Math.ceil(weekly / per)));
    var each = Math.round(weekly / days / 5) * 5;
    return { days: days, perSession: each, actual: each * days };
  }

  var PHASE_NOTE = {
    base: 'Base. Get the extra day in your week before you get more arrows in a day.',
    build: 'Build. Volume climbs. Stop the week early if your form goes before the arrows do.',
    peak: 'Peak. This is as much as the plan ever asks for.',
    taper: 'Taper. Volume drops so you arrive fresh. Shoot scoring rounds, not fitness.',
    comp: 'Competition week. Light, sharp, and confident.',
    recover: 'Recovery. Deliberately easy. This is what lets the next block work.',
    hold: 'Hold. Same as last week \u2014 consolidating rather than climbing.',
    offseason: 'Season over. Volume comes down; this is the time to change something in your form.'
  };

  /**
   * generate({ from, to, competitions, startWeekly, maxWeekly, maxPerSession,
   *            minDays, maxDays, rampPerWeek })
   * competitions: [{ date, name, priority: 'A'|'B' }]
   */
  function generate(opts) {
    D = global.Store.date;
    opts = opts || {};
    var from = D.weekStart(D.parseISO(opts.from));
    var to = D.parseISO(opts.to);
    var comps = (opts.competitions || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var startWeekly = +opts.startWeekly || 120;
    var maxWeekly = +opts.maxWeekly || 300;
    var maxPerSession = +opts.maxPerSession || 100;
    var minDays = +opts.minDays || 2;
    var maxDays = +opts.maxDays || 3;
    var ramp = opts.rampPerWeek != null ? +opts.rampPerWeek : 0.06;
    var sp = { maxPerSession: maxPerSession, minDays: minDays, maxDays: maxDays };

    /* 1. lay out the weeks */
    var weeks = [];
    for (var d = new Date(from.getTime()); d <= to; d = D.addDays(d, 7)) {
      var start = D.iso(d), end = D.iso(D.addDays(d, 6));
      weeks.push({
        start: start, end: end,
        comps: comps.filter(function (c) { return c.date >= start && c.date <= end; }),
        phase: null, target: 0
      });
    }
    if (!weeks.length) return null;

    /* 2. mark competition weeks, and the weeks either side of the big ones */
    weeks.forEach(function (w, i) {
      if (!w.comps.length) return;
      w.phase = 'comp';
      var isA = w.comps.some(function (c) { return c.priority !== 'B'; });
      w.priority = isA ? 'A' : 'B';
      if (isA) {
        if (weeks[i - 1] && !weeks[i - 1].comps.length) weeks[i - 1].phase = 'taper';
        if (weeks[i + 1] && !weeks[i + 1].comps.length) weeks[i + 1].phase = 'recover';
      }
    });

    /* 3. work out the shape of the season before assigning any numbers.
          Volume has to peak BEFORE the competitions, not after them, and the
          dense competition stretch is for staying sharp, not for building. */
    var compIdx = weeks.map(function (w, i) { return w.comps.length ? i : -1; })
      .filter(function (i) { return i >= 0; });
    var lastCompWeek = compIdx.length ? compIdx[compIdx.length - 1] : weeks.length - 1;

    var trainingWeeks = weeks.filter(function (w, i) { return !w.phase && i < lastCompWeek; }).length;

    /* Pick the ramp that actually reaches the ceiling over the runway available,
       but never climb faster than is safe. If the runway is too short the plan
       simply gets as far as it gets, and says so. */
    var SAFE_RAMP = 0.08;
    var needed = trainingWeeks > 0 ? Math.pow(maxWeekly / startWeekly, 1 / trainingWeeks) - 1 : SAFE_RAMP;
    var useRamp = Math.min(opts.rampPerWeek != null ? +opts.rampPerWeek : SAFE_RAMP, Math.max(0, needed), SAFE_RAMP);
    var reaches = Math.round(Math.min(maxWeekly, startWeekly * Math.pow(1 + useRamp, trainingWeeks)) / 5) * 5;

    var level = startWeekly;
    var buildCount = 0;
    var windDown = 0;

    weeks.forEach(function (w, i) {
      if (w.phase === 'comp') {
        var compArrows = w.comps.reduce(function (n, c) { return n + (c.arrows || 60); }, 0);
        w.target = Math.round((compArrows + Math.min(60, level * 0.2)) / 5) * 5;
        /* No suggested split on a competition week: the schedule is the event's,
           not yours, and a "2 x 100" here reads as training advice it is not. */
        w.split = null;
        w.compArrows = compArrows;
        return;
      }
      if (w.phase === 'taper') { w.target = Math.round(level * 0.6 / 5) * 5; w.split = split(w.target, sp); return; }
      if (w.phase === 'recover') { w.target = Math.round(level * 0.7 / 5) * 5; w.split = split(w.target, sp); return; }

      if (i > lastCompWeek) {
        /* Season over. Come down rather than finishing on the biggest weeks
           you have ever shot, with nothing to use them for. */
        windDown++;
        w.phase = 'offseason';
        w.target = Math.round(Math.max(startWeekly, level * (windDown === 1 ? 0.7 : 0.55)) / 5) * 5;
        w.split = split(w.target, sp);
        return;
      }

      buildCount++;
      /* Every fourth build week holds flat: adaptation happens in the weeks
         you do not push. */
      if (buildCount % 4 === 0 && level > startWeekly) {
        w.phase = 'hold';
      } else {
        level = Math.min(maxWeekly, level * (1 + useRamp));
      }
      w.target = Math.round(level / 5) * 5;
      w.split = split(w.target, sp);
      if (!w.phase) w.phase = level >= maxWeekly - 1 ? 'peak' : (w.target < startWeekly * 1.35 ? 'base' : 'build');
    });

    /* 4. label and annotate */
    weeks.forEach(function (w) {
      w.note = PHASE_NOTE[w.phase] || '';
      w.label = D.fmtShort(w.start);
    });

    var total = weeks.reduce(function (n, w) { return n + w.target; }, 0);
    var peak = Math.max.apply(null, weeks.map(function (w) { return w.target; }));
    /* Report the volume the plan actually reaches, not the volume an
       uninterrupted ramp would have reached — hold weeks and the competitions
       themselves eat into it, and the advice must not overstate the plan. */
    var TRAINING = { base: 1, build: 1, peak: 1, hold: 1 };
    var trainingTargets = weeks.filter(function (w) { return TRAINING[w.phase]; })
      .map(function (w) { return w.target; });
    reaches = trainingTargets.length ? Math.max.apply(null, trainingTargets) : startWeekly;
    return {
      from: D.iso(from), to: D.iso(to), weeks: weeks, competitions: comps,
      peakWeekly: peak, totalArrows: total, rampPerWeek: useRamp, reaches: reaches,
      trainingWeeks: trainingWeeks, startWeekly: startWeekly, maxWeekly: maxWeekly,
      advice: advice(weeks, startWeekly, maxWeekly, maxPerSession, minDays, maxDays, useRamp, reaches, peak)
    };
  }

  function advice(weeks, startWeekly, maxWeekly, maxPerSession, minDays, maxDays, ramp, reaches, peak) {
    var out = [];
    out.push('The number that matters is the weekly total, not which days you shoot. ' +
      'Two sessions of 100 and one of 40 is the same week as three of 80 \u2014 take whichever fits your life.');
    out.push('Volume climbs about ' + Math.round(ramp * 1000) / 10 + '% a week, from ' + startWeekly +
      ' arrows a week to a peak of ' + reaches + '. The biggest weeks land in the gaps between championships, ' +
      'because once the competitions are stacked up there is no room left to build \u2014 only to stay sharp.');
    if (reaches < maxWeekly - 5) {
      out.push('This does not reach your ' + maxWeekly + '-a-week ceiling, and that is deliberate. Between the easy ' +
        'weeks, the tapers and the competitions themselves there are not enough clear weeks to climb that far ' +
        'safely. Treat ' + maxWeekly + ' as a target for next season.');
    }
    out.push('Every fourth week holds flat instead of climbing, the week before each championship drops to about ' +
      '60%, and the week after drops to 70%. Those easy weeks are not slack \u2014 they are when the training ' +
      'turns into form.');
    out.push('The ceiling is ' + maxPerSession + ' arrows in a session and ' + maxDays + ' days a week, and the plan ' +
      'never asks for more. If a week is going badly, cut the last session short rather than pushing through a ' +
      'shot that has already fallen apart.');
    return out;
  }

  /* How the actual weeks compare with the plan. */
  function adherence(season, sessions) {
    var byWeek = {};
    sessions.forEach(function (s) {
      var k = D.iso(D.weekStart(D.parseISO(s.date)));
      byWeek[k] = (byWeek[k] || 0) + s.arrows;
    });
    var today = D.iso(D.today());
    var past = season.weeks.filter(function (w) { return w.start <= today; });
    return past.map(function (w) {
      return {
        start: w.start, target: w.target, actual: byWeek[w.start] || 0,
        phase: w.phase,
        pct: w.target ? Math.round((byWeek[w.start] || 0) / w.target * 100) : null,
        current: w.start <= today && w.end >= today
      };
    });
  }

  global.Season = { generate: generate, adherence: adherence, split: split };
})(window);
