/* ============================================================
   INITIALIZATION & GLOBAL ERROR BOUNDARY
   ============================================================ */
"use strict";

// ---- Global Error Boundary ----

window.addEventListener('error', function(event) {
  var msg = event.error ? event.error.message : event.message;
  var source = event.filename || 'unknown';
  console.error('[GlobalError] ' + source + ': ' + msg);
  // Don't show toast for minor errors (like network failures already handled)
  if (msg && msg.indexOf('NetworkError') === -1 && msg.indexOf('abort') === -1) {
    showToast('error', '系统错误', msg + ' (' + (source.split('/').pop() || '未知') + ')', 8000);
  }
  recordError('global', msg);
});

window.addEventListener('unhandledrejection', function(event) {
  var msg = event.reason ? (event.reason.message || String(event.reason)) : '未知Promise错误';
  console.error('[UnhandledRejection]', event.reason);
  showToast('error', '异步操作失败', msg, 8000);
  recordError('unhandled', msg);
});

// ---- Daily Recommendation Rotation ----
var RECENT_RECS_KEY = 'harmonious_recent_recs';

function loadRecentRecommendations() {
  try {
    var raw = localStorage.getItem(RECENT_RECS_KEY);
    if (raw) {
      var data = JSON.parse(raw);
      // Only use if it's from the last 3 days
      if (data.date && data.codes) {
        var daysAgo = Math.floor((new Date() - new Date(data.date)) / 86400000);
        if (daysAgo <= 3) return data.codes;
      }
    }
  } catch(e) {}
  return [];
}

function saveRecentRecommendations(codes) {
  try {
    localStorage.setItem(RECENT_RECS_KEY, JSON.stringify({
      date: new Date().toISOString().split('T')[0],
      codes: codes
    }));
  } catch(e) {}
}

// ---- Data Refresh Orchestration ----

async function refreshAllData() {
  // Prevent concurrent full refreshes
  store.dataStatus.indices = 'loading';
  store.dataStatus.recommendations = 'loading';
  store.dataStatus.positions = 'loading';

  updateDataBadge('loading');
  renderMarketOverview();
  renderRecommendations();
  renderActivePositions();

  var results = await Promise.allSettled([
    fetchIndices(),
    fetchAndGenerateRecommendations(),
    fetchPositionPrices()
  ]);

  results.forEach(function(r, i) {
    var labels = ['indices', 'recommendations', 'positions'];
    if (r.status === 'rejected') {
      console.warn('[Data] ' + labels[i] + ' failed:', r.reason);
      recordError(labels[i], r.reason ? r.reason.message : 'Unknown error');
    }
  });

  updateOverallStatus();
  renderMarketOverview();
  renderRecommendations();
  renderActivePositions();
  renderHistory();
  updateFooter();
}

async function refreshIndicesOnly() {
  await fetchIndices();
  updateOverallStatus();
  renderMarketOverview();
  updateFooter();
  if (store.updateCount % 3 === 0) {
    await fetchPositionPrices();
    renderActivePositions();
  }
}

// ---- Fetch and Generate Recommendations ----

