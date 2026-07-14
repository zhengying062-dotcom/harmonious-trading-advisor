/* ============================================================
   BACKTEST VERIFICATION SYSTEM
   5-day historical analysis validation & correction factor
   ============================================================ */
"use strict";

/**
 * Get the K-line cutoff index for N trading days ago
 * @param {Array} klines - K-line array (time ascending)
 * @param {number} backDays - Number of trading days to go back, default 5
 * @returns {number} Analysis cutoff index (0-based, inclusive)
 */
function getAnalysisCutoffIndex(klines, backDays) {
  backDays = backDays || 5;
  if (!klines || klines.length < backDays + 10) return -1;
  return klines.length - backDays - 1;
}

/**
 * Main backtest function: validate historical analysis against 5-day actual results
 */
async function runBacktest() {
  var btn = document.getElementById('btnRunBacktest');
  var progressWrap = document.getElementById('btProgressWrap');
  var progressFill = document.getElementById('btProgressFill');
  var progressText = document.getElementById('btProgressText');

  if (btn) { btn.disabled = true; btn.textContent = '回测中...'; }
  if (progressWrap) progressWrap.classList.add('active');
  if (progressFill) progressFill.style.width = '0%';
  if (progressText) progressText.textContent = '准备回测数据...';

  try {
    // Step 1: Determine backtest targets
    var stocks = [];
    if (store.userAnalysisResults && store.userAnalysisResults.length > 0) {
      store.userAnalysisResults.forEach(function(r) {
        if (!r.error && r.code && r.klines) {
          stocks.push({ code: r.code, name: r.name, klines: r.klines, currentPrice: r.currentPrice });
        }
      });
    }
    if (stocks.length === 0 && store.recommendations && store.recommendations.length > 0) {
      stocks = store.recommendations.slice(0, 5).map(function(rec) {
        return { code: rec.code, name: rec.name, klines: null, currentPrice: null };
      });
    }
    if (stocks.length === 0) {
      var pos = readPositionsFromDOM();
      stocks = pos.slice(0, 5).map(function(p) {
        return { code: p.code, name: p.name, klines: null, currentPrice: p.buyPrice };
      });
    }
    if (stocks.length === 0) {
      showToast('warning', '无回测数据', '请先分析持仓或录入股票后再运行回测。', 4000);
      if (btn) { btn.disabled = false; btn.textContent = '运行回测'; }
      if (progressWrap) progressWrap.classList.remove('active');
      return;
    }

    // Step 2: Run historical analysis for each stock
    var total = stocks.length;
    var details = [];

    for (var i = 0; i < total; i++) {
      var s = stocks[i];
      var pct = Math.round((i / total) * 100);
      if (progressFill) progressFill.style.width = pct + '%';
      if (progressText) progressText.textContent = '回测中: ' + (s.name || s.code) + ' (' + (i + 1) + '/' + total + ')';

      try {
        var klines = s.klines;
        if (!klines || klines.length < 25) {
          var secid = makeSecidFromRawCode(s.code.replace('.SH','').replace('.SZ',''));
          klines = await fetchStockKline(secid, 70);
          if (!klines || klines.length < 25) {
            details.push({ code: s.code, name: s.name, error: 'K线数据不足(' + (klines ? klines.length : 0) + '根)', skip: true });
            continue;
          }
        }

        if (klines.length < 25) {
          details.push({ code: s.code, name: s.name, error: 'K线数据不足(' + klines.length + '根)', skip: true });
          continue;
        }

        var cutoffIdx = getAnalysisCutoffIndex(klines, 5);
        if (cutoffIdx < 20) {
          details.push({ code: s.code, name: s.name, error: '历史数据不足(分析窗口需>=20根K线)', skip: true });
          continue;
        }

        var analysisKlines = klines.slice(0, cutoffIdx + 1);
        var verifyKlines = klines.slice(cutoffIdx + 1);

        if (analysisKlines.length < 15 || verifyKlines.length < 3) {
          details.push({ code: s.code, name: s.name, error: '窗口数据不足', skip: true });
          continue;
        }

        // Run three-framework analysis on historical data
        var harmonic = HarmonicPatternDetector.analyze(analysisKlines);

        var analysisClose = analysisKlines[analysisKlines.length - 1].close;
        var stockObj = {
          f2: analysisClose,
          f3: analysisKlines[analysisKlines.length - 1].changePct || 0,
          f7: analysisKlines[analysisKlines.length - 1].amplitude || 0,
          f9: 20, f10: 1.0,
          f12: s.code.replace('.SH','').replace('.SZ',''),
          f14: s.name || ('股票' + s.code),
          f6: analysisKlines[analysisKlines.length - 1].amount || 0
        };

        var factors = calculateMultiFactorScore(stockObj, analysisKlines, null);
        var stats = statisticalValidation(analysisKlines, null, 10);
        var statsScore = stats.pass ? Math.min(100, Math.max(10, 50 + stats.sharpe * 30)) : Math.max(0, 20 + stats.sharpe * 20);
        var rawConfluenceScore = harmonic.score * 0.40 + factors.totalScore * 0.35 + statsScore * 0.25;

        var histRecommendation;
        if (rawConfluenceScore >= 60) histRecommendation = 'buy';
        else if (rawConfluenceScore >= 40) histRecommendation = 'hold';
        else histRecommendation = 'sell';

        var histDirection = (histRecommendation === 'buy') ? 'bullish'
          : (histRecommendation === 'sell') ? 'bearish' : 'neutral';

        var predictedReturn = 0;
        if (harmonic.bestPattern && harmonic.bestPattern.targets && harmonic.bestPattern.targets.length > 0) {
          var targetPrice = harmonic.bestPattern.targets[0];
          predictedReturn = ((targetPrice - analysisClose) / analysisClose) * 100;
        } else {
          predictedReturn = (factors.momentum - 50) / 50 * 5;
        }

        var verifyStart = verifyKlines[0].close;
        var verifyEnd = verifyKlines[verifyKlines.length - 1].close;
        var actualReturn = ((verifyEnd - verifyStart) / verifyStart) * 100;

        var THRESHOLD = 2.0;
        var isCorrect = false;
        var resultType = 'neutral';
        if (histDirection === 'bullish' && actualReturn >= THRESHOLD) { isCorrect = true; resultType = 'tp'; }
        else if (histDirection === 'bullish' && actualReturn <= -THRESHOLD) { isCorrect = false; resultType = 'fp'; }
        else if (histDirection === 'bearish' && actualReturn <= -THRESHOLD) { isCorrect = true; resultType = 'tn'; }
        else if (histDirection === 'bearish' && actualReturn >= THRESHOLD) { isCorrect = false; resultType = 'fn'; }
        else { resultType = 'neutral'; }

        var deviation = actualReturn - predictedReturn;
        var signalBias = (histDirection === 'bullish' ? 1 : (histDirection === 'bearish' ? -1 : 0)) * actualReturn;

        details.push({
          code: s.code, name: s.name,
          histRecommendation: histRecommendation, histDirection: histDirection,
          predictedReturn: Math.round(predictedReturn * 10) / 10,
          actualReturn: Math.round(actualReturn * 10) / 10,
          isCorrect: isCorrect, resultType: resultType,
          deviation: Math.round(deviation * 10) / 10,
          signalBias: Math.round(signalBias * 10) / 10,
          confluenceScore: Math.round(rawConfluenceScore),
          harmonicScore: harmonic.score, factorScore: factors.totalScore,
          analysisDate: analysisKlines[analysisKlines.length - 1].date,
          verifyDateStart: verifyKlines[0].date,
          verifyDateEnd: verifyKlines[verifyKlines.length - 1].date
        });

      } catch (err) {
        console.warn('[Backtest] Error for ' + (s.name || s.code) + ':', err.message);
        details.push({ code: s.code, name: s.name, error: err.message, skip: true });
      }
    }

    // Step 3: Calculate summary metrics
    if (progressFill) progressFill.style.width = '90%';
    if (progressText) progressText.textContent = '计算校正因子...';

    var validResults = details.filter(function(d) { return !d.skip && !d.error; });
    var resultsWithDirection = validResults.filter(function(d) { return d.resultType !== 'neutral'; });

    var correction = calculateCorrectionFactor(validResults, resultsWithDirection);

    // Step 4: Update global state
    store.backtestResults = {
      summary: {
        totalTested: validResults.length,
        totalSkipped: details.length - validResults.length,
        accuracy: correction.accuracy,
        avgBias: correction.avgBias,
        reliability: correction.reliability,
        factor: correction.factor,
        interpretation: correction.interpretation
      },
      details: details,
      timestamp: new Date().toISOString()
    };
    store.correctionFactor = {
      factor: correction.factor,
      accuracy: correction.accuracy,
      avgBias: correction.avgBias,
      reliability: correction.reliability,
      interpretation: correction.interpretation
    };

    saveBacktestToStorage();
    renderBacktestResults();

    if (progressFill) progressFill.style.width = '100%';
    if (progressText) progressText.textContent = '回测完成 (' + validResults.length + '只股票)';

    setTimeout(function() {
      if (progressWrap) progressWrap.classList.remove('active');
    }, 1500);

  } catch (err) {
    console.error('[Backtest] Critical error:', err);
    if (progressText) progressText.textContent = '回测失败: ' + err.message;
    showToast('error', '回测失败', err.message, 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '运行回测'; }
  }
}

