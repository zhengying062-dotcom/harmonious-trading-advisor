/* ============================================================
   ANTI-QUANT IMPACT MODULE v2.0
   Detects quant-dominated market regimes & validates pattern authenticity
   ============================================================ */
"use strict";

/**
 * Detect market quant-dominance regime
 * @param {Array} klines - K-line array (min 20 bars)
 * @param {Array} marketData - Market overview data
 * @returns {object} {score, regime, gapFreq, reversalRate, volCV, tailRate, breakdown}
 */
function detectQuantRegime(klines, marketData) {
  if (!klines || klines.length < 20) return { score: 50, regime: 'normal', breakdown: '数据不足' };

  var n = klines.length;

  // 1. Gap frequency
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

  // 2. Intraday reversal rate
  var reversalCount = 0;
  for (var i = 0; i < n; i++) {
    var bar = klines[i];
    if (bar.open > 0 && bar.close > 0 && bar.high > 0 && bar.low > 0) {
      var openToClose = (bar.close - bar.open) / bar.open;
      var rangeToLow = (bar.high - bar.low) / bar.low;
      if (rangeToLow > 0.03 && Math.abs(openToClose) < 0.005) reversalCount++;
    }
  }
  var reversalRate = reversalCount / n;

  // 3. Volume abnormality (coefficient of variation)
  var volumes = [];
  for (var i = 0; i < n; i++) volumes.push(klines[i].volume || 0);
  var volMean = 0, volStd = 0;
  for (var j = 0; j < volumes.length; j++) volMean += volumes[j];
  volMean /= volumes.length;
  for (var k = 0; k < volumes.length; k++) volStd += (volumes[k] - volMean) * (volumes[k] - volMean);
  volStd = Math.sqrt(volStd / volumes.length);
  var volCV = volMean > 0 ? volStd / volMean : 0;

  // 4. Fat-tail events (>3 sigma)
  var returns = [];
  for (var i = 1; i < n; i++) {
    returns.push((klines[i].close - klines[i - 1].close) / klines[i - 1].close);
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

  var gapScore = Math.min(100, gapFreq * 300);
  var reversalScore = Math.min(100, reversalRate * 500);
  var volAbnormScore = Math.min(100, volCV * 80);
  var tailScore = Math.min(100, tailRate * 1000);

  var quantScore = gapScore * 0.25 + reversalScore * 0.25 + volAbnormScore * 0.30 + tailScore * 0.20;

  // Market-wide bias
  if (marketData) {
    var downCount = 0;
    for (var m = 0; m < marketData.length; m++) {
      if (marketData[m].up === false) downCount++;
    }
    if (downCount >= 3) quantScore += 5;
    if (downCount >= 5) quantScore += 5;
  }

  quantScore = Math.min(100, Math.max(0, Math.round(quantScore)));

  var regime;
  if (quantScore >= 60) regime = 'high_quant';
  else if (quantScore >= 35) regime = 'moderate_quant';
  else regime = 'normal';

  return {
    score: quantScore, regime: regime,
    gapFreq: Math.round(gapFreq * 100), reversalRate: Math.round(reversalRate * 100),
    volCV: Math.round(volCV * 100) / 100, tailRate: Math.round(tailRate * 100),
    breakdown: '量化冲击=' + quantScore + ' | 跳空' + Math.round(gapFreq * 100) +
               '% | 反转' + Math.round(reversalRate * 100) + '% | 波CV=' + volCV.toFixed(2) +
               ' | 肥尾' + Math.round(tailRate * 100) + '%'
  };
}

/**
 * Volume authenticity check: price-volume alignment
 * @returns {object} {score, alignmentRate, spikeRate, volAutocorr, breakdown}
 */
function calcVolumeAuthenticity(klines) {
  if (!klines || klines.length < 10) return { score: 50, breakdown: '数据不足' };
  var n = klines.length;

  // Price-volume alignment
  var alignedCount = 0;
  for (var i = 1; i < n; i++) {
    var priceUp = klines[i].close > klines[i - 1].close;
    var volUp = klines[i].volume > klines[i - 1].volume;
    if (priceUp === volUp) alignedCount++;
  }
  var alignmentRate = alignedCount / (n - 1);

  // Volume spike detection
  var volMean = 0;
  for (var j = 0; j < n; j++) volMean += klines[j].volume;
  volMean /= n;
  var spikeCount = 0;
  for (var k = 0; k < n; k++) {
    if (klines[k].volume > volMean * 2.5) spikeCount++;
  }
  var spikeRate = spikeCount / n;

  // Volume autocorrelation
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
    alignmentRate: Math.round(alignmentRate * 100), spikeRate: Math.round(spikeRate * 100),
    volAutocorr: Math.round(volAutocorr * 100) / 100,
    breakdown: '量价对齐' + Math.round(alignmentRate * 100) +
               '% | 脉冲' + Math.round(spikeRate * 100) + '% | 量自相关' + volAutocorr.toFixed(2)
  };
}