async function fetchAndGenerateRecommendations() {
  if (store.analysisRunning) {
    return;
  }
  store.analysisRunning = true;
  try {
    // Fetch top-80 by turnover (expanded from 30 for more diversity)
    var url = API.CLIST +
      '?pn=1&pz=80&po=1&np=1&fltt=2' +
      '&fields=f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21' +
      '&fs=m:0+t:6,m:0+t:80';
    var data = await apiFetchWithRetry(url, 12000, 2);

    if (!data || !data.data || !data.data.diff || data.data.diff.length === 0) {
      throw new Error('股票列表为空');
    }

    var stocks = data.data.diff;

    // ---- Daily rotation seed: different stocks get priority each day ----
    var todayDate = new Date();
    var daySeed = todayDate.getFullYear() * 1000 +
      Math.floor((todayDate - new Date(todayDate.getFullYear(), 0, 0)) / 86400000);
    // Simple hash: mix bits of the day seed
    var hash = ((daySeed * 2654435761) >>> 0) / 4294967296; // 0..1 pseudo-random based on date

    // ---- Track recently recommended stocks to rotate ----
    var recentCodes = loadRecentRecommendations();

    var candidates = stocks
      .filter(function(s) {
        var pe = s.f9;
        var turnover = s.f6;
        // Relaxed filter: turnover > 1亿, PE 0-300
        return turnover > 100000000 && pe > 0 && pe < 300;
      })
      .map(function(s) {
        var code = String(s.f12);
        var baseScore = Math.log10(s.f6 || 1e8) * 2.5 + Math.abs(s.f3 || 1) * 1.5;
        // Freshness bonus: stocks NOT in recent recommendations get +25% boost
        var freshnessBonus = (recentCodes.indexOf(code) === -1) ? 1.25 : 0.7;
        // Day-based jitter: ±15% pseudo-random variation based on code + date
        var codeNum = parseInt(code, 10) || 0;
        var jitter = 0.85 + ((codeNum * 16807 + daySeed * 48271) % 10007) / 10007 * 0.3;
        var score = baseScore * freshnessBonus * jitter;
        return { stock: s, score: score };
      })
      .sort(function(a, b) { return b.score - a.score; });

    if (candidates.length === 0) {
      throw new Error('无符合条件的候选股票');
    }

    // ---- Select top-12 (increased from 10), with sector + market-cap diversity ----
    var topCandidates = [];
    var usedSectors = {};
    // Alternate: pick from top half first, then add mid-cap discovery picks
    for (var i = 0; i < candidates.length && topCandidates.length < 12; i++) {
      var s = candidates[i].stock;
      var code = String(s.f12);
      var sector = code.charAt(0);
      // First 7: sector-diversified top picks
      if (topCandidates.length < 7) {
        if (!usedSectors[sector] || Object.keys(usedSectors).length >= 5) {
          usedSectors[sector] = true;
          topCandidates.push(candidates[i]);
        }
      } else {
        // Next 5: any remaining high-scorers (allows same-sector if quality is high)
        var alreadyPicked = false;
        for (var k = 0; k < topCandidates.length; k++) {
          if (topCandidates[k].stock.f12 === s.f12) { alreadyPicked = true; break; }
        }
        if (!alreadyPicked) {
          topCandidates.push(candidates[i]);
        }
      }
    }

    // ---- Get index K-line for correlation & quant regime ----
    var indexKlines = null;
    var quantRegime = null;
    try {
      indexKlines = await fetchIndexKline('1.000300', 60);
      if (indexKlines && indexKlines.length >= 20) {
        quantRegime = detectQuantRegime(indexKlines, store.marketData);
        store.quantRegime = quantRegime;
      }
    } catch (e) {
      console.warn('[Analysis] Index kline fetch failed');
    }

    var analysisResults = await runThreeFrameworkAnalysis(topCandidates, indexKlines, quantRegime);
    // Show top 8 (increased from 5)
    var topN = analysisResults.slice(0, 8);

    if (topN.length === 0) {
      throw new Error('所有候选股票分析失败');
    }

    store.recommendations = topN.map(function(analysis, idx) {
      return buildRecommendationFromAnalysis(analysis, idx + 1);
    });

    // ---- Save this round's codes for next-day rotation ----
    saveRecentRecommendations(topN.map(function(a) { return String(a.stock.f12); }));

    hideAnalysisProgress();
    store.analysisRunning = false;
    store.dataStatus.recommendations = 'live';

  } catch (err) {
    console.warn('[Analysis] Three-framework analysis failed, falling back:', err.message);
    hideAnalysisProgress();
    store.analysisRunning = false;
    recordError('recommendations', err.message);

    store.recommendations = FALLBACK_RECS.map(function(r) {
      return Object.assign({}, r, { live: false, confluenceScore: 50, harmonicScore: 40,
        factorScore: 38, statsPass: false, sharpe: 0.5, correlation: 0.4,
        harmonicWeight: 16, factorWeight: 14, statsWeight: 8,
        antiQuantWeight: 0, antiQuantScore: null,
        momentumScore: 42, valueScore: 40, qualityScore: 38,
        volatilityScore: 35, sentimentScore: 45,
        patternName: '无标准形态', patternDirection: null, pivotCount: 0,
        quantRegime: null, volumeAuthScore: null, patternStabilityScore: null, trapRiskScore: null
      });
    });
    store.dataStatus.recommendations = 'fallback';
  }
}