/**
 * Calculate correction factor from backtest results
 */
function calculateCorrectionFactor(validResults, directionalResults) {
  if (!validResults || validResults.length === 0) {
    return { factor: 0, accuracy: 0, avgBias: 0, reliability: 0, interpretation: '无有效数据' };
  }

  var correctCount = 0;
  directionalResults.forEach(function(r) { if (r.isCorrect) correctCount++; });
  var accuracy = directionalResults.length > 0
    ? Math.round((correctCount / directionalResults.length) * 100) : 0;

  var sumDev = 0;
  validResults.forEach(function(r) { sumDev += r.deviation; });
  var avgDeviation = validResults.length > 0
    ? Math.round((sumDev / validResults.length) * 100) / 100 : 0;

  var sumBias = 0, biasCount = 0;
  validResults.forEach(function(r) {
    if (r.histDirection === 'bullish' || r.histDirection === 'bearish') {
      sumBias += r.signalBias;
      biasCount++;
    }
  });
  var avgBias = biasCount > 0 ? Math.round((sumBias / biasCount) * 100) / 100 : 0;

  var biasMagnitude = Math.min(1, Math.max(-1, avgBias / 8));
  var reliability = Math.round(accuracy * (1 - Math.abs(biasMagnitude))) / 100;

  var correctionFactor = (0.5 - accuracy / 100) * 0.4 + biasMagnitude * 0.15;
  correctionFactor = Math.min(0.3, Math.max(-0.3, Math.round(correctionFactor * 100) / 100));

  var interpretation;
  if (Math.abs(correctionFactor) < 0.03) {
    interpretation = '分析基本准确，偏差在可接受范围内，无需大幅调整。校正因子接近零，当前分析框架表现稳定。';
  } else if (correctionFactor > 0) {
    interpretation = '分析偏悲观（低估）: 历史预测系统性低于实际表现，校正因子为正，建议上调融合得分。' +
      '准确率' + accuracy + '%，平均偏差' + (avgBias >= 0 ? '+' : '') + avgBias + '。';
  } else {
    interpretation = '分析偏乐观（高估）: 历史预测系统性高于实际表现，校正因子为负，建议下调融合得分。' +
      '准确率' + accuracy + '%，平均偏差' + (avgBias >= 0 ? '+' : '') + avgBias + '。';
  }

  return {
    factor: correctionFactor, accuracy: accuracy,
    avgBias: avgBias, reliability: Math.round(reliability * 100) / 100,
    interpretation: interpretation
  };
}

