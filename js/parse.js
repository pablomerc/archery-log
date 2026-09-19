/* parse.js — turns "65 arrows in sets of 4 today" into a session record.
   Deliberately forgiving: anything it can't read is left in notes. */
(function (global) {
  'use strict';

  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  var TYPE_WORDS = [
    ['form', /\b(blank bale|blankbale|bare bale|form|technique|drill|eyes closed)\b/],
    ['spt', /\b(spt|holds?|reversals?|strength|band work|bands?)\b/],
    ['scoring', /\b(scoring|scored|score|round|sim|simulation|comp pace|match|timed)\b/],
    ['tune', /\b(tun(e|ing)|bare ?shaft|walk ?back|sight ?mark|paper tune|group test)\b/]
  ];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }

  function parse(text, opts) {
    opts = opts || {};
    var now = opts.today || new Date();
    var base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    var out = {
      date: iso(base), arrows: null, setSize: null, minutes: null, distance: null,
      rpe: null, type: null, score: null, notes: '',
      matched: []   // which fields the parser actually found, for UI feedback
    };

    var rest = ' ' + String(text || '').toLowerCase().replace(/\s+/g, ' ').trim() + ' ';
    function eat(re, fn) {
      var m = rest.match(re);
      if (!m) return false;
      if (fn(m) === false) return false;
      rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
      return true;
    }

    /* ---- 1. date ---- */
    var gotDate =
      eat(/\b(today|tonight|this morning|this arvo|this afternoon|this evening)\b/, function () {
        out.date = iso(base); out.matched.push('date');
      }) ||
      eat(/\byesterday\b/, function () { out.date = iso(addDays(base, -1)); out.matched.push('date'); }) ||
      eat(/\b(\d{1,2}) days? ago\b/, function (m) { out.date = iso(addDays(base, -(+m[1]))); out.matched.push('date'); }) ||
      eat(/\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/, function (m) {
        out.date = iso(new Date(+m[1], +m[2] - 1, +m[3])); out.matched.push('date');
      }) ||
      eat(new RegExp('\\b(' + MONTHS.join('|') + ')[a-z]* (\\d{1,2})(?:st|nd|rd|th)?\\b'), function (m) {
        out.date = iso(resolvePast(base, MONTHS.indexOf(m[1]), +m[2])); out.matched.push('date');
      }) ||
      eat(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)? (' + MONTHS.join('|') + ')[a-z]*\\b'), function (m) {
        out.date = iso(resolvePast(base, MONTHS.indexOf(m[2]), +m[1])); out.matched.push('date');
      }) ||
      eat(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, function (m) {
        // Ambiguous d/m vs m/d — resolve using whichever yields a valid recent date.
        var a = +m[1], b = +m[2], y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : null;
        var monthFirst = a <= 12;
        var mo = monthFirst ? a - 1 : b - 1, day = monthFirst ? b : a;
        if (mo < 0 || mo > 11 || day < 1 || day > 31) return false;
        out.date = y ? iso(new Date(y, mo, day)) : iso(resolvePast(base, mo, day));
        out.matched.push('date');
      }) ||
      eat(new RegExp('\\b(?:last )?(' + DOW.join('|') + '|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)\\b'), function (m) {
        var idx = dowIndex(m[1]);
        if (idx < 0) return false;
        var d = new Date(base.getTime());
        while (d.getDay() !== idx) d = addDays(d, -1);   // most recent occurrence, today included
        out.date = iso(d); out.matched.push('date');
      });
    void gotDate;

    /* ---- 2. volume: ends/sets before plain arrow counts ---- */
    // "12 ends of 6", "12 x 6", "12 sets of 4"
    eat(/\b(\d{1,3})\s*(?:ends?|sets?|x|×)\s*(?:of\s*)?(\d{1,2})\b(?!\s*(?:m|meter|metre|yd|yard|min))/, function (m) {
      out.setSize = +m[2];
      out.arrows = (+m[1]) * (+m[2]);
      out.matched.push('arrows', 'setSize');
    }) ||
      // "sets of 4" / "ends of 6" with no count
      eat(/\b(?:in\s*)?(?:sets?|ends?|rounds?)\s*of\s*(\d{1,2})\b/, function (m) {
        out.setSize = +m[1]; out.matched.push('setSize');
      });

    // "6 dozen"
    if (out.arrows == null) {
      eat(/\b(\d{1,2})\s*doz(?:en)?\b/, function (m) { out.arrows = (+m[1]) * 12; out.matched.push('arrows'); });
    }

    /* ---- 3. time (before distance, so "90 min" isn't read as metres) ---- */
    eat(/\b(\d{1,2})\s*(?:h|hr|hrs|hour|hours)\s*(\d{1,2})\s*(?:m|min|mins|minutes?)\b/, function (m) {
      out.minutes = (+m[1]) * 60 + (+m[2]); out.matched.push('minutes');
    }) ||
      eat(/\b(\d{1,2}(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/, function (m) {
        out.minutes = Math.round(parseFloat(m[1].replace(',', '.')) * 60); out.matched.push('minutes');
      }) ||
      eat(/\b(\d{1,3})\s*(?:min|mins|minutes?)\b/, function (m) { out.minutes = +m[1]; out.matched.push('minutes'); });

    /* ---- 4. distance ---- */
    eat(/\b(?:at\s*)?(\d{1,3})\s*(?:m|meters?|metres?)\b/, function (m) { out.distance = +m[1]; out.matched.push('distance'); }) ||
      eat(/\b(?:at\s*)?(\d{1,3})\s*(?:yd|yds|yards?)\b/, function (m) { out.distance = Math.round(+m[1] * 0.9144); out.matched.push('distance'); });

    /* ---- 5. RPE / effort ---- */
    eat(/\brpe\s*:?\s*([1-5])\b/, function (m) { out.rpe = +m[1]; out.matched.push('rpe'); }) ||
      eat(/\bfelt\s*([1-5])\s*\/\s*5\b/, function (m) { out.rpe = +m[1]; out.matched.push('rpe'); });

    /* ---- 6. score ---- */
    eat(/\b(?:scored?|score)\s*:?\s*(\d{2,4})\s*(?:\/|out of)\s*(\d{2,4})\b/, function (m) {
      out.score = { total: +m[1], outOf: +m[2], round: '' }; out.matched.push('score');
    }) ||
      eat(/\b(\d{2,4})\s*\/\s*(\d{2,4})\b/, function (m) {
        if (+m[1] > +m[2]) return false;
        out.score = { total: +m[1], outOf: +m[2], round: '' }; out.matched.push('score');
      }) ||
      eat(/\b(?:scored?|score)\s*:?\s*(\d{2,4})\b/, function (m) {
        out.score = { total: +m[1], outOf: null, round: '' }; out.matched.push('score');
      });

    /* ---- 7. plain arrow count ---- */
    if (out.arrows == null) {
      eat(/\b(\d{1,4})\s*(?:arrows?|shots?|a)\b/, function (m) { out.arrows = +m[1]; out.matched.push('arrows'); });
    }
    if (out.arrows == null) {
      // A lone number is almost always the arrow count.
      eat(/\b(\d{1,4})\b/, function (m) { out.arrows = +m[1]; out.matched.push('arrows'); });
    }
    // "65 in sets of 4" — if we got a set size but derived nothing, keep them consistent.
    if (out.arrows != null && out.setSize && out.arrows < out.setSize) {
      out.arrows = out.arrows * out.setSize;
    }

    /* ---- 8. session type ---- */
    for (var i = 0; i < TYPE_WORDS.length; i++) {
      var hit = rest.match(TYPE_WORDS[i][1]);
      if (hit) {
        out.type = TYPE_WORDS[i][0];
        out.matched.push('type');
        rest = rest.replace(TYPE_WORDS[i][1], ' ');   // don't repeat it in notes
        break;
      }
    }
    if (!out.type) out.type = out.score ? 'scoring' : 'volume';

    /* ---- 9. leftovers become notes ---- */
    out.notes = rest
      .replace(/\b(in|of|at|for|and|the|with|on|did|shot|shooting|practice|session|arrows?|today)\b/g, ' ')
      .replace(/[^a-z0-9%+.,!'\- ]/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,.\-!]+|[\s,.\-]+$/g, '')
      .trim();
    if (out.notes.length < 3) out.notes = '';
    else out.notes = out.notes.charAt(0).toUpperCase() + out.notes.slice(1);

    return out;
  }

  function dowIndex(w) {
    var short = { mon: 1, tue: 2, tues: 2, wed: 3, weds: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6, sun: 0 };
    if (short[w] != null) return short[w];
    return DOW.indexOf(w);
  }

  // A bare month/day with no year: prefer the most recent past date, but accept
  // one up to 30 days ahead rather than jumping back a whole year.
  function resolvePast(base, monthIdx, day) {
    var d = new Date(base.getFullYear(), monthIdx, day);
    if (d <= base) return d;
    if ((d - base) / 86400000 <= 30) return d;
    return new Date(base.getFullYear() - 1, monthIdx, day);
  }

  // Human-readable echo of what was understood, shown under the input box.
  function describe(p) {
    var bits = [];
    if (p.arrows != null) bits.push(p.arrows + ' arrows');
    if (p.setSize) bits.push('sets of ' + p.setSize);
    if (p.distance) bits.push(p.distance + 'm');
    if (p.minutes) bits.push(p.minutes + ' min');
    if (p.score) bits.push('scored ' + p.score.total + (p.score.outOf ? '/' + p.score.outOf : ''));
    if (p.rpe) bits.push('RPE ' + p.rpe);
    return bits.join(' · ');
  }

  global.Parse = { parse: parse, describe: describe };
})(window);