/**
 * Pattern stability across sliding windows
 * @returns {object} {score, fullPattern, sub1Pattern, sub2Pattern, breakdown}
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
      stabilityScore = 85; reasons.push('三窗口形态一致(' + full.bestPattern.pattern + ')');
    } else if (sameType12 || sameType22) {
      stabilityScore = 55; reasons.push('两窗口形态一致');
    } else {
      stabilityScore = 25; reasons.push('形态类型不一致(量化干扰)');
    }
    var scoreSpread = Math.max(
      Math.abs(full.score - sub1.score), Math.abs(full.score - sub2.score),
      Math.abs(sub1.score - sub2.score)
    );
    if (scoreSpread < 10) stabilityScore = Math.min(100, stabilityScore + 10);
    else if (scoreSpread > 30) stabilityScore = Math.max(5, stabilityScore - 20);
  } else if (full.bestPattern && (sub1.bestPattern || sub2.bestPattern)) {
    stabilityScore = 40; reasons.push('仅两窗口检测到形态');
  } else if (full.bestPattern) {
    stabilityScore = 20; reasons.push('形态仅在全窗口出现(不稳定,疑似量化制造)');
  } else {
    stabilityScore = 60; reasons.push('无形态(中性,不受量化干扰)');
  }

  return {
    score: Math.min(100, Math.max(5, Math.round(stabilityScore))),
    fullPattern: full.bestPattern ? full.bestPattern.pattern : null,
    sub1Pattern: sub1.bestPattern ? sub1.bestPattern.pattern : null,
    sub2Pattern: sub2.bestPattern ? sub2.bestPattern.pattern : null,
    fullScore: full.score, sub1Score: sub1.score, sub2Score: sub2.score,
    breakdown: reasons.join('; ')
  };
}

/**
 * Quant trap risk detection
 * @returns {object} {score, falseBreakRate, stopHuntRate, volClimaxRate, breakdown}
 */
function calcQuantTrapRisk(klines, harmonic) {
  if (!klines || klines.length < 15) return { score: 50, breakdown: '数据不足' };
  var n = klines.length;
  var riskScore = 50;
  var riskFactors = [];

  // False breakout detection
  var falseBreakCount = 0;
  for (var i = 5; i < n; i++) {
    var prevHigh = Math.max.apply(null, klines.slice(i - 5, i).map(function(k) { return k.high; }));
    var prevLow = Math.min.apply(null, klines.slice(i - 5, i).map(function(k) { return k.low; }));
    var currBar = klines[i];
    if (currBar.high > prevHigh * 1.01 && currBar.close < prevHigh) falseBreakCount++;
    if (currBar.low < prevLow * 0.99 && currBar.close > prevLow) falseBreakCount++;
  }
  var falseBreakRate = falseBreakCount / (n - 5);
  if (falseBreakRate > 0.15) { riskScore -= 20; riskFactors.push('假突破频繁(' + Math.round(falseBreakRate * 100) + '%)'); }
  else if (falseBreakRate > 0.08) { riskScore -= 8; riskFactors.push('存在假突破(' + Math.round(falseBreakRate * 100) + '%)'); }

  // Stop hunt detection
  var stopHuntCount = 0;
  for (var i = 3; i < n - 1; i++) {
    var recentLow = Math.min.apply(null, klines.slice(i - 3, i).map(function(k) { return k.low; }));
    var bar = klines[i], nextBar = klines[i + 1];
    if (bar.low < recentLow * 0.995 && nextBar.close > bar.high) stopHuntCount++;
  }
  var stopHuntRate = stopHuntCount / (n - 4);
  if (stopHuntRate > 0.1) { riskScore -= 15; riskFactors.push('止损猎杀(' + Math.round(stopHuntRate * 100) + '%)'); }

  // Volume climax detection
  var volClimaxCount = 0;
  for (var i = 1; i < n; i++) {
    var bar = klines[i], prevBar = klines[i - 1];
    if (bar.volume > prevBar.volume * 2 && prevBar.volume > 0) {
      var bodySize = Math.abs(bar.close - bar.open);
      var price = bar.close || bar.open;
      if (price > 0 && bodySize / price < 0.015) volClimaxCount++;
    }
  }
  var volClimaxRate = volClimaxCount / (n - 1);
  if (volClimaxRate > 0.12) { riskScore -= 15; riskFactors.push('量能高潮(' + Math.round(volClimaxRate * 100) + '%)'); }

  // PRZ support failure check
  if (harmonic && harmonic.bestPattern && harmonic.bestPattern.prz) {
    var prz = harmonic.bestPattern.prz;
    for (var i = 3; i < n; i++) {
      if (klines[i].low <= prz.high && klines[i].low >= prz.low && klines[i].close < prz.low) {
        riskScore -= 5; riskFactors.push('PRZ支撑失败'); break;
      }
    }
  }

  riskScore = Math.min(90, Math.max(10, Math.round(riskScore)));
  return {
    score: riskScore,
    falseBreakRate: Math.round(falseBreakRate * 100), stopHuntRate: Math.round(stopHuntRate * 100),
    volClimaxRate: Math.round(volClimaxRate * 100),
    breakdown: riskFactors.length > 0 ? riskFactors.join('; ') : '无明显量化陷阱信号'
  };
}