/**
 * Apply correction factor to raw confluence score
 */
function applyCorrectionToScore(rawScore) {
  if (!store.correctionEnabled || !store.correctionFactor || !store.correctionFactor.factor) {
    return rawScore;
  }
  var factor = store.correctionFactor.factor;
  var adjusted = rawScore + factor * 100;
  return Math.max(0, Math.min(100, adjusted));
}

/**
 * Render backtest results to UI
 */
function renderBacktestResults() {
  var results = store.backtestResults;
  if (!results || !results.summary) return;

  var s = results.summary;

  var summaryGrid = document.getElementById('btSummaryGrid');
  if (summaryGrid) summaryGrid.style.display = 'grid';

  // Accuracy
  var accEl = document.getElementById('btAccuracy');
  var accLabelEl = document.getElementById('btAccuracyLabel');
  if (accEl) {
    accEl.textContent = s.accuracy + '%';
    accEl.className = 'bt-sv ' + (s.accuracy >= 60 ? 'positive' : (s.accuracy >= 40 ? 'neutral' : 'negative'));
  }
  if (accLabelEl) {
    accLabelEl.textContent = s.accuracy >= 70 ? '优秀' : (s.accuracy >= 50 ? '中等' : '偏低');
  }

  // Average bias
  var biasEl = document.getElementById('btAvgBias');
  var biasLabelEl = document.getElementById('btAvgBiasLabel');
  if (biasEl) {
    var sign = s.avgBias >= 0 ? '+' : '';
    biasEl.textContent = sign + s.avgBias.toFixed(2);
    biasEl.className = 'bt-sv ' + (Math.abs(s.avgBias) < 2 ? 'neutral' : (s.avgBias > 0 ? 'positive' : 'negative'));
  }
  if (biasLabelEl) {
    biasLabelEl.textContent = Math.abs(s.avgBias) < 1.5 ? '基本准确' : (s.avgBias > 0 ? '偏悲观(低估)' : '偏乐观(高估)');
  }

  // Reliability
  var relEl = document.getElementById('btReliability');
  var relLabelEl = document.getElementById('btReliabilityLabel');
  if (relEl) {
    relEl.textContent = s.reliability.toFixed(2);
    relEl.className = 'bt-sv ' + (s.reliability >= 0.6 ? 'positive' : (s.reliability >= 0.4 ? 'neutral' : 'negative'));
  }
  if (relLabelEl) {
    relLabelEl.textContent = s.reliability >= 0.7 ? '高可靠性' : (s.reliability >= 0.5 ? '中等' : '低可靠性');
  }

  // Correction factor
  var cfEl = document.getElementById('btCorrectionFactor');
  var cfLabelEl = document.getElementById('btCorrectionLabel');
  if (cfEl) {
    var cfsign = s.factor >= 0 ? '+' : '';
    cfEl.textContent = cfsign + s.factor.toFixed(2);
    if (s.factor < -0.05) { cfEl.textContent += ' ↓'; cfEl.className = 'bt-sv negative'; }
    else if (s.factor > 0.05) { cfEl.textContent += ' ↑'; cfEl.className = 'bt-sv positive'; }
    else { cfEl.className = 'bt-sv neutral'; }
  }
  if (cfLabelEl) {
    cfLabelEl.textContent = s.factor < -0.05 ? '下调建议' : (s.factor > 0.05 ? '上调建议' : '基本不变');
  }

  // Interpretation
  var interpEl = document.getElementById('btInterpretation');
  if (interpEl) {
    interpEl.style.display = 'block';
    interpEl.innerHTML = '<strong>回测解读: </strong>' + escapeHtml(store.correctionFactor ? store.correctionFactor.interpretation : s.interpretation);
  }

  // Detail table
  var tableWrap = document.getElementById('btTableWrap');
  var tbody = document.getElementById('btTableBody');
  if (tableWrap && tbody && results.details) {
    tableWrap.style.display = 'block';

    var recLabelMap = { buy: '买入', hold: '关注/持有', sell: '卖出' };
    var dirLabelMap = { bullish: '看涨', bearish: '看跌', neutral: '中性' };

    var html = '';
    for (var i = 0; i < results.details.length; i++) {
      var d = results.details[i];
      if (d.skip || d.error) {
        html += '<tr><td><strong>' + escapeHtml(d.name || d.code) + '</strong></td>' +
          '<td colspan="5" style="color:var(--text-muted);">' + escapeHtml(d.error || '跳过') + '</td></tr>';
        continue;
      }
      var sign = d.actualReturn >= 0 ? '+' : '';
      var devSign = d.deviation >= 0 ? '+' : '';
      html += '<tr>' +
        '<td><strong style="color:var(--text-primary);">' + escapeHtml(d.name || d.code) + '</strong>' +
          '<br><span style="font-size:0.6rem;color:var(--text-muted);">' + escapeHtml(d.code) + '</span></td>' +
        '<td>' + recLabelMap[d.histRecommendation] + '</td>' +
        '<td>' + dirLabelMap[d.histDirection] +
          ' <span style="font-size:0.65rem;color:var(--text-muted);">(' + (d.predictedReturn >= 0 ? '+' : '') + d.predictedReturn + '%)</span></td>' +
        '<td style="font-family:var(--font-mono);color:' + (d.actualReturn >= 0 ? 'var(--green)' : 'var(--red)') + ';">' +
          sign + d.actualReturn.toFixed(1) + '%</td>' +
        '<td class="' + (d.isCorrect ? 'bt-ok' : (d.resultType === 'neutral' ? 'bt-neutral' : 'bt-fail')) + '">' +
          (d.isCorrect ? '✓ 正确' : (d.resultType === 'neutral' ? '~ 中性' : '✗ 错误')) + '</td>' +
        '<td style="font-family:var(--font-mono);color:' + (Math.abs(d.deviation) < 2 ? 'var(--text-secondary)' : (d.deviation > 0 ? 'var(--green)' : 'var(--red)')) + ';">' +
          devSign + d.deviation.toFixed(1) + '%</td>' +
        '</tr>';
    }
    tbody.innerHTML = html;
  }

  var emptyEl = document.getElementById('btEmpty');
  if (emptyEl) emptyEl.style.display = 'none';

  updateCorrectionToggleUI();

  if (store.userAnalysisResults && store.userAnalysisResults.length > 0) {
    renderUserPositionResults(store.userAnalysisResults);
  }
}