// ---- Three-Framework Analysis Pipeline ----

async function analyzeSingleStock(stock, indexKlines, quantRegime) {
  var rawCode = String(stock.f12);
  var secid = makeSecidFromRawCode(rawCode);
  var klines = await fetchStockKline(secid, 60);
  if (!klines || klines.length < 15) throw new Error('K线数据不足');

  var harmonic = HarmonicPatternDetector.analyze(klines);
  var factors = calculateMultiFactorScore(stock, klines, indexKlines);
  var stats = statisticalValidation(klines, indexKlines, 10);
  var statsScore = stats.pass ? Math.min(100, Math.max(10, 50 + stats.sharpe * 30))
                              : Math.max(0, 20 + stats.sharpe * 20);

  var volumeAuth = calcVolumeAuthenticity(klines);
  var patternStability = calcPatternStability(klines);
  var trapRisk = calcQuantTrapRisk(klines, harmonic);
  var antiQuantScore = volumeAuth.score * 0.35 + patternStability.score * 0.35 + trapRisk.score * 0.30;

  var hWeight, fWeight, sWeight, aqWeight;
  if (quantRegime && quantRegime.regime === 'high_quant') {
    hWeight = 0.20; fWeight = 0.30; sWeight = 0.25; aqWeight = 0.25;
  } else if (quantRegime && quantRegime.regime === 'moderate_quant') {
    hWeight = 0.30; fWeight = 0.35; sWeight = 0.25; aqWeight = 0.10;
  } else {
    hWeight = 0.40; fWeight = 0.35; sWeight = 0.25; aqWeight = 0.00;
  }

  var rawScore = harmonic.score * hWeight + factors.totalScore * fWeight +
                  statsScore * sWeight + antiQuantScore * aqWeight;
  var confluenceScore = applyCorrectionToScore(rawScore);
  var correctionApplied = store.correctionEnabled && store.correctionFactor && store.correctionFactor.factor !== null;

  var quantPosMultiplier = 1.0;
  if (quantRegime && quantRegime.regime === 'high_quant') quantPosMultiplier = 0.6;
  else if (quantRegime && quantRegime.regime === 'moderate_quant') quantPosMultiplier = 0.8;

  return {
    stock: stock, secid: secid, rawCode: rawCode, klines: klines,
    harmonic: harmonic, factors: factors, stats: stats,
    confluenceScore: Math.round(confluenceScore),
    rawConfluenceScore: Math.round(rawScore),
    correctionApplied: correctionApplied,
    correctionFactor: correctionApplied && store.correctionFactor ? store.correctionFactor.factor : 0,
    harmonicWeight: Math.round(harmonic.score * hWeight),
    factorWeight: Math.round(factors.totalScore * fWeight),
    statsWeight: Math.round(statsScore * sWeight),
    antiQuantWeight: Math.round(antiQuantScore * aqWeight),
    antiQuant: {
      regime: quantRegime,
      volumeAuth: volumeAuth, patternStability: patternStability, trapRisk: trapRisk,
      compositeScore: Math.round(antiQuantScore), quantPosMultiplier: quantPosMultiplier
    }
  };
}

async function runThreeFrameworkAnalysis(candidates, indexKlines, quantRegime) {
  var results = [];
  var total = candidates.length;
  updateAnalysisProgress(0, total, '开始三框架分析...');

  for (var i = 0; i < total; i++) {
    var c = candidates[i];
    var stockName = c.stock.f14 || ('股票' + c.stock.f12);
    try {
      updateAnalysisProgress(i, total, '分析中: ' + stockName + ' (谐波+因子+统计+反量化)');
      var analysis = await analyzeSingleStock(c.stock, indexKlines, quantRegime);
      if (analysis) results.push(analysis);
    } catch (err) {
      console.warn('[Analysis] ' + stockName + ' 分析失败:', err.message);
    }
    if (i % 2 === 1 && i < total - 1) {
      await new Promise(function(r) { setTimeout(r, 200); });
    }
  }

  updateAnalysisProgress(total, total, '分析完成，生成推荐...');
  results.sort(function(a, b) { return b.confluenceScore - a.confluenceScore; });
  return results;
}

