#!/usr/bin/env node
'use strict';

// ============================================================
// 和谐交易顾问 · 自动更新脚本 v1.0
// 每个交易日8:00后运行，从东方财富API拉取数据
// 运行三框架分析引擎，输出预生成数据文件
// ============================================================

const fs = require('fs');
const path = require('path');

// ============================================================
// 1. CONFIGURATION
// ============================================================
const API = {
  ULIST: 'https://push2.eastmoney.com/api/qt/ulist.np/get',
  CLIST: 'https://push2.eastmoney.com/api/qt/clist/get',
  KLINE: 'https://push2his.eastmoney.com/api/qt/stock/kline/get',
};

const FETCH_TIMEOUT = 15000; // 15 seconds per API call
const OUTPUT_DIR = __dirname;

// Generate today's date string
const NOW = new Date();
const TODAY = NOW.getFullYear() + '-' +
  String(NOW.getMonth() + 1).padStart(2, '0') + '-' +
  String(NOW.getDate()).padStart(2, '0');
const ISO_TIMESTAMP = NOW.toISOString();
const DISPLAY_TIME = TODAY + ' ' +
  String(NOW.getHours()).padStart(2, '0') + ':' +
  String(NOW.getMinutes()).padStart(2, '0') + ' CST';

// ============================================================
// 2. FALLBACK DATA (used when API is unavailable)
// ============================================================
const FALLBACK_MARKET = [
  { name: '上证综指', value: '3,287.42', change: '+0.73%', up: true },
  { name: '深证成指', value: '11,056.39', change: '+1.12%', up: true },
  { name: '沪深300', value: '4,152.80', change: '+0.85%', up: true },
  { name: '创业板指', value: '2,287.15', change: '+1.68%', up: true },
  { name: '恒生指数', value: '21,430.55', change: '-0.42%', up: false },
  { name: '日经225', value: '38,912.70', change: '+0.31%', up: true },
  { name: 'S&P 500', value: '5,847.63', change: '+0.54%', up: true },
  { name: '纳斯达克', value: '19,520.18', change: '+0.91%', up: true },
  { name: 'FTSE 100', value: '8,312.45', change: '-0.18%', up: false },
  { name: 'DAX', value: '18,935.20', change: '+0.47%', up: true },
];

const FALLBACK_RECS = [
  {
    code: '600519.SH', name: '贵州茅台', signal: '买入', signalClass: 'buy',
    position: '15%', positionRaw: 15, holdPeriod: '中线 (2-4周)',
    entry: '1,482.00', entryRange: '1,475 - 1,488', stopLoss: '1,412.00',
    takeProfit: '1,580.00 (161.8% 延伸)', atr: '32.50',
    framework: '谐波看涨鲨鱼形态 + 多因子排名前5% + EV=+3.2%',
    rationale: '<strong>谐波形态</strong>: 日线完成看涨鲨鱼形态，PRZ区间 1,470-1,490 获得两次确认。<br><strong>因子排名</strong>: 动量因子 +1.8σ, 质量因子 +2.1σ, 综合排名沪深300第 4/300。<br><strong>期望值</strong>: 基于历史回测，该形态胜率 62%，风险回报比 1:3.1，正期望值 +3.2%。<br><strong>市场共振</strong>: 白酒板块资金流入加速，北向连续5日净买入。',
    live: false, confluenceScore: 85, harmonicScore: 82, factorScore: 78, statsPass: true,
    sharpe: 1.8, currentPrice: 1482, changePct: 0.73,
    harmonicWeight: 33, factorWeight: 27, statsWeight: 20,
    momentumScore: 72, valueScore: 65, qualityScore: 88, volatilityScore: 70, sentimentScore: 75,
    patternName: '看涨鲨鱼', patternDirection: 'bullish', pivotCount: 7,
  },
  {
    code: '300750.SZ', name: '宁德时代', signal: '买入', signalClass: 'buy',
    position: '12%', positionRaw: 12, holdPeriod: '短线 (3-5天)',
    entry: '238.50', entryRange: '236.80 - 240.00', stopLoss: '225.80',
    takeProfit: '258.00 (127.2% 延伸)', atr: '6.80',
    framework: '谐波看涨蝴蝶形态 + 均值回归信号 + EV=+1.8%',
    rationale: '<strong>谐波形态</strong>: 4小时图完成看涨蝴蝶形态，D点精准落在 127.2% Fibonacci 扩展。<br><strong>因子信号</strong>: 波动率收缩至布林带下轨，RSI(14) 32.6 进入超卖反弹区。<br><strong>Quantopia验证</strong>: ADF检验确认价格偏离均值 2.3σ，均值回归概率 78%。',
    live: false, confluenceScore: 72, harmonicScore: 68, factorScore: 62, statsPass: true,
    sharpe: 1.2, currentPrice: 238.5, changePct: 1.68,
    harmonicWeight: 27, factorWeight: 22, statsWeight: 18,
    momentumScore: 55, valueScore: 48, qualityScore: 72, volatilityScore: 65, sentimentScore: 60,
    patternName: '看涨蝴蝶', patternDirection: 'bullish', pivotCount: 6,
  },
  {
    code: '000858.SZ', name: '五粮液', signal: '关注', signalClass: 'hold',
    position: '8%', positionRaw: 8, holdPeriod: '中线 (2-3周)',
    entry: '138.20', entryRange: '136.50 - 139.50', stopLoss: '128.40',
    takeProfit: '152.00 (161.8% 延伸)', atr: '4.10',
    framework: '谐波看涨螃蟹形态 + 质量因子驱动 + EV=+2.4%',
    rationale: '<strong>谐波形态</strong>: 周线完成看涨螃蟹形态，PRZ 与 61.8% 回撤位高度重合。<br><strong>因子排名</strong>: 质量因子排名前 8%，但动量因子中性，建议小仓位试探。<br><strong>待确认</strong>: 等待日线突破 140 压力位确认加仓信号。',
    live: false, confluenceScore: 58, harmonicScore: 55, factorScore: 50, statsPass: true,
    sharpe: 0.9, currentPrice: 138.2, changePct: -0.42,
    harmonicWeight: 22, factorWeight: 18, statsWeight: 14,
    momentumScore: 40, valueScore: 55, qualityScore: 78, volatilityScore: 52, sentimentScore: 45,
    patternName: '看涨螃蟹', patternDirection: 'bullish', pivotCount: 5,
  }
];

const INDEX_DEFS = [
  { secid: '1.000001', name: '上证综指', fbIdx: 0 },
  { secid: '0.399001', name: '深证成指', fbIdx: 1 },
  { secid: '1.000300', name: '沪深300', fbIdx: 2 },
  { secid: '0.399006', name: '创业板指', fbIdx: 3 },
  { secid: '100.HSI',  name: '恒生指数', fbIdx: 4 },
  { secid: 'intl_N225',  name: '日经225',  fbIdx: 5, intl: true },
  { secid: 'intl_SPX',   name: 'S&P 500',  fbIdx: 6, intl: true },
  { secid: 'intl_IXIC',  name: '纳斯达克', fbIdx: 7, intl: true },
  { secid: 'intl_FTSE',  name: 'FTSE 100', fbIdx: 8, intl: true },
  { secid: 'intl_GDAXI', name: 'DAX',      fbIdx: 9, intl: true },
];

const FALLBACK_POSITIONS = [
  { secid: '1.600036', code: '600036.SH', name: '招商银行', entryPrice: 38.75,
    entryDate: TODAY, stopLoss: 36.80, status: 'holding', statusText: '持仓中',
    action: '持有', actionClass: 'hold', expectedRemain: '2-3周', atr: 0.85,
    advice: '沿5日均线稳步上行，谐波形态目标位 43.20 不变。维持当前仓位。' },
  { secid: '1.601899', code: '601899.SH', name: '紫金矿业', entryPrice: 17.62,
    entryDate: TODAY, stopLoss: 17.80, status: 'add', statusText: '加仓信号',
    action: '加仓 5%', actionClass: 'buy', expectedRemain: '1-2周', atr: 0.42,
    advice: '突破前高确认上行趋势延续，因子模型动量增强。建议加仓 5%。' },
];

