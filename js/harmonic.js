/* ============================================================
   HARMONIC PATTERN DETECTION ENGINE (Pillar 1)
   Based on "The Harmonious Trader" - ZigZag + AB=CD + Gartley 222
   ============================================================ */
"use strict";

var HarmonicPatternDetector = {

  /**
   * ZigZag pivot point detection
   * Local extrema confirmed by 2 bars on each side, filtered by swing threshold
   * @param {Array} klines - K-line array
   * @param {number} minSwingPercent - Minimum swing percentage, default 2.5
   * @returns {Array} [{index, price, type:'high'|'low', date}]
   */
  findPivotPoints: function(klines, minSwingPercent) {
    minSwingPercent = minSwingPercent || 2.5;
    var pivots = [];
    var len = klines.length;
    if (len < 5) return pivots;

    // Phase 1: Detect local extrema (2-bar confirmation on each side)
    for (var i = 2; i < len - 2; i++) {
      var c = klines[i];
      var p1 = klines[i - 1], p2 = klines[i - 2];
      var n1 = klines[i + 1], n2 = klines[i + 2];

      // Local high
      if (c.high >= p1.high && c.high >= p2.high &&
          c.high >= n1.high && c.high >= n2.high) {
        pivots.push({ index: i, price: c.high, type: 'high', date: c.date });
      }
      // Local low
      if (c.low <= p1.low && c.low <= p2.low &&
          c.low <= n1.low && c.low <= n2.low) {
        pivots.push({ index: i, price: c.low, type: 'low', date: c.date });
      }
    }

    // Phase 2: Ensure high-low alternation, remove adjacent same-type
    var filtered = [];
    for (var j = 0; j < pivots.length; j++) {
      if (filtered.length === 0) {
        filtered.push(pivots[j]);
      } else {
        var last = filtered[filtered.length - 1];
        if (pivots[j].type === last.type) {
          if ((pivots[j].type === 'high' && pivots[j].price > last.price) ||
              (pivots[j].type === 'low' && pivots[j].price < last.price)) {
            filtered[filtered.length - 1] = pivots[j];
          }
        } else {
          filtered.push(pivots[j]);
        }
      }
    }

    // Phase 3: Filter small swings
    if (filtered.length < 2) return filtered;
    var sig = [filtered[0]];
    for (var k = 1; k < filtered.length; k++) {
      var prev = sig[sig.length - 1];
      var swing = Math.abs(filtered[k].price - prev.price) / prev.price * 100;
      if (swing >= minSwingPercent) sig.push(filtered[k]);
    }
    return sig;
  },

  /**
   * Fibonacci retracement/extension levels
   */
  fibLevels: function(start, end) {
    var d = end - start;
    return {
      _0: start, _0_236: start + d * 0.236, _0_382: start + d * 0.382,
      _0_5: start + d * 0.5, _0_618: start + d * 0.618, _0_786: start + d * 0.786,
      _0_886: start + d * 0.886, _1_0: end,
      _1_272: end + d * 0.272, _1_618: end + d * 0.618,
      _2_0: end + d, _2_618: end + d * 1.618
    };
  },

  /**
   * Tolerance range check
   */
  inRange: function(value, target, tol) {
    tol = tol || 0.08;
    return value >= target * (1 - tol) && value <= target * (1 + tol);
  },

  /**
   * Ratio match score (0-1)
   */
  ratioMatch: function(actual, ideal) {
    if (!ideal || !actual) return 0;
    var dev = Math.abs(actual - ideal) / ideal;
    return Math.max(0, 1 - dev * 3.5);
  },

  /**
   * AB=CD pattern detection (4-point equal legs)
   * Conditions: BC retraces 0.55-0.82 of AB, CD ≈ AB (tol 8%), CD extends BC 1.1-1.7x
   */
  detectABCD: function(pivots, klines) {
    var r = { found: false, confidence: 0, prz: null, stopLoss: null,
              targets: [], direction: null, pattern: '', description: '' };
    if (pivots.length < 4) return r;

    var pts = pivots.slice(-4);
    var A = pts[0], B = pts[1], C = pts[2], D_pt = pts[3];
    if (A.type === B.type || B.type === C.type) return r;

    var AB = Math.abs(B.price - A.price);
    var BC = Math.abs(C.price - B.price);
    var CD = Math.abs(D_pt.price - C.price);
    if (!AB || !BC) return r;

    var bcRetrace = BC / AB;
    var cdLenRatio = CD / AB;
    var cdExt = CD / BC;

    var bcOk = bcRetrace >= 0.55 && bcRetrace <= 0.82;
    var cdLenOk = this.inRange(CD, AB, 0.08);
    var cdExtOk = cdExt >= 1.1 && cdExt <= 1.7;

    if (bcOk && (cdLenOk || cdExtOk)) {
      var lm = this.ratioMatch(cdLenRatio, 1.0) * 0.40;
      var bm = this.ratioMatch(bcRetrace, 0.618) * 0.35;
      var cm = this.ratioMatch(cdExt, 1.272) * 0.25;
      var conf = Math.round((lm + bm + cm) * 100);

      var dir = (A.type === 'low') ? 'bullish' : 'bearish';
      var atr = this.calcATR(klines, 14);
      var prz = { low: D_pt.price * 0.995, high: D_pt.price * 1.005 };
      var sl = dir === 'bullish'
        ? Math.min(D_pt.price - atr * 1.5, prz.low * 0.985)
        : Math.max(D_pt.price + atr * 1.5, prz.high * 1.015);
      var fibs = this.fibLevels(A.price, D_pt.price);
      var tgt = dir === 'bullish'
        ? [fibs._1_272, fibs._1_618, fibs._2_0]
        : [fibs._0_786, fibs._0_618, fibs._0_382];

      r.found = true; r.confidence = Math.min(95, conf); r.direction = dir;
      r.prz = prz; r.stopLoss = sl; r.targets = tgt; r.atr = atr;
      r.pattern = 'AB=CD';
      r.description = (dir === 'bullish' ? '看涨' : '看跌') +
        ' AB=CD: AB' + AB.toFixed(2) + ', CD' + CD.toFixed(2) +
        ', BC回撤' + (bcRetrace * 100).toFixed(1) + '%' +
        ', CD/AB=' + (cdLenRatio * 100).toFixed(1) + '%';
    }
    return r;
  },

  /**
   * Gartley 222 pattern detection (5-point X-A-B-C-D)
   * Ideal ratios: B=0.618XA, C=0.618-0.786AB, D=0.786XA+1.27-1.618BC
   */
  detectGartley: function(pivots, klines) {
    var r = { found: false, confidence: 0, prz: null, stopLoss: null,
              targets: [], direction: null, pattern: '', description: '' };
    if (pivots.length < 5) return r;

    var pts = pivots.slice(-5);
    var X = pts[0], A = pts[1], B = pts[2], C = pts[3], D_pt = pts[4];
    if (X.type === A.type || A.type === B.type || B.type === C.type || C.type === D_pt.type) return r;

    var XA = Math.abs(A.price - X.price);
    var AB = Math.abs(B.price - A.price);
    var BC = Math.abs(C.price - B.price);
    var CD = Math.abs(D_pt.price - C.price);
    if (!XA || !AB || !BC) return r;

    var dir = (X.type === 'high') ? 'bullish' : 'bearish';
    var bRetXA = AB / XA;
    var cRetAB = BC / AB;
    var dRetXA = dir === 'bullish'
      ? (D_pt.price - A.price) / XA
      : (A.price - D_pt.price) / XA;
    var cdExt = CD / BC;

    var bOk = this.inRange(bRetXA, 0.618, 0.14);
    var cOk = cRetAB >= 0.55 && cRetAB <= 0.82;
    var dOk = this.inRange(dRetXA, 0.786, 0.12);
    var cdOk = cdExt >= 1.1 && cdExt <= 1.7;

    var crit = (bOk ? 1 : 0) + (dOk ? 1 : 0);
    var aux = (cOk ? 1 : 0) + (cdOk ? 1 : 0);

    if (crit >= 1 && (crit + aux) >= 2) {
      var bm = this.ratioMatch(bRetXA, 0.618) * 0.35;
      var cm = this.ratioMatch(cRetAB, 0.618) * 0.20;
      var dm = this.ratioMatch(dRetXA, 0.786) * 0.30;
      var cdm = this.ratioMatch(cdExt, 1.272) * 0.15;
      var conf = Math.round((bm + cm + dm + cdm) * 100);

      var atr = this.calcATR(klines, 14);
      var prz = { low: D_pt.price * 0.996, high: D_pt.price * 1.004 };
      var sl = dir === 'bullish'
        ? Math.min(D_pt.price - atr * 1.5, prz.low * 0.985)
        : Math.max(D_pt.price + atr * 1.5, prz.high * 1.015);
      var fibs = this.fibLevels(A.price, D_pt.price);
      var tgt = dir === 'bullish'
        ? [fibs._1_272, fibs._1_618, fibs._2_0]
        : [fibs._0_786, fibs._0_618, fibs._0_382];

      r.found = true; r.confidence = Math.min(92, conf); r.direction = dir;
      r.prz = prz; r.stopLoss = sl; r.targets = tgt; r.atr = atr;
      r.pattern = 'Gartley 222';
      r.description = (dir === 'bullish' ? '看涨' : '看跌') +
        ' Gartley: XA' + XA.toFixed(2) +
        ', B回撤' + (bRetXA * 100).toFixed(1) + '%(XA)' +
        ', D回撤' + (dRetXA * 100).toFixed(1) + '%(XA)';
    }
    return r;
  },

  /**
   * ATR calculation (Average True Range - Wilder smoothing)
   */
  calcATR: function(klines, period) {
    period = period || 14;
    if (klines.length < 2) return klines[0].close * 0.02;
    var trs = [];
    var s = Math.max(1, klines.length - period - 1);
    for (var i = s; i < klines.length; i++) {
      trs.push(Math.max(
        klines[i].high - klines[i].low,
        Math.abs(klines[i].high - klines[i - 1].close),
        Math.abs(klines[i].low - klines[i - 1].close)
      ));
    }
    if (trs.length === 1) return trs[0];
    var atr = trs[0];
    for (var k = 1; k < trs.length; k++) {
      atr = (atr * (period - 1) + trs[k]) / period;
    }
    return atr;
  },

  /**
   * Comprehensive harmonic analysis: run all pattern detectors, return best result
   * @param {Array} klines - K-line array
   * @returns {object} {bestPattern, abcd, gartley, score, pivots, pivotCount, summary}
   */
  analyze: function(klines) {
    if (!klines || klines.length < 15) {
      return { bestPattern: null, score: 0, pivots: [], summary: 'K线数据不足(需>=15根)' };
    }

    var pivots = this.findPivotPoints(klines, 2.5);

    if (pivots.length < 4) {
      return { bestPattern: null, score: 10, pivots: pivots, summary: '转折点不足(需>=4个)' };
    }

    var abcd = this.detectABCD(pivots, klines);
    var gartley = this.detectGartley(pivots, klines);

    var best = null, score = 0;

    if (gartley.found && gartley.confidence > 30) {
      best = gartley;
      score = Math.round(gartley.confidence * 0.90);
    }
    if (abcd.found && abcd.confidence > 30) {
      if (!best || abcd.confidence > best.confidence) {
        best = abcd;
        score = Math.round(abcd.confidence * 0.75);
      }
    }
    if (!best && pivots.length >= 4) score = 15;

    return {
      bestPattern: best,
      abcd: abcd,
      gartley: gartley,
      score: Math.min(95, score),
      pivots: pivots,
      pivotCount: pivots.length,
      summary: best ? best.description : (pivots.length >= 4 ? '未检测到标准谐波形态，趋势结构完整' : '转折点不足')
    };
  }
};