function buildRecommendationFromAnalysis(analysis, rank) {
  var s = analysis.stock, hm = analysis.harmonic;
  var fac = analysis.factors, st = analysis.stats;
  var aq = analysis.antiQuant;
  var price = s.f2;
  var code = String(s.f12);
  var suffix = (code.startsWith('6') || code.startsWith('5') || code.startsWith('9')) ? '.SH' : '.SZ';

  var atrMultiplierStop = 2;
  if (aq && aq.regime && aq.regime.regime === 'high_quant') atrMultiplierStop = 3.0;
  else if (aq && aq.regime && aq.regime.regime === 'moderate_quant') atrMultiplierStop = 2.5;

  var stopLoss = (hm.bestPattern && hm.bestPattern.stopLoss)
    ? hm.bestPattern.stopLoss : Math.min(price - st.atr * atrMultiplierStop, price * 0.95);

  var takeProfit, tpDesc = '';
  if (hm.bestPattern && hm.bestPattern.targets && hm.bestPattern.targets.length > 0) {
    takeProfit = hm.bestPattern.targets[0]; tpDesc = '(127.2%延伸)';
  } else {
    takeProfit = price * 1.15; tpDesc = '(15%目标)';
  }

  var quantPosAdj = (aq && aq.quantPosMultiplier) ? aq.quantPosMultiplier : 1.0;
  var pos = Math.min(20, Math.max(3, Math.round(st.adjustedPosition * quantPosAdj)));

  var holdPeriod = hm.score >= 60 && fac.totalScore >= 55 ? '中线(2-4周)'
    : hm.score >= 40 ? '短线(3-7天)' : '短线(1-5天)';

  var buyThreshold = (aq && aq.regime && aq.regime.regime === 'high_quant') ? 65
    : (aq && aq.regime && aq.regime.regime === 'moderate_quant') ? 62 : 60;
  var holdThreshold = (aq && aq.regime && aq.regime.regime === 'high_quant') ? 45
    : (aq && aq.regime && aq.regime.regime === 'moderate_quant') ? 42 : 40;

  var signal, signalClass;
  if (analysis.confluenceScore >= buyThreshold) { signal = '买入'; signalClass = 'buy'; }
  else if (analysis.confluenceScore >= holdThreshold) { signal = '关注'; signalClass = 'hold'; }
  else { signal = '观望'; signalClass = 'hold'; }

  var patternName = hm.bestPattern ? hm.bestPattern.pattern : '结构分析';

  // Build rationale (trusted HTML from analysis engine)
  var parts = [];
  if (hm.bestPattern) {
    parts.push('<strong>谐波形态</strong>: ' + escapeHtml(hm.summary) +
      ' (置信度' + hm.bestPattern.confidence + '%, 转折点' + hm.pivotCount + '个)');
  } else {
    parts.push('<strong>谐波形态</strong>: ' + escapeHtml(hm.summary));
  }
  parts.push('<strong>因子评分[' + fac.totalScore + '分]</strong>: ' + escapeHtml(fac.breakdown));
  var stTxt = '<strong>统计检验[' + (st.pass ? '通过' : '部分通过') + ']</strong>: ';
  stTxt += '夏普' + (st.sharpe >= 0 ? '+' : '') + st.sharpe.toFixed(2);
  stTxt += ', ATR' + st.atrPct.toFixed(1) + '%';
  stTxt += ', 仓位调整' + st.adjustedPosition + '%';
  if (quantPosAdj < 1.0) stTxt += '→量化折减' + Math.round(quantPosAdj * 100) + '%';
  parts.push(stTxt);

  if (aq && aq.regime && aq.regime.regime !== 'normal') {
    var aqTxt = '<strong>反量化检测[' + aq.regime.regime.toUpperCase() + ']</strong>: ';
    aqTxt += '量化冲击指数=' + aq.regime.score;
    aqTxt += ', 量真实性=' + aq.volumeAuth.score;
    aqTxt += ', 形态稳定=' + aq.patternStability.score;
    aqTxt += ', 陷阱风险=' + aq.trapRisk.score;
    aqTxt += ' | 反量化综合=' + aq.compositeScore;
    parts.push(aqTxt);
  }

  parts.push('<strong>实时行情</strong>: 现价' + fmtPrice(price, false) +
    ', 涨跌' + fmtChange(s.f3) + ', 振幅' + fmtNum(s.f7 || 0, 1) + '%' +
    ', 成交额' + (s.f6 > 1e8 ? fmtNum(s.f6 / 1e8, 1) + '亿' : fmtNum(s.f6 / 1e4, 0) + '万'));
  if (st.sharpe < 0.5) parts.push('<strong>风险</strong>: 夏普偏低，严格止损。');
  if (!st.pass) parts.push('<strong>注意</strong>: 波动率偏高，建议仓位' + st.adjustedPosition + '%。');
  if (aq && aq.regime && aq.regime.regime === 'high_quant') {
    parts.push('<strong>量化警告</strong>: 市场处于量化高频主导环境，止损放宽至' +
      atrMultiplierStop.toFixed(1) + 'x ATR，仓位降至' + pos + '%，警惕假突破和止损猎杀。');
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
      + (aq && aq.regime && aq.regime.regime !== 'normal' ? ' | 反量化' + aq.compositeScore : ''),
    rationale: parts.join('<br>'),
    live: true, currentPrice: price, changePct: s.f3,
    confluenceScore: analysis.confluenceScore,
    harmonicScore: hm.score, factorScore: fac.totalScore, statsPass: st.pass,
    sharpe: st.sharpe, correlation: st.correlation,
    harmonicWeight: analysis.harmonicWeight,
    factorWeight: analysis.factorWeight, statsWeight: analysis.statsWeight,
    antiQuantWeight: analysis.antiQuantWeight || 0,
    momentumScore: fac.momentum, valueScore: fac.value,
    qualityScore: fac.quality, volatilityScore: fac.volatility,
    sentimentScore: fac.sentiment,
    patternName: patternName, patternDirection: hm.bestPattern ? hm.bestPattern.direction : null,
    pivotCount: hm.pivotCount,
    correctionApplied: analysis.correctionApplied || false,
    rawConfluenceScore: analysis.rawConfluenceScore || analysis.confluenceScore,
    correctionFactor: analysis.correctionFactor || 0,
    quantRegime: aq ? aq.regime : null,
    antiQuantScore: aq ? aq.compositeScore : null,
    volumeAuthScore: aq ? aq.volumeAuth.score : null,
    patternStabilityScore: aq ? aq.patternStability.score : null,
    trapRiskScore: aq ? aq.trapRisk.score : null
  };
}