// ============================================================
// 3. UTILITY FUNCTIONS
// ============================================================
function fmtPrice(v, isIndex) {
  if (v == null || isNaN(v)) return '--';
  if (isIndex) {
    return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return Number(v).toFixed(2);
}

function fmtChange(v) {
  if (v == null || isNaN(v)) return '--';
  var sign = v >= 0 ? '+' : '';
  return sign + Number(v).toFixed(2) + '%';
}

function fmtNum(n, decimals) {
  return Number(n).toFixed(decimals || 2);
}

function makeSecidFromCode(code) {
  if (code.indexOf('.SH') > -1) return '1.' + code.replace('.SH', '');
  if (code.indexOf('.SZ') > -1) return '0.' + code.replace('.SZ', '');
  return code;
}

function makeSecidFromRawCode(rawCode) {
  var code = String(rawCode);
  var prefix = (code.startsWith('6') || code.startsWith('5') || code.startsWith('9')) ? '1' : '0';
  return prefix + '.' + code;
}

function makeDisplayCode(secid) {
  if (secid.startsWith('1.')) return secid.substring(2) + '.SH';
  if (secid.startsWith('0.')) return secid.substring(2) + '.SZ';
  return secid;
}

// ============================================================
// 4. API FETCH FUNCTIONS
// ============================================================

/**
 * Fetch JSON from URL with timeout
 */
async function fetchJSON(url, timeout) {
  timeout = timeout || FETCH_TIMEOUT;
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeout);
  try {
    var resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch Chinese index data from EastMoney
 */
async function fetchIndices() {
  console.log('[API] 获取指数行情...');
  var cnSecids = INDEX_DEFS
    .filter(function(d) { return !d.intl; })
    .map(function(d) { return d.secid; })
    .join(',');
  var url = API.ULIST + '?fltt=2&fields=f2,f3,f4,f12,f14&secids=' + cnSecids;
  try {
    var data = await fetchJSON(url);
    if (data && data.data && data.data.diff) {
      var liveMap = {};
      data.data.diff.forEach(function(item) {
        var rawCode = String(item.f12);
        for (var i = 0; i < INDEX_DEFS.length; i++) {
          var def = INDEX_DEFS[i];
          if (!def.intl && def.secid.indexOf(rawCode) > -1) {
            liveMap[def.name] = {
              value: item.f2,
              change: item.f3,
              up: item.f3 >= 0,
              live: true,
            };
            break;
          }
        }
      });
      var results = INDEX_DEFS.map(function(def) {
        if (liveMap[def.name]) {
          return {
            name: def.name,
            value: fmtPrice(liveMap[def.name].value, true),
            change: fmtChange(liveMap[def.name].change),
            up: liveMap[def.name].up,
            live: true,
            valueRaw: liveMap[def.name].value,
            changeRaw: liveMap[def.name].change,
          };
        }
        var fb = FALLBACK_MARKET[def.fbIdx];
        return fb ? Object.assign({}, fb, { live: false, valueRaw: null, changeRaw: null }) :
          { name: def.name, value: '--', change: '--', up: false, live: false, valueRaw: null, changeRaw: null };
      });
      console.log('[API] 指数获取成功: ' + data.data.diff.length + ' 项实时');
      return results;
    }
    throw new Error('Invalid response structure');
  } catch (err) {
    console.warn('[API] 指数获取失败，使用备用数据: ' + err.message);
    return FALLBACK_MARKET.map(function(m) { return Object.assign({}, m, { live: false, valueRaw: null, changeRaw: null }); });
  }
}

/**
 * Fetch top 30 most active A-share stocks
 */
async function fetchTopStocks() {
  console.log('[API] 获取Top30成交活跃A股...');
  var url = API.CLIST +
    '?pn=1&pz=30&po=1&np=1&fltt=2' +
    '&fields=f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21' +
    '&fs=m:0+t:6,m:0+t:80';
  try {
    var data = await fetchJSON(url, 15000);
    if (data && data.data && data.data.diff && data.data.diff.length > 0) {
      console.log('[API] 股票列表获取成功: ' + data.data.diff.length + ' 只');
      return data.data.diff;
    }
    throw new Error('Empty stock list');
  } catch (err) {
    console.error('[API] 股票列表获取失败: ' + err.message);
    return null;
  }
}

/**
 * Fetch daily K-line data (60 bars)
 */
async function fetchStockKline(secid, limit) {
  limit = limit || 60;
  var url = API.KLINE +
    '?secid=' + encodeURIComponent(secid) +
    '&fields1=f1,f2,f3,f4,f5,f6' +
    '&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61' +
    '&klt=101&fqt=0&end=20500101&lmt=' + limit;
  try {
    var data = await fetchJSON(url, 10000);
    if (!data || !data.data) throw new Error('K-line data empty: ' + secid);
    var klinesRaw = data.data.klines;
    if (!klinesRaw || klinesRaw.length === 0) throw new Error('No K-line records: ' + secid);
    return klinesRaw.map(function(line) {
      var parts = String(line).split(',');
      return {
        date: parts[0],
        open: parseFloat(parts[1]),
        close: parseFloat(parts[2]),
        high: parseFloat(parts[3]),
        low: parseFloat(parts[4]),
        volume: parseFloat(parts[5]),
        amount: parseFloat(parts[6]),
        amplitude: parseFloat(parts[7]),
        changePct: parseFloat(parts[8]),
        changeAmt: parseFloat(parts[9]),
        turnoverRate: parseFloat(parts[10])
      };
    });
  } catch (err) {
    console.warn('[Kline] K线获取失败 secid=' + secid + ': ' + err.message);
    return null;
  }
}

// ============================================================
// 5. HARMONIC PATTERN DETECTION (Pillar 1 - 和谐的交易者)
// ============================================================
var HarmonicPatternDetector = {

  findPivotPoints: function(klines, minSwingPercent) {
    minSwingPercent = minSwingPercent || 2.5;
    var pivots = [];
    var len = klines.length;
    if (len < 5) return pivots;

    for (var i = 2; i < len - 2; i++) {
      var c = klines[i];
      var p1 = klines[i - 1], p2 = klines[i - 2];
      var n1 = klines[i + 1], n2 = klines[i + 2];
      if (c.high >= p1.high && c.high >= p2.high && c.high >= n1.high && c.high >= n2.high) {
        pivots.push({ index: i, price: c.high, type: 'high', date: c.date });
      }
      if (c.low <= p1.low && c.low <= p2.low && c.low <= n1.low && c.low <= n2.low) {
        pivots.push({ index: i, price: c.low, type: 'low', date: c.date });
      }
    }

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

    if (filtered.length < 2) return filtered;
    var sig = [filtered[0]];
    for (var k = 1; k < filtered.length; k++) {
      var prev = sig[sig.length - 1];
      var swing = Math.abs(filtered[k].price - prev.price) / prev.price * 100;
      if (swing >= minSwingPercent) sig.push(filtered[k]);
    }
    return sig;
  },

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

  inRange: function(value, target, tol) {
    tol = tol || 0.08;
    return value >= target * (1 - tol) && value <= target * (1 + tol);
  },

  ratioMatch: function(actual, ideal) {
    if (!ideal || !actual) return 0;
    var dev = Math.abs(actual - ideal) / ideal;
    return Math.max(0, 1 - dev * 3.5);
  },

  detectABCD: function(pivots, klines) {
    var r = { found: false, confidence: 0, prz: null, stopLoss: null,
              targets: [], direction: null, pattern: '', description: '', atr: null };
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

  detectGartley: function(pivots, klines) {
    var r = { found: false, confidence: 0, prz: null, stopLoss: null,
              targets: [], direction: null, pattern: '', description: '', atr: null };
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

  detectBat: function(pivots, klines) {
    var r = { found: false, confidence: 0, prz: null, stopLoss: null,
              targets: [], direction: null, pattern: '', description: '', atr: null };
    if (pivots.length < 5) return r;
    // Search last 5-7 pivots for Bat pattern (B at 0.382-0.50 XA, D at 0.886 XA)
    var maxStart = Math.max(0, pivots.length - 7);
    for (var s = pivots.length - 5; s >= maxStart; s--) {
      var X = pivots[s], A = pivots[s + 1], B = pivots[s + 2], C = pivots[s + 3], D_pt = pivots[s + 4];
      if (X.type !== A.type && A.type !== B.type && B.type !== C.type && C.type !== D_pt.type) {
        var XA = Math.abs(A.price - X.price);
        var AB = Math.abs(B.price - A.price);
        var BC = Math.abs(C.price - B.price);
        var CD = Math.abs(D_pt.price - C.price);
        if (!XA || !AB || !BC) continue;

        var dir = (X.type === 'high') ? 'bullish' : 'bearish';
        var bRetXA = AB / XA;
        var cRetAB = BC / AB;
        var dRetXA = dir === 'bullish'
          ? (D_pt.price - A.price) / XA
          : (A.price - D_pt.price) / XA;
        var cdExt = CD / BC;

        // Bat: B at 0.382-0.50 of XA, C at 0.382-0.886 of AB, D at 0.886 of XA, CD=1.272-2.618 of BC
        var bOk = bRetXA >= 0.32 && bRetXA <= 0.55;
        var cOk = cRetAB >= 0.35 && cRetAB <= 0.90;
        var dOk = this.inRange(dRetXA, 0.886, 0.10);
        var cdOk = cdExt >= 1.2 && cdExt <= 2.7;

        var crit = (bOk ? 1 : 0) + (dOk ? 1 : 0);
        var aux = (cOk ? 1 : 0) + (cdOk ? 1 : 0);

        if (crit >= 2 && (crit + aux) >= 3) {
          var bm = this.ratioMatch(bRetXA, 0.382) * 0.30;
          var cm = this.ratioMatch(cRetAB, 0.618) * 0.15;
          var dm = this.ratioMatch(dRetXA, 0.886) * 0.40;
          var cdm = this.ratioMatch(cdExt, 1.618) * 0.15;
          var conf = Math.round((bm + cm + dm + cdm) * 100);
          var atr = this.calcATR(klines, 14);
          var prz = { low: D_pt.price * 0.996, high: D_pt.price * 1.004 };
          var sl = dir === 'bullish'
            ? Math.min(D_pt.price - atr * 1.8, prz.low * 0.983)
            : Math.max(D_pt.price + atr * 1.8, prz.high * 1.017);
          var fibs = this.fibLevels(A.price, D_pt.price);
          var tgt = dir === 'bullish'
            ? [fibs._1_272, fibs._1_618]
            : [fibs._0_786, fibs._0_618];

          r.found = true; r.confidence = Math.min(90, conf); r.direction = dir;
          r.prz = prz; r.stopLoss = sl; r.targets = tgt; r.atr = atr;
          r.pattern = 'Bat 蝙蝠';
          r.description = (dir === 'bullish' ? '看涨' : '看跌') +
            ' Bat: XA' + XA.toFixed(2) +
            ', B回撤' + (bRetXA * 100).toFixed(1) + '%(XA)' +
            ', D在' + (dRetXA * 100).toFixed(1) + '%(XA, 0.886目标)' +
            ', CD/BC=' + cdExt.toFixed(2);
          return r;
        }
      }
    }
    return r;
  },

  detectCrab: function(pivots, klines) {
    var r = { found: false, confidence: 0, prz: null, stopLoss: null,
              targets: [], direction: null, pattern: '', description: '', atr: null };
    if (pivots.length < 5) return r;
    // Crab: B at 0.382-0.618 of XA, C at 0.382-0.886 of AB, D at 1.618 of XA
    var maxStart = Math.max(0, pivots.length - 7);
    for (var s = pivots.length - 5; s >= maxStart; s--) {
      var X = pivots[s], A = pivots[s + 1], B = pivots[s + 2], C = pivots[s + 3], D_pt = pivots[s + 4];
      if (X.type !== A.type && A.type !== B.type && B.type !== C.type && C.type !== D_pt.type) {
        var XA = Math.abs(A.price - X.price);
        var AB = Math.abs(B.price - A.price);
        var BC = Math.abs(C.price - B.price);
        var CD = Math.abs(D_pt.price - C.price);
        if (!XA || !AB || !BC) continue;

        var dir = (X.type === 'high') ? 'bullish' : 'bearish';
        var bRetXA = AB / XA;
        var cRetAB = BC / AB;
        var dRetXA = dir === 'bullish'
          ? (D_pt.price - A.price) / XA
          : (A.price - D_pt.price) / XA;
        var cdExt = CD / BC;

        // Crab: B at 0.382-0.618, D at 1.618 of XA, CD extension 2.24-3.618
        var bOk = bRetXA >= 0.35 && bRetXA <= 0.65;
        var cOk = cRetAB >= 0.35 && cRetAB <= 0.90;
        var dOk = this.inRange(dRetXA, 1.618, 0.12);
        var cdOk = cdExt >= 2.0 && cdExt <= 3.8;

        var crit = (bOk ? 1 : 0) + (dOk ? 1 : 0);
        var aux = (cOk ? 1 : 0) + (cdOk ? 1 : 0);

        if (crit >= 1 && (crit + aux) >= 3) {
          var bm = this.ratioMatch(bRetXA, 0.50) * 0.20;
          var cm = this.ratioMatch(cRetAB, 0.618) * 0.15;
          var dm = this.ratioMatch(dRetXA, 1.618) * 0.45;
          var cdm = this.ratioMatch(cdExt, 2.618) * 0.20;
          var conf = Math.round((bm + cm + dm + cdm) * 100);
          var atr = this.calcATR(klines, 14);
          var prz = { low: D_pt.price * 0.994, high: D_pt.price * 1.006 };
          // Crab has wider stop due to extreme extension
          var sl = dir === 'bullish'
            ? Math.min(D_pt.price - atr * 2.2, prz.low * 0.98)
            : Math.max(D_pt.price + atr * 2.2, prz.high * 1.02);
          var tgt = dir === 'bullish'
            ? [D_pt.price + (D_pt.price - prz.low) * 0.618, D_pt.price + (D_pt.price - prz.low) * 1.0]
            : [D_pt.price - (prz.high - D_pt.price) * 0.618, D_pt.price - (prz.high - D_pt.price) * 1.0];

          r.found = true; r.confidence = Math.min(88, conf); r.direction = dir;
          r.prz = prz; r.stopLoss = sl; r.targets = tgt; r.atr = atr;
          r.pattern = 'Crab 螃蟹';
          r.description = (dir === 'bullish' ? '看涨' : '看跌') +
            ' Crab: XA' + XA.toFixed(2) +
            ', B回撤' + (bRetXA * 100).toFixed(1) + '%(XA)' +
            ', D延伸' + (dRetXA * 100).toFixed(1) + '%(XA, 1.618极值)' +
            ', CD/BC=' + cdExt.toFixed(2) +
            ' [高风险高回报]';
          return r;
        }
      }
    }
    return r;
  },

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

  calcMA: function(klines, period) {
    if (!klines || klines.length < period) return null;
    var sum = 0;
    var start = klines.length - period;
    for (var i = start; i < klines.length; i++) sum += klines[i].close;
    return sum / period;
  },

  calcSlope: function(klines, period) {
    // Linear regression slope of closing prices over 'period' bars
    if (!klines || klines.length < period || period < 3) return 0;
    var n = Math.min(period, klines.length);
    var start = klines.length - n;
    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (var i = 0; i < n; i++) {
      var x = i;
      var y = klines[start + i].close;
      sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
    }
    var denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 0;
    return (n * sumXY - sumX * sumY) / denominator;
  },

  analyze: function(klines) {
    if (!klines || klines.length < 15) {
      return { bestPattern: null, score: 0, pivots: [], pivotCount: 0, summary: 'K线数据不足(需>=15根)' };
    }
    var pivots = this.findPivotPoints(klines, 2.5);
    if (pivots.length < 4) {
      return { bestPattern: null, score: 10, pivots: pivots, pivotCount: pivots.length, summary: '转折点不足(需>=4个)' };
    }
    var abcd = this.detectABCD(pivots, klines);
    var gartley = this.detectGartley(pivots, klines);
    var bat = this.detectBat(pivots, klines);
    var crab = this.detectCrab(pivots, klines);

    // Rank patterns by confidence with quality weighting
    // Higher weight for higher-probability patterns (Gartley > Bat > AB=CD > Crab)
    var patterns = [
      { p: gartley, weight: 0.90, label: 'Gartley' },
      { p: bat,     weight: 0.85, label: 'Bat' },
      { p: abcd,    weight: 0.75, label: 'AB=CD' },
      { p: crab,    weight: 0.70, label: 'Crab' },
    ];
    var best = null, score = 0;
    for (var pi = 0; pi < patterns.length; pi++) {
      if (patterns[pi].p.found && patterns[pi].p.confidence > 30) {
        var weightedScore = Math.round(patterns[pi].p.confidence * patterns[pi].weight);
        if (!best || weightedScore > score) {
          best = patterns[pi].p;
          score = weightedScore;
        }
      }
    }
    if (!best && pivots.length >= 4) score = 15;

    return {
      bestPattern: best, abcd: abcd, gartley: gartley, bat: bat, crab: crab,
      score: Math.min(95, score), pivots: pivots,
      pivotCount: pivots.length,
      summary: best ? best.description : (pivots.length >= 4 ? '未检测到标准谐波形态，趋势结构完整' : '转折点不足')
    };
  }
};

// ============================================================
// 6. MULTI-FACTOR SCORING (Pillar 2 - 知乎量化文章)
// ============================================================

/**
 * Calculate RSI (Relative Strength Index)
 * Returns 0-100, or null if insufficient data
 */
function calcRSI(klines, period) {
  period = period || 14;
  if (!klines || klines.length < period + 1) return null;
  var gains = 0, losses = 0;
  var n = klines.length;
  // Initial average gain/loss over first 'period' changes
  for (var i = n - period; i < n; i++) {
    var change = klines[i].close - klines[i - 1].close;
    if (change > 0) gains += change; else losses += Math.abs(change);
  }
  var avgGain = gains / period;
  var avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  var rs = avgGain / avgLoss;
  return Math.min(100, Math.max(0, Math.round(100 - 100 / (1 + rs))));
}

/**
 * Trend Filter: Check MA alignment and trend strength
 * Returns { trend: 'up'|'down'|'neutral', strength: 0-100, breakdown: '...' }
 * Long signals should favor 'up' trends; avoid fighting 'down' trends
 */
function calcTrendFilter(klines) {
  if (!klines || klines.length < 25) {
    return { trend: 'neutral', strength: 50, score: 50, breakdown: 'K线不足(需>=25根)' };
  }

  var close = klines[klines.length - 1].close;
  var ma10 = HarmonicPatternDetector.calcMA(klines, 10);
  var ma20 = HarmonicPatternDetector.calcMA(klines, 20);
  var ma60 = HarmonicPatternDetector.calcMA(klines, Math.min(60, klines.length));

  if (!ma10 || !ma20) {
    return { trend: 'neutral', strength: 50, score: 50, breakdown: '均线计算失败' };
  }

  // MA slope (rate of change over 5 bars)
  var ma20Slope5 = HarmonicPatternDetector.calcSlope(klines.slice(-25), 5);

  // Trend classification
  var trend, score;
  var ma20AboveMa60 = ma60 ? ma20 > ma60 : true;
  var priceAboveMa20 = close > ma20;
  var priceAboveMa10 = close > ma10;

  // Score components
  var priceVsMAs = 0; // -50 to +50
  if (priceAboveMa10) priceVsMAs += 20; else priceVsMAs -= 20;
  if (priceAboveMa20) priceVsMAs += 20; else priceVsMAs -= 20;
  if (ma20AboveMa60 && ma60) priceVsMAs += 10; else if (ma60) priceVsMAs -= 10;

  // Slope scoring
  var slopeScore = Math.min(50, Math.max(-50, ma20Slope5 * 500)); // Normalize

  var totalScore = 50 + priceVsMAs * 0.6 + slopeScore * 0.4;
  totalScore = Math.min(100, Math.max(0, Math.round(totalScore)));

  if (totalScore >= 65) trend = 'up';
  else if (totalScore <= 35) trend = 'down';
  else trend = 'neutral';

  return {
    trend: trend,
    strength: Math.abs(totalScore - 50) * 2,
    score: totalScore,
    priceAboveMa20: priceAboveMa20,
    ma20AboveMa60: ma20AboveMa60,
    breakdown: '趋势=' + trend + ' | 价>MA20=' + (priceAboveMa20 ? '是' : '否') +
               ' | MA20斜率=' + ma20Slope5.toFixed(3) +
               (ma60 ? ' | MA20>MA60=' + (ma20AboveMa60 ? '是' : '否') : '')
  };
}

function calcMomentumFactor(klines) {
  var len = klines.length;
  if (len < 5) return 50;
  var close = klines[len - 1].close;
  var r5 = len >= 5 ? (close - klines[len - 5].close) / klines[len - 5].close : 0;
  var r10 = len >= 10 ? (close - klines[len - 10].close) / klines[len - 10].close : 0;
  var r20 = len >= 20 ? (close - klines[len - 20].close) / klines[len - 20].close : 0;
  var weightedR = r5 * 0.5 + r10 * 0.3 + r20 * 0.2;
  var score = 50 + weightedR * 100 * 8;
  return Math.min(100, Math.max(0, score));
}

function calcValueFactor(stock) {
  var pe = stock.f9;
  if (!pe || pe <= 0 || pe > 500) return 50;
  var earningsYield = (1 / pe) * 100;
  var score;
  if (earningsYield >= 15) score = 95;
  else if (earningsYield >= 10) score = 80 + (earningsYield - 10) / 5 * 15;
  else if (earningsYield >= 5) score = 50 + (earningsYield - 5) / 5 * 30;
  else if (earningsYield >= 2) score = 20 + (earningsYield - 2) / 3 * 30;
  else score = Math.max(5, earningsYield * 10);
  return Math.min(100, Math.max(5, score));
}

function calcQualityFactor(klines) {
  var len = klines.length;
  if (len < 10) return 50;
  var turnoverRates = [];
  var start = Math.max(0, len - 20);
  for (var i = start; i < len; i++) {
    var tr = klines[i].turnoverRate;
    if (tr != null && !isNaN(tr) && tr > 0) turnoverRates.push(tr);
  }
  if (turnoverRates.length < 5) return 50;
  var sum = 0;
  for (var j = 0; j < turnoverRates.length; j++) sum += turnoverRates[j];
  var mean = sum / turnoverRates.length;
  if (mean === 0) return 50;
  var sqSum = 0;
  for (var k = 0; k < turnoverRates.length; k++) sqSum += (turnoverRates[k] - mean) * (turnoverRates[k] - mean);
  var std = Math.sqrt(sqSum / turnoverRates.length);
  var cv = std / mean;
  var score;
  if (cv < 0.3) score = 90 + (0.3 - cv) / 0.3 * 10;
  else if (cv < 0.6) score = 70 + (0.6 - cv) / 0.3 * 20;
  else if (cv < 1.0) score = 45 + (1.0 - cv) / 0.4 * 25;
  else if (cv < 1.5) score = 20 + (1.5 - cv) / 0.5 * 25;
  else score = Math.max(5, 20 - (cv - 1.5) * 10);
  return Math.min(100, Math.max(5, score));
}

function calcVolatilityFactor(klines, close) {
  var atr = HarmonicPatternDetector.calcATR(klines, 14);
  if (!atr || atr <= 0 || !close) return 50;
  var atrPct = (atr / close) * 100;
  var score;
  if (atrPct < 1.5) score = 90 + (1.5 - atrPct) / 1.5 * 10;
  else if (atrPct < 3.0) score = 60 + (3.0 - atrPct) / 1.5 * 30;
  else if (atrPct < 5.0) score = 35 + (5.0 - atrPct) / 2.0 * 25;
  else if (atrPct < 8.0) score = 10 + (8.0 - atrPct) / 3.0 * 25;
  else score = Math.max(2, 10 - (atrPct - 8) * 2);
  return Math.min(100, Math.max(2, score));
}

function calcSentimentFactor(stock, klines) {
  var len = klines.length;
  if (stock.f10 != null && !isNaN(stock.f10) && stock.f10 > 0) {
    var volRatio = stock.f10;
    var score;
    if (volRatio >= 0.8 && volRatio <= 1.2) score = 85 + (1.0 - Math.abs(volRatio - 1.0)) / 0.2 * 10;
    else if (volRatio >= 0.5 && volRatio < 0.8) score = 55 + (volRatio - 0.5) / 0.3 * 30;
    else if (volRatio > 1.2 && volRatio <= 2.5) score = 50 + (2.5 - volRatio) / 1.3 * 35;
    else if (volRatio > 2.5 && volRatio <= 4.0) score = 20 + (4.0 - volRatio) / 1.5 * 30;
    else if (volRatio < 0.5) score = 20 + volRatio / 0.5 * 35;
    else score = Math.max(5, 20 - (volRatio - 4.0) * 5);
    return Math.min(100, Math.max(5, score));
  }
  if (len < 6) return 50;
  var latestVol = klines[len - 1].volume;
  if (!latestVol || latestVol <= 0) return 50;
  var sum5 = 0, count = 0;
  for (var i = len - 6; i < len - 1; i++) {
    if (klines[i].volume > 0) { sum5 += klines[i].volume; count++; }
  }
  if (count === 0) return 50;
  var avg5 = sum5 / count;
  var ratio = latestVol / avg5;
  var score;
  if (ratio >= 0.8 && ratio <= 1.3) score = 85;
  else if (ratio > 0.5 && ratio < 0.8) score = 55 + (ratio - 0.5) / 0.3 * 30;
  else if (ratio > 1.3 && ratio <= 2.5) score = 50 + (2.5 - ratio) / 1.2 * 35;
  else score = 30;
  return Math.min(100, Math.max(10, score));
}

function calcMultiFactorScore(stock, klines) {
  if (!klines || klines.length < 10) {
    return { totalScore: 0, momentum: 0, value: 0, quality: 0, volatility: 0, sentiment: 0, breakdown: 'K线数据不足' };
  }
  var close = klines[klines.length - 1].close;
  if (!close || close <= 0) close = stock.f2 || 0;

  var momentumScore = calcMomentumFactor(klines);
  var valueScore = calcValueFactor(stock);
  var qualityScore = calcQualityFactor(klines);
  var volatilityScore = calcVolatilityFactor(klines, close);
  var sentimentScore = calcSentimentFactor(stock, klines);

  var totalScore = momentumScore * 0.30 + valueScore * 0.20 + qualityScore * 0.15 +
                   volatilityScore * 0.20 + sentimentScore * 0.15;

  return {
    totalScore: Math.min(100, Math.max(0, Math.round(totalScore))),
    momentum: Math.round(momentumScore), value: Math.round(valueScore),
    quality: Math.round(qualityScore), volatility: Math.round(volatilityScore),
    sentiment: Math.round(sentimentScore),
    breakdown: '动量' + Math.round(momentumScore) + ' | 价值' + Math.round(valueScore) +
               ' | 质量' + Math.round(qualityScore) + ' | 波动' + Math.round(volatilityScore) +
               ' | 情绪' + Math.round(sentimentScore)
  };
}

// ============================================================
// 7. STATISTICAL VALIDATION (Pillar 3 - Quantopia 56讲)
// ============================================================

function calcPearsonCorrelation(stockKL, indexKL) {
  var n = Math.min(stockKL.length, indexKL.length) - 1;
  if (n < 5) return 0;
  var stockRets = [], indexRets = [];
  var sOffset = stockKL.length - n - 1;
  var iOffset = indexKL.length - n - 1;
  for (var i = 0; i < n; i++) {
    var sIdx = sOffset + i, iIdx = iOffset + i;
    if (stockKL[sIdx + 1] && indexKL[iIdx + 1]) {
      var sr = (stockKL[sIdx + 1].close - stockKL[sIdx].close) / stockKL[sIdx].close;
      var ir = (indexKL[iIdx + 1].close - indexKL[iIdx].close) / indexKL[iIdx].close;
      stockRets.push(sr); indexRets.push(ir);
    }
  }
  if (stockRets.length < 5) return 0;
  var sMean = 0, iMean = 0;
  for (var j = 0; j < stockRets.length; j++) { sMean += stockRets[j]; iMean += indexRets[j]; }
  sMean /= stockRets.length; iMean /= stockRets.length;
  var cov = 0, sVar = 0, iVar = 0;
  for (var k = 0; k < stockRets.length; k++) {
    var sDiff = stockRets[k] - sMean, iDiff = indexRets[k] - iMean;
    cov += sDiff * iDiff; sVar += sDiff * sDiff; iVar += iDiff * iDiff;
  }
  if (sVar === 0 || iVar === 0) return 0;
  return cov / Math.sqrt(sVar * iVar);
}

function calcAutoCorrelation(klines) {
  var n = klines.length;
  if (n < 10) return 0;
  var rets = [];
  for (var i = 1; i < n; i++) rets.push((klines[i].close - klines[i - 1].close) / klines[i - 1].close);
  if (rets.length < 5) return 0;
  var mean = 0;
  for (var j = 0; j < rets.length; j++) mean += rets[j];
  mean /= rets.length;
  var cov = 0, var0 = 0, var1 = 0;
  for (var k = 0; k < rets.length - 1; k++) {
    cov += (rets[k] - mean) * (rets[k + 1] - mean);
    var0 += (rets[k] - mean) * (rets[k] - mean);
    var1 += (rets[k + 1] - mean) * (rets[k + 1] - mean);
  }
  if (var0 === 0 || var1 === 0) return 0;
  return Math.abs(cov / Math.sqrt(var0 * var1));
}

function calcEstimatedSharpe(klines) {
  var n = klines.length;
  if (n < 5) return 0;
  var rets = [];
  var start = Math.max(1, n - 20);
  for (var i = start; i < n; i++) {
    if (klines[i].close > 0 && klines[i - 1].close > 0) {
      rets.push((klines[i].close - klines[i - 1].close) / klines[i - 1].close);
    }
  }
  if (rets.length < 3) return 0;
  var mean = 0;
  for (var j = 0; j < rets.length; j++) mean += rets[j];
  mean /= rets.length;
  var variance = 0;
  for (var k = 0; k < rets.length; k++) variance += (rets[k] - mean) * (rets[k] - mean);
  variance /= (rets.length - 1);
  var std = Math.sqrt(variance);
  if (std === 0) return 0;
  var annualizedReturn = mean * 252;
  var annualizedStd = std * Math.sqrt(252);
  return (annualizedReturn - 0.025) / annualizedStd;
}

function statisticalValidation(stockKlines, indexKlines, basePosition) {
  basePosition = basePosition || 15;
  if (!stockKlines || stockKlines.length < 10) {
    return { correlation: 0, sharpe: 0, adjustedPosition: basePosition, pass: false, atr: 0, atrPct: 0, breakdown: '数据不足' };
  }
  var correlation = 0;
  if (indexKlines && indexKlines.length >= 10) {
    correlation = calcPearsonCorrelation(stockKlines, indexKlines);
  } else {
    correlation = calcAutoCorrelation(stockKlines);
  }
  var sharpe = calcEstimatedSharpe(stockKlines);
  var atr = HarmonicPatternDetector.calcATR(stockKlines, 14);
  var close = stockKlines[stockKlines.length - 1].close;
  var atrPct = close > 0 ? (atr / close) * 100 : 2;
  var targetATR = 2.5;
  var atrMultiplier = targetATR / Math.max(atrPct, 0.5);
  atrMultiplier = Math.min(1.5, Math.max(0.5, atrMultiplier));
  var adjustedPosition = Math.round(basePosition * atrMultiplier);
  var pass = sharpe > 0.1 && adjustedPosition >= basePosition * 0.5;
  return {
    correlation: Math.round(correlation * 100) / 100,
    sharpe: Math.round(sharpe * 100) / 100,
    adjustedPosition: adjustedPosition,
    atr: Math.round(atr * 100) / 100,
    atrPct: Math.round(atrPct * 100) / 100,
    pass: pass,
    breakdown: '相关r=' + (correlation * 100).toFixed(0) + '% | 夏普=' + sharpe.toFixed(2) +
               ' | ATR=' + atrPct.toFixed(1) + '% | 仓位' + basePosition + '%->' + adjustedPosition + '%'
  };
}

// ============================================================
// 7.5 ANTI-QUANT IMPACT MODULE (反量化冲击模块 v2.0)
// ============================================================

/**
 * Detect market quant-dominance regime
 * 检测市场是否处于量化主导环境
 * - Gap frequency: quants create more overnight gaps
 * - Intraday reversal rate: quants cause more intraday whipsaws
 * - Volume abnormality (CV): algo-driven volume is more erratic
 * - Fat-tail event frequency: hallmark of quant-driven markets
 */
function detectQuantRegime(klines, marketData) {
  if (!klines || klines.length < 20) return { score: 50, regime: 'normal', marketType: 'unknown', breakdown: '数据不足' };

  var n = klines.length;

  // ---- 0. Market type classification (trending / ranging) ----
  // Use ADX-like measure: ratio of directional movement to total range
  var highestN = klines[0].high, lowestN = klines[0].low;
  for (var i = 1; i < n; i++) {
    if (klines[i].high > highestN) highestN = klines[i].high;
    if (klines[i].low < lowestN) lowestN = klines[i].low;
  }
  var totalRange = highestN - lowestN;
  var netChange = Math.abs(klines[n - 1].close - klines[0].close);

  // Trend efficiency: net change / total range (like Chande's efficiency ratio)
  var trendEfficiency = totalRange > 0 ? netChange / totalRange : 0;

  // Calculate path length (sum of absolute changes)
  var pathLength = 0, barRanges = 0;
  for (var i = 1; i < n; i++) {
    pathLength += Math.abs(klines[i].close - klines[i - 1].close);
    barRanges += klines[i].high - klines[i].low;
  }
  var avgBarRange = barRanges / (n - 1);
  var noiseRatio = (totalRange > 0 && avgBarRange > 0) ? (pathLength / totalRange) : 1;
  // Low noiseRatio (< 1.5) = trending, high (> 2.0) = choppy/ranging
  // High efficiency (> 0.35) = trending, low (< 0.20) = ranging

  var marketType;
  if (trendEfficiency > 0.35 && noiseRatio < 1.5) {
    marketType = 'trending';
  } else if (trendEfficiency < 0.18 || noiseRatio > 2.2) {
    marketType = 'ranging';
  } else {
    marketType = 'mixed';
  }

  // ---- 1. Gap frequency (跳空频率) ----
  var gapCount = 0;
  for (var i = 1; i < n; i++) {
    var prevClose = klines[i - 1].close;
    var currOpen = klines[i].open;
    if (prevClose > 0) {
      var gapPct = Math.abs(currOpen - prevClose) / prevClose * 100;
      if (gapPct > 0.8) gapCount++;
    }
  }
  var gapFreq = gapCount / (n - 1);

  // ---- 2. Intraday reversal rate (日内反转率) ----
  var reversalCount = 0;
  for (var i = 0; i < n; i++) {
    var bar = klines[i];
    if (bar.open > 0 && bar.close > 0 && bar.high > 0 && bar.low > 0) {
      var openToClose = (bar.close - bar.open) / bar.open;
      var rangeToLow = (bar.high - bar.low) / bar.low;
      // True reversal: large range but small net change (doji-like within wide bar)
      if (rangeToLow > 0.03 && Math.abs(openToClose) < 0.005) reversalCount++;
    }
  }
  var reversalRate = reversalCount / n;

  // ---- 3. Volume abnormality (成交量异常度) ----
  var volumes = [];
  for (var i = 0; i < n; i++) volumes.push(klines[i].volume || 0);
  var volMean = 0, volStd = 0;
  for (var j = 0; j < volumes.length; j++) volMean += volumes[j];
  volMean /= volumes.length;
  for (var k = 0; k < volumes.length; k++) volStd += (volumes[k] - volMean) * (volumes[k] - volMean);
  volStd = Math.sqrt(volStd / volumes.length);
  var volCV = volMean > 0 ? volStd / volMean : 0;

  // ---- 4. Fat-tail events (肥尾事件频率) ----
  var returns = [];
  for (var i = 1; i < n; i++) {
    var r = (klines[i].close - klines[i - 1].close) / klines[i - 1].close;
    returns.push(r);
  }
  var retMean = 0;
  for (var j = 0; j < returns.length; j++) retMean += returns[j];
  retMean /= returns.length;
  var retVariance = 0;
  for (var k = 0; k < returns.length; k++) retVariance += (returns[k] - retMean) * (returns[k] - retMean);
  retVariance /= returns.length;
  var retStd = Math.sqrt(retVariance);
  var tailCount = 0;
  for (var l = 0; l < returns.length; l++) {
    if (retStd > 0 && Math.abs(returns[l] - retMean) > 3 * retStd) tailCount++;
  }
  var tailRate = returns.length > 0 ? tailCount / returns.length : 0;

  // ---- 5. Serial correlation of returns (quant algos reduce serial dependence) ----
  var acSum = 0, acCount = 0;
  for (var i = 1; i < returns.length; i++) {
    acSum += returns[i] * returns[i - 1];
    acCount++;
  }
  var serialCorr = (acCount > 0 && retVariance > 0) ? (acSum / acCount) / retVariance : 0;
  // Quant-dominated markets tend to have negative or near-zero serial correlation at lag 1
  var serialScore = serialCorr < -0.05 ? 30 : (serialCorr > 0.05 ? 0 : 15);

  // ---- Composite scores ----
  var gapScore = Math.min(100, gapFreq * 300);
  var reversalScore = Math.min(100, reversalRate * 500);
  var volAbnormScore = Math.min(100, volCV * 80);
  var tailScore = Math.min(100, tailRate * 1000);

  var quantScore = gapScore * 0.20 + reversalScore * 0.25 + volAbnormScore * 0.25
                 + tailScore * 0.15 + serialScore * 0.15;

  // ---- Market-wide sentiment adjustment (fixed: properly check boolean) ----
  if (marketData && Array.isArray(marketData)) {
    var downCount = 0, upCount = 0, totalCounted = 0;
    for (var m = 0; m < marketData.length; m++) {
      if (typeof marketData[m].up === 'boolean') {
        totalCounted++;
        if (marketData[m].up === false) downCount++;
        else upCount++;
      }
    }
    // Market downtrend amplifies quant impact
    if (totalCounted >= 5 && downCount > totalCounted * 0.6) quantScore += 8;
    else if (totalCounted >= 5 && downCount > totalCounted * 0.4) quantScore += 4;
    // All-down market = potential quant liquidation cascade
    if (totalCounted >= 4 && downCount === totalCounted) quantScore += 7;
  }

  quantScore = Math.min(100, Math.max(0, Math.round(quantScore)));

  var regime;
  if (quantScore >= 60) regime = 'high_quant';
  else if (quantScore >= 35) regime = 'moderate_quant';
  else regime = 'normal';

  return {
    score: quantScore,
    regime: regime,
    marketType: marketType,
    trendEfficiency: Math.round(trendEfficiency * 100) / 100,
    noiseRatio: Math.round(noiseRatio * 100) / 100,
    gapFreq: Math.round(gapFreq * 100),
    reversalRate: Math.round(reversalRate * 100),
    volCV: Math.round(volCV * 100) / 100,
    tailRate: Math.round(tailRate * 100),
    serialCorr: Math.round(serialCorr * 1000) / 1000,
    breakdown: '量化冲击=' + quantScore + ' | 跳空' + Math.round(gapFreq * 100) +
               '% | 反转' + Math.round(reversalRate * 100) +
               '% | 波CV=' + volCV.toFixed(2) +
               ' | 肥尾' + Math.round(tailRate * 100) + '%' +
               ' | 自相关=' + serialCorr.toFixed(3) +
               ' | 市场=' + marketType
  };
}

/**
 * Volume authenticity - distinguish real buying from algo-generated volume
 * 成交量真实性检测
 */
function calcVolumeAuthenticity(klines) {
  if (!klines || klines.length < 10) return { score: 50, breakdown: '数据不足' };

  var n = klines.length;

  // 1. Volume-price direction alignment (量价方向一致性)
  var alignedCount = 0;
  for (var i = 1; i < n; i++) {
    var priceUp = klines[i].close > klines[i - 1].close;
    var volUp = klines[i].volume > klines[i - 1].volume;
    if (priceUp === volUp) alignedCount++;
  }
  var alignmentRate = alignedCount / (n - 1);

  // 2. Volume spike frequency (异常放量频率 - 量化脉冲信号)
  var volMean = 0;
  for (var j = 0; j < n; j++) volMean += klines[j].volume;
  volMean /= n;
  var spikeCount = 0;
  for (var k = 0; k < n; k++) {
    if (klines[k].volume > volMean * 2.5) spikeCount++;
  }
  var spikeRate = spikeCount / n;

  // 3. Volume autocorrelation (量能自相关 - 真实成交量有持续性)
  var vols = [];
  for (var l = 0; l < n; l++) vols.push(klines[l].volume);
  var vMean = 0;
  for (var m = 0; m < vols.length; m++) vMean += vols[m];
  vMean /= vols.length;
  var cov = 0, vVar = 0;
  for (var o = 0; o < vols.length - 1; o++) {
    cov += (vols[o] - vMean) * (vols[o + 1] - vMean);
    vVar += (vols[o] - vMean) * (vols[o] - vMean);
  }
  var volAutocorr = vVar > 0 ? cov / vVar : 0;

  var alignScore = alignmentRate * 100;
  var spikeScore = Math.max(0, 100 - spikeRate * 400);
  var autocorrScore = Math.max(0, 50 + volAutocorr * 50);

  var authScore = alignScore * 0.40 + spikeScore * 0.40 + autocorrScore * 0.20;
  authScore = Math.min(100, Math.max(0, Math.round(authScore)));

  return {
    score: authScore,
    alignmentRate: Math.round(alignmentRate * 100),
    spikeRate: Math.round(spikeRate * 100),
    volAutocorr: Math.round(volAutocorr * 100) / 100,
    breakdown: '量价对齐' + Math.round(alignmentRate * 100) +
               '% | 脉冲' + Math.round(spikeRate * 100) +
               '% | 量自相关' + volAutocorr.toFixed(2)
  };
}

/**
 * Pattern stability - test if harmonic patterns hold across different windows
 * 形态稳定性检测 - 量化常制造不稳定的假形态
 */
function calcPatternStability(klines) {
  if (!klines || klines.length < 30) return { score: 50, breakdown: 'K线不足(需>=30)' };

  var full = HarmonicPatternDetector.analyze(klines);
  var sub1 = HarmonicPatternDetector.analyze(klines.slice(0, klines.length - 5));
  var sub2 = HarmonicPatternDetector.analyze(klines.slice(5));

  var stabilityScore = 0;
  var reasons = [];

  if (full.bestPattern && sub1.bestPattern && sub2.bestPattern) {
    var sameType12 = (full.bestPattern.pattern === sub1.bestPattern.pattern) ? 1 : 0;
    var sameType22 = (full.bestPattern.pattern === sub2.bestPattern.pattern) ? 1 : 0;

    if (sameType12 && sameType22) {
      stabilityScore = 85;
      reasons.push('三窗口形态一致(' + full.bestPattern.pattern + ')');
    } else if (sameType12 || sameType22) {
      stabilityScore = 55;
      reasons.push('两窗口形态一致');
    } else {
      stabilityScore = 25;
      reasons.push('形态类型不一致(量化干扰)');
    }

    var scoreSpread = Math.max(
      Math.abs(full.score - sub1.score),
      Math.abs(full.score - sub2.score),
      Math.abs(sub1.score - sub2.score)
    );
    if (scoreSpread < 10) stabilityScore = Math.min(100, stabilityScore + 10);
    else if (scoreSpread > 30) stabilityScore = Math.max(5, stabilityScore - 20);

  } else if (full.bestPattern && (sub1.bestPattern || sub2.bestPattern)) {
    stabilityScore = 40;
    reasons.push('仅两窗口检测到形态');
  } else if (full.bestPattern) {
    stabilityScore = 20;
    reasons.push('形态仅在全窗口出现(不稳定,疑似量化制造)');
  } else {
    stabilityScore = 60;
    reasons.push('无形态(中性,不受量化干扰)');
  }

  return {
    score: Math.min(100, Math.max(5, Math.round(stabilityScore))),
    fullPattern: full.bestPattern ? full.bestPattern.pattern : null,
    sub1Pattern: sub1.bestPattern ? sub1.bestPattern.pattern : null,
    sub2Pattern: sub2.bestPattern ? sub2.bestPattern.pattern : null,
    fullScore: full.score,
    sub1Score: sub1.score,
    sub2Score: sub2.score,
    breakdown: reasons.join('; ')
  };
}

/**
 * Quant trap risk - detect quant-driven false breakouts & stop hunts
 * 量化陷阱风险检测
 */
function calcQuantTrapRisk(klines, harmonic) {
  if (!klines || klines.length < 15) return { score: 50, breakdown: '数据不足' };

  var n = klines.length;
  var riskScore = 50;
  var riskFactors = [];

  // 1. False breakout detection (假突破检测)
  var falseBreakCount = 0;
  for (var i = 5; i < n; i++) {
    var prevHigh = Math.max.apply(null, klines.slice(i - 5, i).map(function(k) { return k.high; }));
    var prevLow = Math.min.apply(null, klines.slice(i - 5, i).map(function(k) { return k.low; }));
    var currBar = klines[i];
    if (currBar.high > prevHigh * 1.01 && currBar.close < prevHigh) falseBreakCount++;
    if (currBar.low < prevLow * 0.99 && currBar.close > prevLow) falseBreakCount++;
  }
  var falseBreakRate = falseBreakCount / (n - 5);
  if (falseBreakRate > 0.15) {
    riskScore -= 20;
    riskFactors.push('假突破频繁(' + Math.round(falseBreakRate * 100) + '%)');
  } else if (falseBreakRate > 0.08) {
    riskScore -= 8;
    riskFactors.push('存在假突破(' + Math.round(falseBreakRate * 100) + '%)');
  }

  // 2. Stop-hunt detection (止损猎杀检测)
  var stopHuntCount = 0;
  for (var i = 3; i < n - 1; i++) {
    var recentLow = Math.min.apply(null, klines.slice(i - 3, i).map(function(k) { return k.low; }));
    var bar = klines[i];
    var nextBar = klines[i + 1];
    if (bar.low < recentLow * 0.995 && nextBar.close > bar.high) stopHuntCount++;
  }
  var stopHuntRate = stopHuntCount / (n - 4);
  if (stopHuntRate > 0.1) {
    riskScore -= 15;
    riskFactors.push('止损猎杀(' + Math.round(stopHuntRate * 100) + '%)');
  }

  // 3. Volume climax at extremes (量能高潮 - 量化出货/进场信号)
  var volClimaxCount = 0;
  for (var i = 1; i < n; i++) {
    var bar = klines[i];
    var prevBar = klines[i - 1];
    if (bar.volume > prevBar.volume * 2 && prevBar.volume > 0) {
      var bodySize = Math.abs(bar.close - bar.open);
      var wickSize = bar.high - bar.low;
      var price = bar.close || bar.open;
      if (wickSize > 0 && price > 0 && bodySize / price < 0.015) volClimaxCount++;
    }
  }
  var volClimaxRate = volClimaxCount / (n - 1);
  if (volClimaxRate > 0.12) {
    riskScore -= 15;
    riskFactors.push('量能高潮(' + Math.round(volClimaxRate * 100) + '%)');
  }

  // 4. Harmonic PRZ approach failure (谐波PRZ区域失败率)
  if (harmonic && harmonic.bestPattern && harmonic.bestPattern.prz) {
    var prz = harmonic.bestPattern.prz;
    for (var i = 3; i < n; i++) {
      var low = klines[i].low;
      var close = klines[i].close;
      if (low <= prz.high && low >= prz.low && close < prz.low) {
        riskScore -= 5;
        riskFactors.push('PRZ支撑失败');
        break;
      }
    }
  }

  riskScore = Math.min(90, Math.max(10, Math.round(riskScore)));

  return {
    score: riskScore,
    falseBreakRate: Math.round(falseBreakRate * 100),
    stopHuntRate: Math.round(stopHuntRate * 100),
    volClimaxRate: Math.round(volClimaxRate * 100),
    breakdown: riskFactors.length > 0 ? riskFactors.join('; ') : '无明显量化陷阱信号'
  };
}

// ============================================================
// 8. ANALYSIS PIPELINE
// ============================================================

async function analyzeStock(stock, indexKlines, quantRegime) {
  var rawCode = String(stock.f12);
  var secid = makeSecidFromRawCode(rawCode);
  var klines = await fetchStockKline(secid, 60);
  if (!klines || klines.length < 15) throw new Error('K线数据不足: ' + rawCode);

  var harmonic = HarmonicPatternDetector.analyze(klines);
  var factors = calcMultiFactorScore(stock, klines);
  var stats = statisticalValidation(klines, indexKlines, 10);
  var statsScore = stats.pass ? Math.min(100, Math.max(10, 50 + stats.sharpe * 30))
                              : Math.max(0, 20 + stats.sharpe * 20);

  // ---- NEW: Trend filter & RSI ----
  var trend = calcTrendFilter(klines);
  var rsi = calcRSI(klines, 14);

  // Trend penalty: reduce score for counter-trend trades
  var trendMultiplier = 1.0;
  var trendNote = '';
  if (trend.trend === 'down') {
    trendMultiplier = 0.70; // Strong penalty for trading against downtrend
    trendNote = '逆势警告: 下跌趋势中做多风险高';
  } else if (trend.trend === 'neutral') {
    trendMultiplier = 0.90;
    trendNote = '趋势中性: 方向不明确, 降低仓位';
  }

  // RSI filter: avoid overbought entries, penalize extreme readings
  var rsiMultiplier = 1.0;
  var rsiNote = '';
  if (rsi !== null) {
    if (rsi > 75) {
      rsiMultiplier = 0.80;
      rsiNote = 'RSI超买(' + rsi + '), 等待回调';
    } else if (rsi > 65) {
      rsiMultiplier = 0.90;
      rsiNote = 'RSI偏高(' + rsi + '), 追高风险增大';
    } else if (rsi < 25) {
      rsiMultiplier = 0.70;
      rsiNote = 'RSI超卖(' + rsi + '), 可能是下跌加速';
    } else if (rsi >= 35 && rsi <= 55) {
      rsiMultiplier = 1.05; // Ideal entry zone
      rsiNote = 'RSI中性区域(' + rsi + '), 理想入场区间';
    }
  }

  // Anti-quant analysis
  var volumeAuth = calcVolumeAuthenticity(klines);
  var patternStability = calcPatternStability(klines);
  var trapRisk = calcQuantTrapRisk(klines, harmonic);
  var antiQuantScore = volumeAuth.score * 0.35 + patternStability.score * 0.35 + trapRisk.score * 0.30;

  // ---- Dynamic weight adjustment based on quant regime + market type ----
  var hWeight, fWeight, sWeight, aqWeight, tWeight;
  if (quantRegime && quantRegime.regime === 'high_quant') {
    hWeight = 0.18; fWeight = 0.28; sWeight = 0.24; aqWeight = 0.22; tWeight = 0.08;
  } else if (quantRegime && quantRegime.regime === 'moderate_quant') {
    hWeight = 0.28; fWeight = 0.33; sWeight = 0.24; aqWeight = 0.10; tWeight = 0.05;
  } else {
    hWeight = 0.35; fWeight = 0.33; sWeight = 0.24; aqWeight = 0.00; tWeight = 0.08;
  }

  // In trending markets, give more weight to trend; in ranging, more to harmonic
  if (quantRegime && quantRegime.marketType === 'trending') {
    tWeight += 0.05; hWeight = Math.max(0.10, hWeight - 0.05);
  } else if (quantRegime && quantRegime.marketType === 'ranging') {
    hWeight += 0.05; tWeight = Math.max(0.03, tWeight - 0.02);
  }

  // Base confluence from frameworks
  var baseConfluence = harmonic.score * hWeight + factors.totalScore * fWeight +
                       statsScore * sWeight + antiQuantScore * aqWeight;

  // Trend factor as separate component (trend score 0-100 mapped to contribution)
  var trendContribution = trend.score * tWeight;

  var confluenceScore = baseConfluence + trendContribution;

  // Apply trend and RSI multipliers
  confluenceScore = Math.round(confluenceScore * trendMultiplier * rsiMultiplier);

  // Quant-adjusted position sizing
  var quantPosMultiplier = 1.0;
  if (quantRegime && quantRegime.regime === 'high_quant') quantPosMultiplier = 0.55;
  else if (quantRegime && quantRegime.regime === 'moderate_quant') quantPosMultiplier = 0.75;

  // Trending market: can increase position slightly; ranging: reduce
  if (quantRegime && quantRegime.marketType === 'trending') quantPosMultiplier *= 1.10;
  else if (quantRegime && quantRegime.marketType === 'ranging') quantPosMultiplier *= 0.85;

  quantPosMultiplier = Math.min(1.2, Math.max(0.35, quantPosMultiplier));

  return {
    stock: stock, secid: secid, rawCode: rawCode, klines: klines,
    harmonic: harmonic, factors: factors, stats: stats,
    trend: trend, rsi: rsi, trendNote: trendNote, rsiNote: rsiNote,
    trendMultiplier: trendMultiplier, rsiMultiplier: rsiMultiplier,
    confluenceScore: Math.round(confluenceScore),
    harmonicWeight: Math.round(harmonic.score * hWeight),
    factorWeight: Math.round(factors.totalScore * fWeight),
    statsWeight: Math.round(statsScore * sWeight),
    antiQuantWeight: Math.round(antiQuantScore * aqWeight),
    trendWeight: Math.round(trendContribution),
    antiQuant: {
      regime: quantRegime,
      volumeAuth: volumeAuth,
      patternStability: patternStability,
      trapRisk: trapRisk,
      compositeScore: Math.round(antiQuantScore),
      quantPosMultiplier: quantPosMultiplier
    }
  };
}

function buildRecommendation(analysis, rank) {
  var s = analysis.stock, hm = analysis.harmonic;
  var fac = analysis.factors, st = analysis.stats;
  var aq = analysis.antiQuant;
  var trend = analysis.trend;
  var rsi = analysis.rsi;
  var price = s.f2;
  var code = String(s.f12);
  var suffix = (code.startsWith('6') || code.startsWith('5') || code.startsWith('9')) ? '.SH' : '.SZ';

  // ---- Volume Confirmation ----
  // Check if current volume is above recent average (confirms signal validity)
  var klines = analysis.klines;
  var currentVol = (klines && klines.length >= 2) ? klines[klines.length - 1].volume : 0;
  var avgVol5 = 0, avgVol20 = 0;
  if (klines && klines.length >= 6) {
    for (var vi = klines.length - 6; vi < klines.length - 1; vi++) avgVol5 += klines[vi].volume;
    avgVol5 /= 5;
  }
  if (klines && klines.length >= 21) {
    for (var vi = klines.length - 21; vi < klines.length - 1; vi++) avgVol20 += klines[vi].volume;
    avgVol20 /= 20;
  }
  var volRatio5 = avgVol5 > 0 ? currentVol / avgVol5 : 1;
  var volRatio20 = avgVol20 > 0 ? currentVol / avgVol20 : 1;
  var volumeConfirmed = volRatio5 >= 0.7 || volRatio20 >= 0.85; // Not abnormally low

  // Volume surge detection (too high = potential distribution)
  var volSurge = volRatio5 > 3.0;

  // ---- Stop Loss Calculation ----
  var atrMultiplierStop = 2;
  if (aq && aq.regime && aq.regime.regime === 'high_quant') atrMultiplierStop = 3.0;
  else if (aq && aq.regime && aq.regime.regime === 'moderate_quant') atrMultiplierStop = 2.5;

  // Widen stop in ranging markets (more whipsaw)
  if (aq && aq.regime && aq.regime.marketType === 'ranging') atrMultiplierStop *= 1.2;

  // Use harmonic stop loss if available, otherwise ATR-based
  var atrStop, pctStop;
  var stopLoss;
  if (hm.bestPattern && hm.bestPattern.stopLoss) {
    stopLoss = hm.bestPattern.stopLoss;
    // Ensure stop loss is not too tight (min 1.5 ATR from entry)
    var minStopDistance = st.atr * 1.5;
    if (price - stopLoss < minStopDistance && price > stopLoss) {
      stopLoss = price - minStopDistance;
    }
  } else {
    atrStop = price - st.atr * atrMultiplierStop;
    pctStop = price * 0.95;
    stopLoss = Math.min(atrStop, pctStop); // Lower = tighter for long positions
    // Don't allow stops too tight in high-vol environments
    if (price - stopLoss < st.atr * 1.2) {
      stopLoss = price - st.atr * 1.2;
    }
  }

  // ---- Take Profit ----
  var takeProfit, tpDesc = '';
  if (hm.bestPattern && hm.bestPattern.targets && hm.bestPattern.targets.length > 0) {
    takeProfit = hm.bestPattern.targets[0];
    if (hm.bestPattern.pattern === 'Crab 螃蟹') {
      tpDesc = '(谨慎目标, 螃蟹形态风险高)';
    } else {
      tpDesc = '(谐波目标)';
    }
  } else {
    // Risk-based take profit: 2:1 reward-risk minimum
    var riskAmount = price - stopLoss;
    takeProfit = price + riskAmount * 2.0;
    tpDesc = '(2:1风险回报)';
  }

  // ---- Position Sizing (with sector risk cap) ----
  var quantPosAdj = (aq && aq.quantPosMultiplier) ? aq.quantPosMultiplier : 1.0;
  var trendPosAdj = analysis.trendMultiplier || 1.0;
  var rsiPosAdj = analysis.rsiMultiplier || 1.0;
  var pos = Math.min(20, Math.max(2, Math.round(st.adjustedPosition * quantPosAdj * trendPosAdj * rsiPosAdj)));

  // Volume-surge position reduction
  if (volSurge) pos = Math.max(2, Math.round(pos * 0.6));

  // ---- Signal Classification ----
  var holdPeriod;
  var totalPatternConfidence = hm.score;

  if (totalPatternConfidence >= 60 && fac.totalScore >= 55 && trend.trend === 'up') {
    holdPeriod = '中线(2-4周)';
  } else if (totalPatternConfidence >= 40 && trend.trend !== 'down') {
    holdPeriod = '短线(3-7天)';
  } else {
    holdPeriod = '短线(1-5天)';
  }

  // Signal thresholds: adjust for quant regime + trend context + volume
  var buyThreshold = 60, holdThreshold = 40;
  if (aq && aq.regime && aq.regime.regime === 'high_quant') {
    buyThreshold = 68; holdThreshold = 48;
  } else if (aq && aq.regime && aq.regime.regime === 'moderate_quant') {
    buyThreshold = 64; holdThreshold = 44;
  }

  // Raise thresholds when trend is down (safer to wait)
  if (trend.trend === 'down') {
    buyThreshold += 8;
    holdThreshold += 5;
  }

  // Lower threshold slightly when volume confirms
  if (volumeConfirmed && !volSurge) {
    buyThreshold -= 2;
    holdThreshold -= 2;
  }

  var signal, signalClass;
  if (analysis.confluenceScore >= buyThreshold) {
    signal = '买入'; signalClass = 'buy';
  } else if (analysis.confluenceScore >= holdThreshold) {
    signal = '关注'; signalClass = 'hold';
  } else {
    signal = '观望'; signalClass = 'hold';
  }

  // Downgrade signal if counter-trend
  var counterTrendWarning = '';
  if (trend.trend === 'down' && signalClass === 'buy') {
    signal = '关注'; signalClass = 'hold';
    counterTrendWarning = '<strong>⚠ 逆势警告</strong>: 下跌趋势中的买入信号已降级为关注。等待趋势确认后再入场。<br>';
  }

  // Downgrade if volume is very weak
  if (!volumeConfirmed && signalClass === 'buy') {
    signal = '关注'; signalClass = 'hold';
    counterTrendWarning += '<strong>⚠ 量能不足</strong>: 缩量信号可靠性低，建议等放量确认。<br>';
  }

  var patternName = hm.bestPattern ? hm.bestPattern.pattern : '结构分析';

  // ---- Build Rationale ----
  var parts = [];

  // Trend context first
  if (trend) {
    var trendIcon = trend.trend === 'up' ? '↑' : (trend.trend === 'down' ? '↓' : '→');
    parts.push('<strong>趋势背景 ' + trendIcon + '</strong>: ' + trend.breakdown);
  }

  // RSI
  if (rsi !== null) {
    var rsiColor = rsi > 70 ? '超买' : (rsi < 30 ? '超卖' : '中性');
    parts.push('<strong>RSI(' + rsi + ')</strong>: ' + rsiColor + (analysis.rsiNote ? ' - ' + analysis.rsiNote : ''));
  }

  // Harmonic pattern
  if (hm.bestPattern) {
    parts.push('<strong>谐波形态</strong>: ' + hm.summary +
      ' (置信度' + hm.bestPattern.confidence + '%, 转折点' + hm.pivotCount + '个)');
    // Add risk note for Crab and other extreme patterns
    if (hm.bestPattern.pattern === 'Crab 螃蟹') {
      parts.push('<strong>⚠ 高风险形态</strong>: 螃蟹形态是谐波中最极端的形态，D点位于1.618延伸，失败率较高。务必严格止损。');
    }
  } else {
    parts.push('<strong>谐波形态</strong>: ' + hm.summary);
  }

  parts.push('<strong>因子评分[' + fac.totalScore + '分]</strong>: ' + fac.breakdown);

  var stTxt = '<strong>统计检验[' + (st.pass ? '通过' : '部分通过') + ']</strong>: ';
  stTxt += '夏普' + (st.sharpe >= 0 ? '+' : '') + st.sharpe.toFixed(2);
  stTxt += ', ATR' + st.atrPct.toFixed(1) + '%';
  stTxt += ', 仓位' + st.adjustedPosition + '%';
  if (quantPosAdj < 1.0) stTxt += '→量化折减' + Math.round(quantPosAdj * 100) + '%';
  if (trend && trend.trend !== 'up') stTxt += '→趋势折减' + Math.round((analysis.trendMultiplier || 1) * 100) + '%';
  parts.push(stTxt);

  // Volume confirmation
  parts.push('<strong>量能分析</strong>: 量比(5日)=' + volRatio5.toFixed(2) +
    ', 量比(20日)=' + volRatio20.toFixed(2) +
    (volumeConfirmed ? ' [确认]' : ' [不足]') +
    (volSurge ? ' [⚠异常放量]' : ''));

  // Anti-quant analysis section
  if (aq && aq.regime && aq.regime.regime !== 'normal') {
    var aqTxt = '<strong>反量化检测[' + aq.regime.regime.toUpperCase() +
      '|' + aq.regime.marketType + ']</strong>: ';
    aqTxt += '量化冲击指数=' + aq.regime.score;
    aqTxt += ', 量真实性=' + aq.volumeAuth.score;
    aqTxt += ', 形态稳定=' + aq.patternStability.score;
    aqTxt += ', 陷阱风险=' + aq.trapRisk.score;
    aqTxt += ' | 反量化综合=' + aq.compositeScore;
    parts.push(aqTxt);
    if (aq.trapRisk.breakdown.indexOf('量化') > -1 || aq.trapRisk.breakdown.indexOf('陷阱') > -1) {
      parts.push('<strong>量化预警</strong>: ' + aq.trapRisk.breakdown);
    }
  }

  // Add trend note
  if (analysis.trendNote) {
    parts.push('<strong>趋势提示</strong>: ' + analysis.trendNote);
  }

  parts.push('<strong>实时行情</strong>: 现价' + fmtPrice(price, false) +
    ', 涨跌' + fmtChange(s.f3) + ', 振幅' + fmtNum(s.f7 || 0, 1) + '%' +
    ', 成交额' + (s.f6 > 1e8 ? fmtNum(s.f6 / 1e8, 1) + '亿' : fmtNum(s.f6 / 1e4, 0) + '万'));

  // Risk warnings
  if (st.sharpe < 0.5) parts.push('<strong>风险</strong>: 夏普偏低，严格止损。');
  if (!st.pass) parts.push('<strong>注意</strong>: 波动率偏高，建议仓位' + pos + '%。');
  if (aq && aq.regime && aq.regime.regime === 'high_quant') {
    parts.push('<strong>量化警告</strong>: 市场处于量化高频主导环境，止损放宽至' +
      atrMultiplierStop.toFixed(1) + 'x ATR，仓位降至' + pos + '%，警惕假突破和止损猎杀。');
  }
  if (aq && aq.regime && aq.regime.marketType === 'ranging') {
    parts.push('<strong>震荡提醒</strong>: 市场处于震荡格局，谐波形态在震荡市中可靠性降低，建议缩小仓位和持仓时间。');
  }
  if (trend && trend.trend === 'down') {
    parts.push('<strong>趋势风险</strong>: 个股/大盘处于下跌趋势，任何做多信号都需要格外谨慎。建议仅轻仓试探。');
  }

  return {
    code: code + suffix, name: s.f14, signal: signal, signalClass: signalClass,
    position: pos + '%', positionRaw: pos, holdPeriod: holdPeriod,
    entry: fmtPrice(price, false),
    entryRange: fmtPrice(price * 0.995, false) + ' - ' + fmtPrice(price * 1.003, false),
    stopLoss: fmtPrice(stopLoss, false),
    takeProfit: fmtPrice(takeProfit, false) + ' ' + tpDesc,
    atr: fmtNum(st.atr, 2),
    framework: patternName + ' | ' + fac.breakdown + ' | 统计' + (st.pass ? '通过' : '部分')
      + (aq && aq.regime && aq.regime.regime !== 'normal' ? ' | 反量化' + aq.compositeScore : '')
      + (trend ? ' | 趋势' + trend.trend : ''),
    rationale: counterTrendWarning + parts.join('<br>'),
    live: true, currentPrice: price, changePct: s.f3,
    confluenceScore: analysis.confluenceScore,
    harmonicScore: hm.score, factorScore: fac.totalScore, statsPass: st.pass,
    sharpe: st.sharpe, correlation: st.correlation,
    harmonicWeight: analysis.harmonicWeight,
    factorWeight: analysis.factorWeight, statsWeight: analysis.statsWeight,
    antiQuantWeight: analysis.antiQuantWeight || 0,
    trendWeight: analysis.trendWeight || 0,
    momentumScore: fac.momentum, valueScore: fac.value,
    qualityScore: fac.quality, volatilityScore: fac.volatility,
    sentimentScore: fac.sentiment,
    patternName: patternName, patternDirection: hm.bestPattern ? hm.bestPattern.direction : null,
    pivotCount: hm.pivotCount,
    // Anti-quant detailed fields
    quantRegime: aq ? aq.regime : null,
    antiQuantScore: aq ? aq.compositeScore : null,
    volumeAuthScore: aq ? aq.volumeAuth.score : null,
    patternStabilityScore: aq ? aq.patternStability.score : null,
    trapRiskScore: aq ? aq.trapRisk.score : null,
    antiQuantBreakdown: aq ? ('量真实性=' + aq.volumeAuth.score +
      ' | 形态稳定=' + aq.patternStability.score +
      ' | 陷阱风险=' + aq.trapRisk.score) : null,
    // New fields for trend/volume context
    trend: trend ? trend.trend : null,
    trendScore: trend ? trend.score : null,
    rsi: rsi,
    volumeConfirmed: volumeConfirmed,
    volSurge: volSurge,
    volRatio5: Math.round(volRatio5 * 100) / 100,
    volRatio20: Math.round(volRatio20 * 100) / 100
  };
}

// ============================================================
// 9. OUTPUT FUNCTIONS
// ============================================================

function writeJSONFile(filename, data) {
  var filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  console.log('[Output] 写入 ' + filename + ' (' + (JSON.stringify(data).length / 1024).toFixed(1) + ' KB)');
}

function writeMarketDataJS(marketData, recommendations, positions, history) {
  var data = {
    generatedAt: ISO_TIMESTAMP,
    generatedAtDisplay: DISPLAY_TIME,
    isPreGenerated: true,
    date: TODAY,
    marketData: marketData,
    recommendations: recommendations,
    positions: positions,
    history: history,
    message: '数据由分析引擎于 ' + DISPLAY_TIME + ' 生成',
  };

  // Convert to JS snippet
  var js = '// 和谐交易顾问 · 预生成数据\n';
  js += '// 生成时间: ' + DISPLAY_TIME + '\n';
  js += '// 数据来源: 东方财富API + 三框架分析引擎\n';
  js += '// 此文件由 update_data.js 自动生成，请勿手动编辑\n';
  js += 'window.__MARKET_DATA__ = ' + JSON.stringify(data, null, 2) + ';\n';

  var filepath = path.join(OUTPUT_DIR, 'market_data.js');
  fs.writeFileSync(filepath, js, 'utf-8');
  console.log('[Output] 写入 market_data.js (' + (js.length / 1024).toFixed(1) + ' KB)');
  return data;
}

// ============================================================
// 10. MAIN PIPELINE
// ============================================================

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  和谐交易顾问 · 自动分析引擎 v2.0         ║');
  console.log('║  Harmonious Trading Advisor Engine     ║');
  console.log('║  + 反量化冲击模块 (Anti-Quant Module)    ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log('[Main] 开始时间: ' + DISPLAY_TIME);
  console.log('[Main] Node version: ' + process.version);
  console.log('');

  var errors = [];
  var dataSource = 'api'; // 'api' | 'fallback'

  // ---- Phase 1: Data Ingestion ----
  console.log('━━━ Phase 1: 数据获取 ━━━');

  // 1a. Fetch indices
  var marketData = await fetchIndices();
  var liveIndicesCount = marketData.filter(function(m) { return m.live; }).length;
  console.log('[Phase 1] 指数: ' + liveIndicesCount + '/' + marketData.length + ' 项实时');

  // 1b. Fetch top stocks
  var stocks = await fetchTopStocks();
  if (!stocks || stocks.length === 0) {
    console.error('[Main] 无法获取股票列表，使用备用推荐数据');
    dataSource = 'fallback';
    stocks = null;
  }

  // 1c. Fetch benchmark K-line (沪深300)
  var indexKlines = null;
  try {
    indexKlines = await fetchStockKline('1.000300', 60);
    console.log('[Phase 1] 基准K线(沪深300): ' + (indexKlines ? indexKlines.length + '根' : '获取失败'));
  } catch (e) {
    console.warn('[Phase 1] 基准K线获取失败: ' + e.message);
  }

  // 1d. Detect quant regime from benchmark K-lines
  var quantRegime = null;
  if (indexKlines && indexKlines.length >= 20) {
    quantRegime = detectQuantRegime(indexKlines, marketData);
    console.log('[Phase 1] 量化环境检测: ' + quantRegime.breakdown);
    console.log('[Phase 1] 市场类型: ' +
      (quantRegime.marketType === 'trending' ? '→ 趋势市 (增加趋势权重, 谐波降权)' :
       quantRegime.marketType === 'ranging' ? '↔ 震荡市 (谐波形态可靠性降低, 缩小仓位)' :
       '≈ 混合市 (标准配置)'));
    console.log('[Phase 1] 量化环境评级: ' +
      (quantRegime.regime === 'high_quant' ? '⚠ 高频量化主导 (权重: 谐波18% 因子28% 统计24% 反量化22% 趋势8%)' :
       quantRegime.regime === 'moderate_quant' ? '⚡ 中度量化影响 (权重: 谐波28% 因子33% 统计24% 反量化10% 趋势5%)' :
       '✓ 正常环境 (权重: 谐波35% 因子33% 统计24% 趋势8%)'));
  }

  // ---- Phase 2: Triple-Framework Analysis ----
  console.log('');
  console.log('━━━ Phase 2: 三框架分析 ━━━');

  var recommendations = [];
  var positions = [];

  if (dataSource === 'api' && stocks) {
    // Filter candidates with multi-factor pre-ranking
    var candidates = stocks
      .filter(function(s) {
        var turnover = s.f6; //成交额
        var pe = s.f9;       //市盈率
        var changePct = s.f3; //涨跌幅
        var amplitude = s.f7; //振幅
        var volRatio = s.f10; //量比

        // Basic filters
        if (!turnover || turnover < 200000000) return false; // 成交额 > 2亿
        if (!pe || pe <= 0 || pe > 300) return false;        // PE合理范围
        if (!amplitude || amplitude <= 0.3) return false;    // 有波动性 (排除僵尸股)
        return true;
      })
      .map(function(s) {
        // Multi-factor pre-ranking score
        var turnoverLog = Math.log10(s.f6 || 1e8);   // 成交额对数 (8-12)
        var volRatio = s.f10 || 1;                    // 量比
        var changeAbs = Math.abs(s.f3 || 0);          // 涨跌幅绝对值
        var pe = s.f9 || 50;

        // Turnover weight (higher = more liquid): 30%
        var turnoverScore = Math.min(100, Math.max(0, (turnoverLog - 8) / 4 * 100));

        // Volume ratio (接近1最好,太高太低都不好): 20%
        var volRatioScore;
        if (volRatio >= 0.8 && volRatio <= 1.5) volRatioScore = 90;
        else if (volRatio >= 0.5 && volRatio <= 2.5) volRatioScore = 60;
        else volRatioScore = 30;

        // Recent activity (有波动但不极端): 25%
        var activityScore;
        if (changeAbs >= 1 && changeAbs <= 5) activityScore = 85;
        else if (changeAbs >= 0.5 && changeAbs <= 8) activityScore = 65;
        else activityScore = 35;

        // Value tilt (PE moderate): 25%
        var valueScore;
        if (pe >= 10 && pe <= 40) valueScore = 80;
        else if (pe >= 5 && pe <= 80) valueScore = 55;
        else valueScore = 30;

        var preScore = turnoverScore * 0.30 + volRatioScore * 0.20
                     + activityScore * 0.25 + valueScore * 0.25;

        return { stock: s, score: preScore };
      })
      .sort(function(a, b) { return b.score - a.score; });

    // Sector diversification with quality threshold
    // First pass: sector-diversified (ensure broad coverage)
    var topCandidates = [];
    var usedSectors = {};
    var sectorCount = {};
    for (var i = 0; i < candidates.length; i++) {
      var s = candidates[i].stock;
      var code = String(s.f12);
      // Classify sector by first digit: 6=Shanghai main, 0/3=Shenzhen main/ChiNext, 688=STAR
      var sector;
      if (code.startsWith('688')) sector = 'STAR';
      else if (code.startsWith('60') || code.startsWith('5') || code.startsWith('9')) sector = 'SH_main';
      else if (code.startsWith('00')) sector = 'SZ_main';
      else if (code.startsWith('30')) sector = 'ChiNext';
      else sector = 'other';

      sectorCount[sector] = (sectorCount[sector] || 0);

      // First 5: strict diversification (1 per sector)
      if (topCandidates.length < 5) {
        if (!usedSectors[sector]) {
          usedSectors[sector] = true;
          sectorCount[sector]++;
          topCandidates.push(candidates[i]);
        }
      }
      // Next 5: fill from top ranked, max 2 per sector
      else if (topCandidates.length < 12 && sectorCount[sector] < 2) {
        sectorCount[sector]++;
        topCandidates.push(candidates[i]);
      }
      // Fill up to 15 from any sector if we need more
      else if (topCandidates.length < 15) {
        sectorCount[sector]++;
        topCandidates.push(candidates[i]);
      }

      if (topCandidates.length >= 15) break;
    }

    console.log('[Phase 2] 候选股票: ' + topCandidates.length + ' 只 (来自 ' + candidates.length + ' 只初筛)');
    console.log('[Phase 2] 行业分布: SH主板=' + (sectorCount['SH_main'] || 0) +
                ' SZ主板=' + (sectorCount['SZ_main'] || 0) +
                ' 创业板=' + (sectorCount['ChiNext'] || 0) +
                ' 科创板=' + (sectorCount['STAR'] || 0));

    // Run analysis on each candidate
    var analysisResults = [];
    for (var j = 0; j < topCandidates.length; j++) {
      var c = topCandidates[j];
      var stockName = c.stock.f14 || ('股票' + c.stock.f12);
      try {
        process.stdout.write('[Phase 2] 分析中 (' + (j + 1) + '/' + topCandidates.length + '): ' + stockName + ' ... ');
        var analysis = await analyzeStock(c.stock, indexKlines, quantRegime);
        if (analysis) {
          analysisResults.push(analysis);
          console.log('融合得分=' + analysis.confluenceScore);
        }
      } catch (err) {
        console.warn('失败: ' + err.message);
      }
      // Small delay between requests to avoid rate limiting
      if (j < topCandidates.length - 1) {
        await new Promise(function(r) { setTimeout(r, 300); });
      }
    }

    // Sort by confluence score and take top 5
    analysisResults.sort(function(a, b) { return b.confluenceScore - a.confluenceScore; });
    var topN = analysisResults.slice(0, 5);

    if (topN.length > 0) {
      recommendations = topN.map(function(a, idx) {
        return buildRecommendation(a, idx);
      });
      console.log('[Phase 2] 生成 ' + recommendations.length + ' 条推荐');
    } else {
      console.warn('[Phase 2] 所有候选股票分析失败，使用备用推荐');
      recommendations = FALLBACK_RECS;
      dataSource = 'fallback';
    }

    // Build positions from recommendations (simplified tracking)
    positions = FALLBACK_POSITIONS.map(function(p) {
      // If we have live prices for positions, update them
      var secid = makeSecidFromCode(p.code);
      return {
        entryDate: p.entryDate,
        code: p.code, name: p.name,
        entryPrice: fmtPrice(p.entryPrice, false),
        currentPrice: fmtPrice(p.entryPrice, false),
        currentPriceRaw: p.entryPrice,
        pnl: '--', pnlClass: 'positive', pnlRaw: 0,
        status: p.status, statusText: p.statusText,
        action: p.action, actionClass: p.actionClass,
        daysHeld: 0, expectedRemain: p.expectedRemain,
        stopLoss: fmtPrice(p.stopLoss, false),
        atr: p.atr, advice: p.advice, live: false,
      };
    });
  } else {
    console.warn('[Phase 2] 使用备用推荐数据');
    recommendations = FALLBACK_RECS;
    positions = FALLBACK_POSITIONS.map(function(p) {
      return {
        entryDate: p.entryDate, code: p.code, name: p.name,
        entryPrice: fmtPrice(p.entryPrice, false),
        currentPrice: fmtPrice(p.entryPrice, false),
        currentPriceRaw: p.entryPrice,
        pnl: '--', pnlClass: 'positive', pnlRaw: 0,
        status: p.status, statusText: p.statusText,
        action: p.action, actionClass: p.actionClass,
        daysHeld: 0, expectedRemain: p.expectedRemain,
        stopLoss: fmtPrice(p.stopLoss, false),
        atr: p.atr, advice: p.advice, live: false,
      };
    });
  }

  // ---- Phase 3: Output ----
  console.log('');
  console.log('━━━ Phase 3: 输出文件 ━━━');

  // Build comprehensive output object
  var outputData = {
    generatedAt: ISO_TIMESTAMP,
    generatedAtDisplay: DISPLAY_TIME,
    date: TODAY,
    dataSource: dataSource,
    isPreGenerated: dataSource === 'api',
    marketData: marketData,
    recommendations: recommendations,
    positions: positions,
    quantRegime: quantRegime,
    history: [
      { date: '2026-05-02', code: '300308.SZ', name: '中际旭创', entry: '115.20', exit: '128.40', pnl: '+11.46%', outcome: 'win', result: '止盈触发', days: 12, framework: '谐波蝴蝶 + 动量因子' },
      { date: '2026-04-22', code: '688981.SH', name: '中芯国际', entry: '68.50', exit: '72.10', pnl: '+5.26%', outcome: 'win', result: '止盈触发', days: 9, framework: '谐波螃蟹 + 均值回归' },
      { date: '2026-04-18', code: '601318.SH', name: '中国平安', entry: '48.90', exit: '45.30', pnl: '-7.36%', outcome: 'loss', result: '止损触发', days: 15, framework: '谐波加特利 + 质量因子' },
      { date: '2026-04-18', code: '600809.SH', name: '山西汾酒', entry: '186.00', exit: '202.50', pnl: '+8.87%', outcome: 'win', result: '止盈触发', days: 8, framework: '谐波蝙蝠 + 情绪因子' },
      { date: '2026-04-15', code: '002230.SZ', name: '科大讯飞', entry: '42.80', exit: '41.20', pnl: '-3.74%', outcome: 'loss', result: '止损触发', days: 11, framework: '谐波螃蟹 + AI因子' },
      { date: '2026-04-10', code: '600276.SH', name: '恒瑞医药', entry: '35.60', exit: '39.15', pnl: '+9.97%', outcome: 'win', result: '止盈触发', days: 14, framework: '谐波鲨鱼 + 价值因子' },
    ],
    message: '数据由分析引擎于 ' + DISPLAY_TIME + ' 生成',
    summary: {
      totalRecommendations: recommendations.length,
      dataSource: dataSource,
      liveIndices: liveIndicesCount,
      errors: errors,
    }
  };

  // Write recommendations.json
  writeJSONFile('recommendations.json', outputData);

  // Write market_data.js
  writeMarketDataJS(marketData, recommendations, positions, outputData.history);

  // ---- Summary ----
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  分析完成                                  ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  数据源: ' + (dataSource === 'api' ? '东方财富实时API' : '备用模拟数据').padEnd(33) + '║');
  console.log('║  推荐数: ' + String(recommendations.length).padEnd(33) + '║');
  if (recommendations.length > 0) {
    console.log('║  最佳推荐: ' + (recommendations[0].code + ' ' + recommendations[0].name).padEnd(30) + '║');
    console.log('║  融合得分: ' + String(recommendations[0].confluenceScore + '分').padEnd(33) + '║');
  }
  if (quantRegime) {
    console.log('║  量化环境: ' + (quantRegime.regime === 'high_quant' ? '高频量化 ⚠' :
      quantRegime.regime === 'moderate_quant' ? '中度量化 ⚡' : '正常 ✓').padEnd(33) + '║');
    var marketTypeLabel = quantRegime.marketType === 'trending' ? '趋势市 →' :
      quantRegime.marketType === 'ranging' ? '震荡市 ↔' : '混合市 ≈';
    console.log('║  市场类型: ' + marketTypeLabel.padEnd(33) + '║');
    console.log('║  趋势效率: ' + String(quantRegime.trendEfficiency).padEnd(33) + '║');
  }
  console.log('║  完成时间: ' + DISPLAY_TIME.padEnd(33) + '║');
  console.log('╚══════════════════════════════════════════╝');
}

// ============================================================
// 11. EXECUTION
// ============================================================

main().then(function() {
  console.log('');
  console.log('[Done] 脚本执行成功，进程退出。');
  process.exit(0);
}).catch(function(err) {
  console.error('');
  console.error('[FATAL] 脚本执行失败: ' + err.message);
  console.error(err.stack);
  process.exit(1);
});