function updateCorrectionToggleUI() {
  var toggleSwitch = document.getElementById('btToggleSwitch');
  var toggleLabel = document.getElementById('btToggleLabel');
  var enabled = store.correctionEnabled;

  if (toggleSwitch) {
    if (enabled) toggleSwitch.classList.add('active');
    else toggleSwitch.classList.remove('active');
  }
  if (toggleLabel) {
    if (store.correctionFactor && store.correctionFactor.factor !== null && enabled) {
      var sign = store.correctionFactor.factor >= 0 ? '+' : '';
      toggleLabel.textContent = '校正因子: ' + sign + store.correctionFactor.factor.toFixed(2) + ' (开启)';
    } else if (enabled) {
      toggleLabel.textContent = '校正因子: 开启';
    } else {
      toggleLabel.textContent = '校正因子: 关闭';
    }
  }
}

function toggleCorrection() {
  store.correctionEnabled = !store.correctionEnabled;
  updateCorrectionToggleUI();
  saveBacktestToStorage();

  if (store.userAnalysisResults && store.userAnalysisResults.length > 0) {
    renderUserPositionResults(store.userAnalysisResults);
  }
}

function clearBacktestResults() {
  store.backtestResults = null;
  store.correctionFactor = null;

  var summaryGrid = document.getElementById('btSummaryGrid');
  var tableWrap = document.getElementById('btTableWrap');
  var interpEl = document.getElementById('btInterpretation');
  var emptyEl = document.getElementById('btEmpty');

  if (summaryGrid) summaryGrid.style.display = 'none';
  if (tableWrap) tableWrap.style.display = 'none';
  if (interpEl) interpEl.style.display = 'none';
  if (emptyEl) emptyEl.style.display = 'block';

  try { localStorage.removeItem(BT_STORAGE_KEY_RESULTS); } catch(e) {}
  try { localStorage.removeItem(BT_STORAGE_KEY_FACTOR); } catch(e) {}
  try { localStorage.removeItem(BT_STORAGE_KEY_ENABLED); } catch(e) {}

  updateCorrectionToggleUI();

  if (store.userAnalysisResults && store.userAnalysisResults.length > 0) {
    renderUserPositionResults(store.userAnalysisResults);
  }
}

function saveBacktestToStorage() {
  try {
    if (store.backtestResults) {
      localStorage.setItem(BT_STORAGE_KEY_RESULTS, JSON.stringify(store.backtestResults));
    }
    if (store.correctionFactor) {
      localStorage.setItem(BT_STORAGE_KEY_FACTOR, JSON.stringify(store.correctionFactor));
    }
    localStorage.setItem(BT_STORAGE_KEY_ENABLED, store.correctionEnabled ? '1' : '0');
  } catch(e) {
    console.warn('[Backtest] Failed to save to localStorage:', e.message);
  }
}

function loadBacktestFromStorage() {
  try {
    var saved = localStorage.getItem(BT_STORAGE_KEY_RESULTS);
    if (saved) store.backtestResults = JSON.parse(saved);
    var cf = localStorage.getItem(BT_STORAGE_KEY_FACTOR);
    if (cf) store.correctionFactor = JSON.parse(cf);
    var enabled = localStorage.getItem(BT_STORAGE_KEY_ENABLED);
    if (enabled !== null) store.correctionEnabled = (enabled === '1');
  } catch(e) {
    console.warn('[Backtest] Failed to load from localStorage:', e.message);
  }
}