// ---- Modal & Interaction ----

function openRefreshModal() {
  var modal = document.getElementById('refreshModal');
  if (!modal) return;

  var statusText = '';
  if (store.dataStatus.indices === 'live') {
    statusText = '当前数据源: <strong style="color:var(--green)">东方财富实时API</strong><br>指数数据每60秒自动刷新。';
  } else if (store.dataStatus.indices === 'fallback') {
    statusText = '当前数据源: <strong style="color:var(--orange)">备用模拟数据</strong><br>东方财富API暂时不可用。';
  } else {
    statusText = '数据加载中...';
  }

  var modalBody = modal.querySelector('.modal-box p');
  if (modalBody) {
    modalBody.innerHTML = '系统搭载 <strong>三框架分析引擎</strong>：谐波形态检测(Pillar 1) + 多因子评分(Pillar 2) + 统计检验(Pillar 3)。<br>基于东方财富实时行情API，每60秒自动刷新指数数据。<br>推荐基于K线形态识别与量化因子综合评分。<br><br>' + statusText;
  }
  modal.classList.add('active');

  // Focus trap: focus first button in modal
  var closeBtn = modal.querySelector('button');
  if (closeBtn) setTimeout(function() { closeBtn.focus(); }, 100);
}

function closeRefreshModal() {
  var modal = document.getElementById('refreshModal');
  if (modal) {
    modal.classList.remove('active');
    // Return focus to refresh button
    var refreshBtn = document.querySelector('.btn-refresh');
    if (refreshBtn) refreshBtn.focus();
  }
}

