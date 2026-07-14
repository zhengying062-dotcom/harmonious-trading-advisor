/* ============================================================
   MULTI-FACTOR SCORING MODEL (Pillar 2)
   5 Factors: Momentum 30% + Value 20% + Quality 15% + Volatility 20% + Sentiment 15%
   ============================================================ */
"use strict";

/**
 * Comprehensive multi-factor scoring
 * @param {object} stock - Real-time stock data from clist API
 * @param {Array} klines - K-line array
 * @param {Array} indexKlines - Index K-line array (optional, for relative strength)
 * @returns {object} {totalScore, momentum, value, quality, volatility, sentiment, breakdown}
 */
function calculateMultiFactorScore(stock, klines, indexKlines) {
  if (!klines || klines.length < 10) {
    return { totalScore: 0, momentum: 0, value: 0, quality: 0, volatility: 0, sentiment: 0,
             breakdown: 'K线数据不足' };
  }

  var latest = klines[klines.length - 1];
  var close = latest.close;
  if (!close || close <= 0) close = stock.f2 || 0;

  var momentumScore = calcMomentumFactor(klines);
  var valueScore = calcValueFactor(stock);
  var qualityScore = calcQualityFactor(klines);
  var volatilityScore = calcVolatilityFactor(klines, close);
  var sentimentScore = calcSentimentFactor(stock, klines);
  // New: volume-price coordination factor (量价配合)
  var vpCoordination = calcVolumePriceCoordination(klines);

  // Adjusted weights: momentum boosted for price-movement sensitivity
  var totalScore = momentumScore * 0.35 +
                   valueScore * 0.15 +
                   qualityScore * 0.15 +
                   volatilityScore * 0.15 +
                   sentimentScore * 0.10 +
                   vpCoordination * 0.10;

  return {
    totalScore: Math.min(100, Math.max(0, Math.round(totalScore))),
    momentum: Math.round(momentumScore),
    value: Math.round(valueScore),
    quality: Math.round(qualityScore),
    volatility: Math.round(volatilityScore),
    sentiment: Math.round(sentimentScore),
    vpCoordination: Math.round(vpCoordination),
    breakdown: '动量' + Math.round(momentumScore) +
               ' | 价值' + Math.round(valueScore) +
               ' | 质量' + Math.round(qualityScore) +
               ' | 波动' + Math.round(volatilityScore) +
               ' | 情绪' + Math.round(sentimentScore) +
               ' | 量价' + Math.round(vpCoordination)
  };
}

/**
 * Momentum factor: enhanced sensitivity to recent price movements
 * Uses 3/5/10/20 day returns with higher weight on short-term
 * plus trend consistency score (consecutive up/down days)
 */
function calcMomentumFactor(klines) {
  var len = klines.length;
  if (len < 5) return 50;

  var close = klines[len - 1].close;

  // Multi-period returns with increased short-term sensitivity
  var r3 = len >= 3 ? (close - klines[len - 3].close) / klines[len - 3].close : 0;
  var r5 = len >= 5 ? (close - klines[len - 5].close) / klines[len - 5].close : 0;
  var r10 = len >= 10 ? (close - klines[len - 10].close) / klines[len - 10].close : 0;
  var r20 = len >= 20 ? (close - klines[len - 20].close) / klines[len - 20].close : 0;

  // Weighted: short-term has higher impact (3-day 35%, 5-day 30%, 10-day 20%, 20-day 15%)
  var weightedR = r3 * 0.35 + r5 * 0.30 + r10 * 0.20 + r20 * 0.15;

  // Trend consistency: count consecutive days in same direction
  var trendBonus = 0;
  var upDays = 0, downDays = 0;
  var checkDays = Math.min(len - 1, 7);
  for (var i = len - checkDays; i < len; i++) {
    if (klines[i].close > klines[i - 1].close) upDays++;
    else downDays++;
  }
  // Strong trend = higher score impact
  var maxDir = Math.max(upDays, downDays);
  if (maxDir >= 6) trendBonus = 15;      // Very strong trend
  else if (maxDir >= 5) trendBonus = 10;  // Strong trend
  else if (maxDir >= 4) trendBonus = 5;   // Moderate trend

  // Apply trend direction: if mostly up, add bonus; if mostly down, subtract
  if (downDays > upDays) trendBonus = -trendBonus;

  // Amplification: weightedR * 100 converts to %, then scale by 10x for sensitivity
  var score = 50 + weightedR * 100 * 10 + trendBonus;
  return Math.min(100, Math.max(0, score));
}

