/* ============================================================
   STATISTICAL VALIDATION (Pillar 3)
   Based on Quantopia 56 Lectures - Correlation, Sharpe Ratio, ATR Position Sizing
   ============================================================ */
"use strict";

/**
 * Statistical validation & risk adjustment
 * @param {Array} stockKlines - Stock K-line array
 * @param {Array} indexKlines - Index K-line array (optional)
 * @param {number} basePosition - Base position percentage (e.g. 15)
 * @returns {object} {correlation, sharpe, adjustedPosition, pass, breakdown}
 */
function statisticalValidation(stockKlines, indexKlines, basePosition) {
  basePosition = basePosition || 15;

  if (!stockKlines || stockKlines.length < 10) {
    return { correlation: 0, sharpe: 0, adjustedPosition: basePosition, pass: false,
             breakdown: '数据不足' };
  }

  // 1. Correlation: Pearson r with index
  var correlation = 0;
  if (indexKlines && indexKlines.length >= 10) {
    correlation = calcPearsonCorrelation(stockKlines, indexKlines);
  } else {
    correlation = calcAutoCorrelation(stockKlines);
  }

  // 2. Estimated Sharpe ratio: 20-day mean/std
  var sharpe = calcEstimatedSharpe(stockKlines);

  // 3. ATR dynamic position sizing
  var atr = HarmonicPatternDetector.calcATR(stockKlines, 14);
  var close = stockKlines[stockKlines.length - 1].close;
  var atrPct = close > 0 ? (atr / close) * 100 : 2;

  var targetATR = 2.5;
  var atrMultiplier = targetATR / Math.max(atrPct, 0.5);
  atrMultiplier = Math.min(1.5, Math.max(0.5, atrMultiplier));
  var adjustedPosition = Math.round(basePosition * atrMultiplier);

  // 4. Pass/fail determination
  var pass = sharpe > 0.1 && adjustedPosition >= basePosition * 0.5;

  return {
    correlation: Math.round(correlation * 100) / 100,
    sharpe: Math.round(sharpe * 100) / 100,
    adjustedPosition: adjustedPosition,
    atr: Math.round(atr * 100) / 100,
    atrPct: Math.round(atrPct * 100) / 100,
    pass: pass,
    breakdown: '相关r=' + (correlation * 100).toFixed(0) + '%' +
               ' | 夏普=' + sharpe.toFixed(2) +
               ' | ATR=' + atrPct.toFixed(1) + '%' +
               ' | 仓位' + basePosition + '%->' + adjustedPosition + '%'
  };
}

/**
 * Pearson correlation coefficient (based on daily close returns)
 */
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
      stockRets.push(sr);
      indexRets.push(ir);
    }
  }

  if (stockRets.length < 5) return 0;

  var sMean = 0, iMean = 0;
  for (var j = 0; j < stockRets.length; j++) {
    sMean += stockRets[j];
    iMean += indexRets[j];
  }
  sMean /= stockRets.length;
  iMean /= stockRets.length;

  var cov = 0, sVar = 0, iVar = 0;
  for (var k = 0; k < stockRets.length; k++) {
    var sDiff = stockRets[k] - sMean;
    var iDiff = indexRets[k] - iMean;
    cov += sDiff * iDiff;
    sVar += sDiff * sDiff;
    iVar += iDiff * iDiff;
  }

  if (sVar === 0 || iVar === 0) return 0;
  return cov / Math.sqrt(sVar * iVar);
}

/**
 * Auto-correlation estimation (substitute for index correlation)
 */
function calcAutoCorrelation(klines) {
  var n = klines.length;
  if (n < 10) return 0;
  var rets = [];
  for (var i = 1; i < n; i++) {
    rets.push((klines[i].close - klines[i - 1].close) / klines[i - 1].close);
  }
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

/**
 * Estimated annualized Sharpe ratio (20-day daily returns)
 * Risk-free rate assumed as 2.5% annualized
 */
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
  for (var k = 0; k < rets.length; k++) {
    variance += (rets[k] - mean) * (rets[k] - mean);
  }
  variance /= (rets.length - 1);
  var std = Math.sqrt(variance);

  if (std === 0) return 0;

  var rfDaily = 0.025 / 252;
  var annualizedReturn = mean * 252;
  var annualizedStd = std * Math.sqrt(252);
  return (annualizedReturn - 0.025) / annualizedStd;
}