function manualRefresh() {
  var btn = document.querySelector('.btn-refresh');
  if (btn) {
    btn.classList.add('refreshing');
    btn.disabled = true;
  }
  store.isPreGenerated = false;
  store.preGeneratedTime = null;
  var navDate = document.getElementById('navDate');
  if (navDate) {
    navDate.textContent = TODAY + ' 08:00 CST [实时分析中...]';
  }
  refreshAllData().finally(function() {
    if (btn) {
      btn.classList.remove('refreshing');
      btn.disabled = false;
    }
    if (navDate) {
      var now = new Date();
      var timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      navDate.textContent = TODAY + ' ' + timeStr + ' CST [实时]';
    }
  });
}

// ---- Auto-Refresh Timer ----

var autoRefreshTimer = null;

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(function() {
    refreshIndicesOnly();
  }, REFRESH_INTERVAL);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

// ---- Main Initialization ----

function init() {
  console.log('[Init] Harmonious Trading Advisor v2.1 starting...');

  // Compute TODAY dynamically
  var now = new Date();
  TODAY = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  // Check for pre-generated data
  var hasPreGenData = false;
  if (typeof window.__MARKET_DATA__ !== 'undefined' && window.__MARKET_DATA__) {
    var pg = window.__MARKET_DATA__;
    if (pg.date === TODAY && pg.isPreGenerated) {
      hasPreGenData = true;

      store.marketData = (pg.marketData && pg.marketData.length > 0)
        ? pg.marketData
        : FALLBACK_MARKET.map(function(m) { return Object.assign({}, m, { live: false }); });

      store.recommendations = (pg.recommendations && pg.recommendations.length > 0)
        ? pg.recommendations.map(function(r) { return Object.assign({}, r, { live: r.live !== false }); })
        : FALLBACK_RECS.map(function(r) { return Object.assign({}, r, { live: false }); });

      store.positions = (pg.positions && pg.positions.length > 0)
        ? pg.positions.map(function(p) {
            var daysHeld = (p.entryDate && p.entryDate !== TODAY)
              ? Math.max(1, Math.floor((now - new Date(p.entryDate)) / 86400000)) : 0;
            return {
              entryDate: p.entryDate || TODAY, code: p.code, name: p.name,
              entryPrice: p.entryPrice || '--', currentPrice: p.currentPrice || '--',
              currentPriceRaw: p.currentPriceRaw || p.entryPrice || 0,
              pnl: p.pnl || '--', pnlClass: p.pnlClass || 'positive', pnlRaw: p.pnlRaw || 0,
              status: p.status || 'holding', statusText: p.statusText || '持仓中',
              action: p.action || '持有', actionClass: p.actionClass || 'hold',
              daysHeld: daysHeld, expectedRemain: p.expectedRemain || '--',
              stopLoss: p.stopLoss || '--', atr: p.atr || '--',
              advice: p.advice || '', live: p.live !== false,
            };
          })
        : POSITION_DEFS.map(function(p) {
            return {
              entryDate: p.entryDate, code: p.code, name: p.name,
              entryPrice: fmtPrice(p.entryPrice, false),
              currentPrice: '--', currentPriceRaw: p.entryPrice,
              pnl: '--', pnlClass: 'positive', pnlRaw: 0,
              status: p.status, statusText: p.statusText,
              action: p.action, actionClass: p.actionClass,
              daysHeld: calcDaysHeld(p.daysHeldBase),
              expectedRemain: p.expectedRemain, stopLoss: fmtPrice(p.stopLoss, false),
              atr: p.atr, advice: p.advice, live: false,
            };
          });

      store.history = (pg.history && pg.history.length > 0) ? pg.history : FALLBACK_HISTORY;

      store.isPreGenerated = true;
      store.preGeneratedTime = pg.generatedAtDisplay;
      store.dataStatus.indices = 'pregenerated';
      store.dataStatus.recommendations = 'pregenerated';
      store.dataStatus.positions = 'pregenerated';
      store.lastUpdate = new Date();
    }
  }

  // Set navbar date
  var navDate = document.getElementById('navDate');
  if (navDate) {
    var dateStr;
    if (hasPreGenData) {
      dateStr = TODAY + ' ' + (store.preGeneratedTime || '08:00 CST') + ' [预生成]';
    } else {
      dateStr = TODAY + ' 08:00 CST [实时]';
    }
    navDate.textContent = dateStr;
  }

  // Load persisted data
  loadUserPositions();
  renderUserPositionInputs();
  loadBacktestFromStorage();
  if (store.backtestResults) {
    renderBacktestResults();
  }
  updateCorrectionToggleUI();

  if (store.userAnalysisResults && store.userAnalysisResults.length > 0) {
    renderUserPositionResults(store.userAnalysisResults);
  }

  // Render initial state
  if (!hasPreGenData) {
    store.marketData = FALLBACK_MARKET.map(function(m) {
      return Object.assign({}, m, { live: false });
    });
    store.recommendations = FALLBACK_RECS.map(function(r) {
      return Object.assign({}, r, { live: false });
    });
    store.positions = POSITION_DEFS.map(function(p) {
      return {
        entryDate: p.entryDate, code: p.code, name: p.name,
        entryPrice: fmtPrice(p.entryPrice, false),
        currentPrice: '加载中...', currentPriceRaw: p.entryPrice,
        pnl: '--', pnlClass: 'positive', pnlRaw: 0,
        status: p.status, statusText: p.statusText,
        action: p.action, actionClass: p.actionClass,
        daysHeld: calcDaysHeld(p.daysHeldBase),
        expectedRemain: p.expectedRemain,
        stopLoss: fmtPrice(p.stopLoss, false),
        atr: p.atr, advice: p.advice, live: false,
      };
    });

    renderMarketOverview();
    renderRecommendations();
    renderActivePositions();
    renderHistory();
    updateDataBadge('loading');

    refreshAllData().then(function() {
      startAutoRefresh();
    }).catch(function(err) {
      console.error('[Init] Critical error:', err);
      updateDataBadge('error');
      showToast('error', '初始化失败', '数据加载出错，请尝试手动刷新页面。', 0);
    });
  } else {
    renderMarketOverview();
    renderRecommendations();
    renderActivePositions();
    renderHistory();
    updateFooter();
    updateDataBadge('pregenerated');
    startAutoRefresh();
  }

  // Bind UI events
  var refreshBtn = document.querySelector('.btn-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function(e) {
      e.preventDefault();
      manualRefresh();
    });
  }

  var modal = document.getElementById('refreshModal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) closeRefreshModal();
    });
  }

  var btToggle = document.getElementById('btToggleCorrection');
  if (btToggle) {
    btToggle.addEventListener('click', function() {
      toggleCorrection();
    });
    // Make toggle keyboard accessible
    btToggle.setAttribute('tabindex', '0');
    btToggle.setAttribute('role', 'switch');
    btToggle.setAttribute('aria-checked', store.correctionEnabled ? 'true' : 'false');
    btToggle.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCorrection();
        btToggle.setAttribute('aria-checked', store.correctionEnabled ? 'true' : 'false');
      }
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeRefreshModal();
    if (e.key === 'r' && e.ctrlKey) {
      e.preventDefault();
      manualRefresh();
    }
  });

  // Announce ready state to screen readers
  var announcer = document.getElementById('srAnnouncer');
  if (announcer) {
    announcer.textContent = '和谐交易顾问已就绪' + (hasPreGenData ? '，使用预生成数据' : '，正在获取实时数据');
  }

  console.log('[Init] Ready. ' + (hasPreGenData ? 'Using pre-generated data.' : 'Live data loading in background.'));
}

// Boot on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
  stopAutoRefresh();
});