/**
 * Value factor: PE inverse mapping (low PE = high score)
 * Uses real-time PE data (stock.f9)
 */
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

/**
 * Quality factor: turnover rate stability (lower CV = better)
 */
function calcQualityFactor(klines) {
  var len = klines.length;
  if (len < 10) return 50;

  var turnoverRates = [];
  var start = Math.max(0, len - 20);
  for (var i = start; i < len; i++) {
    var tr = klines[i].turnoverRate;
    if (tr != null && !isNaN(tr) && tr > 0) {
      turnoverRates.push(tr);
    }
  }

  if (turnoverRates.length < 5) return 50;

  var sum = 0;
  for (var j = 0; j < turnoverRates.length; j++) sum += turnoverRates[j];
  var mean = sum / turnoverRates.length;

  if (mean === 0) return 50;

  var sqSum = 0;
  for (var k = 0; k < turnoverRates.length; k++) {
    sqSum += (turnoverRates[k] - mean) * (turnoverRates[k] - mean);
  }
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

/**
 * Volatility factor: ATR/close reciprocal (low volatility = high score)
 */
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

/**
 * Sentiment factor: volume ratio mapping
 * Prefer real-time volume ratio (stock.f10), fallback to K-line calculation
 */
function calcSentimentFactor(stock, klines) {
  var len = klines.length;

  // Prefer API volume ratio (f10)
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

  // Fallback: calculate from K-line
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

/**
 * Volume-Price Coordination factor (量价配合)
 * Measures how well volume supports price movements.
 * High score: rising price with rising volume (bullish confirmation)
 * or falling price with falling volume (bearish exhaustion)
 * Low score: price-volume divergence (potential reversal signal)
 */
function calcVolumePriceCoordination(klines) {
  var len = klines.length;
  if (len < 10) return 50;

  // Look at last 10 days of price-volume relationship
  var checkLen = Math.min(len - 1, 10);
  var start = len - checkLen - 1;

  var coordinationScore = 0;
  var totalWeight = 0;

  for (var i = start + 1; i < len; i++) {
    var priceChange = (klines[i].close - klines[i - 1].close) / klines[i - 1].close;
    var volChange = klines[i].volume > 0 && klines[i - 1].volume > 0
      ? (klines[i].volume - klines[i - 1].volume) / klines[i - 1].volume
      : 0;

    // Recent days have higher weight
    var weight = 1 + (i - start) / checkLen;

    // Price up + Volume up = strong bullish coordination (+)
    // Price down + Volume down = potential bottoming (+)
    // Price up + Volume down = bearish divergence (-)
    // Price down + Volume up = bearish confirmation (-)
    if (priceChange > 0 && volChange > 0) {
      coordinationScore += weight * Math.min(2, priceChange * 100 + volChange);
    } else if (priceChange < 0 && volChange < 0) {
      coordinationScore += weight * 0.3; // Mild positive (selling exhaustion)
    } else if (priceChange > 0 && volChange < 0) {
      coordinationScore -= weight * 0.5; // Divergence - weak rally
    } else if (priceChange < 0 && volChange > 0) {
      coordinationScore -= weight * Math.min(2, Math.abs(priceChange) * 100 + volChange);
    }

    totalWeight += weight;
  }

  // Normalize to 0-100 scale
  var normalized = 50 + (coordinationScore / Math.max(1, totalWeight)) * 20;
  return Math.min(100, Math.max(5, Math.round(normalized)));
}
