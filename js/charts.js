/* charts.js — small hand-rolled SVG charts. No library, so the app stays
   offline-capable and loads instantly on a phone. */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, text) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  /* Round the axis up to a friendly number. The steps are fine-grained enough
     that a max of 240 tops out at 250 rather than 500 — a coarse ladder wastes
     half the chart height on empty space. */
  function niceMax(v) {
    if (v <= 0) return 10;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var norm = v / mag;
    var steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < steps.length; i++) {
      if (norm <= steps[i] + 1e-9) return steps[i] * mag;
    }
    return 10 * mag;
  }

  function frame(host, height) {
    var w = Math.max(240, host.clientWidth || host.parentNode.clientWidth || 320);
    var h = height || 200;
    var svg = el('svg', {
      width: '100%', height: h, viewBox: '0 0 ' + w + ' ' + h,
      preserveAspectRatio: 'xMidYMid meet', role: 'img', class: 'chart'
    });
    return { svg: svg, w: w, h: h };
  }

  function axes(svg, x0, y0, x1, y1, max, ticks) {
    ticks = ticks || 4;
    var last = null;
    for (var i = 0; i <= ticks; i++) {
      var v = max * i / ticks;
      var y = y1 - (y1 - y0) * (i / ticks);
      svg.appendChild(el('line', {
        x1: x0, x2: x1, y1: y, y2: y,
        class: i === 0 ? 'grid grid-base' : 'grid'
      }));
      /* On a nearly empty chart the ticks round to the same number; drawing
         "1 1 1 0 0" up the axis looks broken, so only label real steps. */
      var label = Math.round(v);
      if (label === last) continue;
      last = label;
      svg.appendChild(el('text', { x: x0 - 6, y: y + 4, class: 'tick', 'text-anchor': 'end' }, label));
    }
  }

  /* Daily arrows, with planned volume as a ghost bar behind the actual. */
  function daily(host, data, opts) {
    opts = opts || {};
    host.innerHTML = '';
    var f = frame(host, opts.height || 210), svg = f.svg;
    var padL = 34, padR = 6, padT = 12, padB = 26;
    var x0 = padL, x1 = f.w - padR, y0 = padT, y1 = f.h - padB;

    var max = niceMax(Math.max(10, data.reduce(function (m, d) {
      return Math.max(m, d.arrows || 0, d.planned || 0);
    }, 0)));
    axes(svg, x0, y0, x1, y1, max);

    var n = data.length;
    var slot = (x1 - x0) / n;
    var bw = Math.max(2, Math.min(22, slot * 0.68));

    data.forEach(function (d, i) {
      var cx = x0 + slot * (i + 0.5);
      if (d.planned) {
        var ph = (d.planned / max) * (y1 - y0);
        svg.appendChild(el('rect', {
          x: cx - bw / 2, y: y1 - ph, width: bw, height: ph, rx: 2, class: 'bar-plan'
        }));
      }
      if (d.arrows) {
        var ah = (d.arrows / max) * (y1 - y0);
        var cls = 'bar-actual';
        if (d.planned && d.arrows >= d.planned) cls += ' bar-hit';
        var r = el('rect', { x: cx - bw / 2, y: y1 - ah, width: bw, height: ah, rx: 2, class: cls });
        r.appendChild(el('title', {}, Store.date.fmtShort(d.date) + ': ' + d.arrows + ' arrows' +
          (d.planned ? ' (planned ' + d.planned + ')' : '')));
        svg.appendChild(r);
      }
      if (d.comp) {
        svg.appendChild(el('line', { x1: cx, x2: cx, y1: y0, y2: y1, class: 'comp-line' }));
        svg.appendChild(el('circle', { cx: cx, cy: y0 + 3, r: 3.5, class: 'comp-dot' }));
      }
    });

    // x labels: as many as fit without colliding
    var maxLabels = Math.max(2, Math.floor((x1 - x0) / 54));
    var every = Math.max(1, Math.ceil(n / maxLabels));
    data.forEach(function (d, i) {
      if (i % every !== 0) return;
      if (i > n - 1 - every * 0.5) return;        // avoid crowding the right edge
      svg.appendChild(el('text', {
        x: x0 + slot * (i + 0.5), y: f.h - 8, class: 'tick', 'text-anchor': 'middle'
      }, Store.date.fmtShort(d.date)));
    });

    host.appendChild(svg);
  }

  /* Weekly totals as bars, with an optional target line. */
  function weekly(host, weeks, opts) {
    opts = opts || {};
    host.innerHTML = '';
    var f = frame(host, opts.height || 200), svg = f.svg;
    var padL = 34, padR = 6, padT = 12, padB = 26;
    var x0 = padL, x1 = f.w - padR, y0 = padT, y1 = f.h - padB;

    var max = niceMax(Math.max(10, weeks.reduce(function (m, w) {
      return Math.max(m, w.arrows || 0, w.planned || 0);
    }, 0)));
    axes(svg, x0, y0, x1, y1, max);

    var slot = (x1 - x0) / Math.max(1, weeks.length);
    var bw = Math.max(6, Math.min(44, slot * 0.6));
    var labelEvery = slot >= 54 ? 1 : slot >= 34 ? 2 : 3;

    weeks.forEach(function (w, i) {
      var cx = x0 + slot * (i + 0.5);
      if (w.planned) {
        var ph = (w.planned / max) * (y1 - y0);
        svg.appendChild(el('rect', { x: cx - bw / 2, y: y1 - ph, width: bw, height: ph, rx: 3, class: 'bar-plan' }));
      }
      var h = (w.arrows / max) * (y1 - y0);
      var r = el('rect', {
        x: cx - bw / 2, y: y1 - h, width: bw, height: Math.max(0, h), rx: 3,
        class: 'bar-actual' + (w.phase === 'taper' ? ' bar-taper' : '')
      });
      r.appendChild(el('title', {}, 'Week of ' + Store.date.fmtShort(w.start || w.key) + ': ' + w.arrows + ' arrows'));
      svg.appendChild(r);
      if (w.arrows > 0 && slot >= 30) {
        svg.appendChild(el('text', { x: cx, y: y1 - h - 5, class: 'bar-label', 'text-anchor': 'middle' }, w.arrows));
      }
      if (i % labelEvery === 0 || i === weeks.length - 1) {
        svg.appendChild(el('text', {
          x: cx, y: f.h - 8, class: 'tick',
          'text-anchor': i === weeks.length - 1 && slot < 54 ? 'end' : 'middle'
        }, w.label || Store.date.fmtShort(w.key)));
      }
    });

    host.appendChild(svg);
  }

  /* Cumulative arrows — an area chart that only ever goes up. Quietly motivating. */
  function cumulative(host, data, opts) {
    opts = opts || {};
    host.innerHTML = '';
    var f = frame(host, opts.height || 180), svg = f.svg;
    var padL = 42, padR = 8, padT = 12, padB = 26;
    var x0 = padL, x1 = f.w - padR, y0 = padT, y1 = f.h - padB;

    var run = 0;
    var pts = data.map(function (d, i) {
      run += d.arrows || 0;
      return { i: i, v: run, date: d.date };
    });
    var max = niceMax(Math.max(10, run));
    axes(svg, x0, y0, x1, y1, max);

    var sx = function (i) { return x0 + (x1 - x0) * (pts.length <= 1 ? 0.5 : i / (pts.length - 1)); };
    var sy = function (v) { return y1 - (y1 - y0) * (v / max); };

    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + sx(p.i).toFixed(1) + ' ' + sy(p.v).toFixed(1); }).join(' ');
    svg.appendChild(el('path', { d: line + ' L' + sx(pts.length - 1) + ' ' + y1 + ' L' + sx(0) + ' ' + y1 + ' Z', class: 'area' }));
    svg.appendChild(el('path', { d: line, class: 'line' }));

    var last = pts[pts.length - 1];
    if (last) {
      svg.appendChild(el('circle', { cx: sx(last.i), cy: sy(last.v), r: 3.5, class: 'line-dot' }));
    }
    [0, Math.floor(pts.length / 2), pts.length - 1].forEach(function (i) {
      if (!pts[i]) return;
      svg.appendChild(el('text', { x: sx(i), y: f.h - 8, class: 'tick', 'text-anchor': i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle' },
        Store.date.fmtShort(pts[i].date)));
    });
    host.appendChild(svg);
  }

  /* 7-day rolling average — smooths out the day-to-day noise. */
  function rolling(host, data, window_, opts) {
    opts = opts || {};
    window_ = window_ || 7;
    host.innerHTML = '';
    var f = frame(host, opts.height || 180), svg = f.svg;
    var padL = 34, padR = 8, padT = 12, padB = 26;
    var x0 = padL, x1 = f.w - padR, y0 = padT, y1 = f.h - padB;

    var vals = data.map(function (d, i) {
      var from = Math.max(0, i - window_ + 1), sum = 0;
      for (var j = from; j <= i; j++) sum += data[j].arrows || 0;
      return { i: i, v: sum, date: d.date };
    });
    var max = niceMax(Math.max(10, vals.reduce(function (m, p) { return Math.max(m, p.v); }, 0)));
    axes(svg, x0, y0, x1, y1, max);

    var sx = function (i) { return x0 + (x1 - x0) * (vals.length <= 1 ? 0.5 : i / (vals.length - 1)); };
    var sy = function (v) { return y1 - (y1 - y0) * (v / max); };
    var line = vals.map(function (p, i) { return (i ? 'L' : 'M') + sx(p.i).toFixed(1) + ' ' + sy(p.v).toFixed(1); }).join(' ');
    svg.appendChild(el('path', { d: line, class: 'line line-accent' }));

    [0, vals.length - 1].forEach(function (i) {
      if (!vals[i]) return;
      svg.appendChild(el('text', { x: sx(i), y: f.h - 8, class: 'tick', 'text-anchor': i === 0 ? 'start' : 'end' },
        Store.date.fmtShort(vals[i].date)));
    });
    host.appendChild(svg);
  }

  /* Score history as a percentage of the maximum, so a 300 round and a 600
     round sit on the same axis. */
  function scoreLine(host, points, opts) {
    opts = opts || {};
    host.innerHTML = '';
    var f = frame(host, opts.height || 190), svg = f.svg;
    var padL = 36, padR = 10, padT = 16, padB = 26;
    var x0 = padL, x1 = f.w - padR, y0 = padT, y1 = f.h - padB;

    var vals = points.map(function (p) { return p.pct; });
    var lo = Math.max(0, Math.floor((Math.min.apply(null, vals) - 4) / 5) * 5);
    var hi = Math.min(100, Math.ceil((Math.max.apply(null, vals) + 4) / 5) * 5);
    if (hi - lo < 10) { hi = Math.min(100, lo + 10); }

    for (var i = 0; i <= 4; i++) {
      var v = lo + (hi - lo) * i / 4;
      var y = y1 - (y1 - y0) * (i / 4);
      svg.appendChild(el('line', { x1: x0, x2: x1, y1: y, y2: y, class: i === 0 ? 'grid grid-base' : 'grid' }));
      svg.appendChild(el('text', { x: x0 - 6, y: y + 4, class: 'tick', 'text-anchor': 'end' }, Math.round(v) + '%'));
    }

    var sx = function (i) { return x0 + (x1 - x0) * (points.length <= 1 ? 0.5 : i / (points.length - 1)); };
    var sy = function (v) { return y1 - (y1 - y0) * ((v - lo) / (hi - lo || 1)); };
    var d = points.map(function (p, i) { return (i ? 'L' : 'M') + sx(i).toFixed(1) + ' ' + sy(p.pct).toFixed(1); }).join(' ');
    svg.appendChild(el('path', { d: d, class: 'line' }));

    points.forEach(function (p, i) {
      var c = el('circle', { cx: sx(i), cy: sy(p.pct), r: 4, class: 'line-dot' });
      c.appendChild(el('title', {}, Store.date.fmtShort(p.date) + ': ' + p.label + ' (' + p.pct + '%)'));
      svg.appendChild(c);
    });

    var showEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor((x1 - x0) / 54))));
    points.forEach(function (p, i) {
      if (i % showEvery !== 0 && i !== points.length - 1) return;
      svg.appendChild(el('text', {
        x: sx(i), y: f.h - 8, class: 'tick',
        'text-anchor': i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'
      }, Store.date.fmtShort(p.date)));
    });
    host.appendChild(svg);
  }

  /* Workload gauge for the acute:chronic ratio. */
  function gauge(host, ratio) {
    host.innerHTML = '';
    var f = frame(host, 74), svg = f.svg;
    var x0 = 10, x1 = f.w - 10, y = 34, h = 12;
    var zones = [
      [0, 0.8, 'zone-low'], [0.8, 1.3, 'zone-ok'], [1.3, 1.5, 'zone-warn'], [1.5, 2.0, 'zone-high']
    ];
    var toX = function (r) { return x0 + (x1 - x0) * Math.min(1, Math.max(0, r / 2.0)); };
    zones.forEach(function (z) {
      svg.appendChild(el('rect', { x: toX(z[0]), y: y, width: Math.max(1, toX(z[1]) - toX(z[0])), height: h, class: z[2] }));
    });
    [0.8, 1.3, 1.5].forEach(function (t) {
      svg.appendChild(el('text', { x: toX(t), y: y + h + 15, class: 'tick', 'text-anchor': 'middle' }, t));
    });
    if (ratio != null) {
      var px = toX(ratio);
      svg.appendChild(el('polygon', { points: px + ',' + (y - 3) + ' ' + (px - 5) + ',' + (y - 12) + ' ' + (px + 5) + ',' + (y - 12), class: 'needle' }));
      svg.appendChild(el('text', { x: px, y: y - 16, class: 'needle-label', 'text-anchor': 'middle' }, ratio.toFixed(2)));
    }
    host.appendChild(svg);
  }

  /* Re-render charts when the container size changes (phone rotation, window resize). */
  function responsive(host, render) {
    render();
    if (!global.ResizeObserver) return;
    var w = host.clientWidth;
    var ro = new ResizeObserver(function () {
      if (Math.abs(host.clientWidth - w) < 12) return;
      w = host.clientWidth;
      render();
    });
    ro.observe(host);
    return ro;
  }

  global.Charts = { daily: daily, weekly: weekly, cumulative: cumulative, rolling: rolling, gauge: gauge, scoreLine: scoreLine, responsive: responsive };
})(window);
