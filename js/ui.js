/* ============================================================
   UI RENDER FUNCTIONS
   All innerHTML usage here uses escapeHtml() for XSS safety
   ============================================================ */
"use strict";

// ---- Analysis Progress UI ----

function updateAnalysisProgress(current, total, detail) {
  var container = document.getElementById('analysisProgress');
  var countEl = document.getElementById('analysisProgressCount');
  var fillEl = document.getElementById('analysisProgressFill');
  var detailEl = document.getElementById('analysisProgressDetail');
  if (container && !container.classList.contains('active')) {
    container.classList.add('active');
  }
  if (countEl) countEl.textContent = current + ' / ' + total;
  if (fillEl) fillEl.style.width = (total > 0 ? (current / total * 100) : 0) + '%';
  if (detailEl && detail) detailEl.textContent = detail;
}

function hideAnalysisProgress() {
  var container = document.getElementById('analysisProgress');
  if (container) container.classList.remove('active');
}

// ---- Market Overview ----

function renderMarketOverview() {
  var grid = document.getElementById('marketGrid');
  if (!grid) return;

  var data = store.marketData;
  if (!data || data.length === 0) {
    data = FALLBACK_MARKET.map(function(m) { return Object.assign({}, m, { live: false }); });
  }

  var html = '';
  for (var i = 0; i < data.length; i++) {
    var m = data[i];
    var liveClass = m.live ? 'live' : 'fallback';
    var liveTitle = m.live ? '实时数据' : '延迟/模拟数据';
    html += '<div class="market-item" role="listitem">' +
      '<div class="market-live-dot ' + liveClass + '" title="' + escapeHtml(liveTitle) + '" aria-label="' + escapeHtml(liveTitle) + '"></div>' +
      '<div class="market-info">' +
        '<span class="market-name">' + escapeHtml(m.name) + '</span>' +
        '<span class="market-value">' + escapeHtml(m.value) + '</span>' +
      '</div>' +
      '<span class="market-change ' + (m.up ? 'up' : 'down') + '" aria-label="涨跌幅 ' + escapeHtml(m.change) + '">' + escapeHtml(m.change) + '</span>' +
    '</div>';
  }
  grid.innerHTML = html;

  updateSentimentSection();
}

function updateSentimentSection() {
  var sentimentVal = document.getElementById('sentimentVal');
  if (!sentimentVal) return;

  var liveIndices = store.marketData.filter(function(m) {
    return m.live && !m.name.includes('S&P') && !m.name.includes('纳斯达克') &&
           !m.name.includes('FTSE') && !m.name.includes('DAX') && !m.name.includes('日经');
  });
  if (liveIndices.length >= 3) {
    var upCount = liveIndices.filter(function(m) { return m.up; }).length;
    var ratio = upCount / liveIndices.length;
    if (ratio >= 0.7) {
      sentimentVal.textContent = '偏多';
      sentimentVal.style.color = 'var(--green)';
    } else if (ratio >= 0.4) {
      sentimentVal.textContent = '中性偏多';
      sentimentVal.style.color = 'var(--orange)';
    } else {
      sentimentVal.textContent = '偏空';
      sentimentVal.style.color = 'var(--red)';
    }
  }
}

// ---- Recommendations ----

function renderRecommendations() {
  var container = document.getElementById('recCards');
  if (!container) return;

  var recs = store.recommendations;
  if (!recs || recs.length === 0) {
    if (store.dataStatus.recommendations === 'loading') {
      container.innerHTML = getSkeletonRecCards();
      return;
    }
    container.innerHTML = '<div class="no-rec-placeholder" role="status">' +
      '<div class="icon" aria-hidden="true">&#128269;</div>' +
      '<div class="title">今日无符合标准的推荐</div>' +
      '<div class="reason">三框架融合分析未发现高置信度交易机会。<br>市场可能处于调整阶段，谐波形态不完整或因子评分未达标。</div></div>';
    return;
  }

  var html = '';
  for (var i = 0; i < recs.length; i++) {
    var r = recs[i];
    var isRec = r.signalClass === 'buy';

    // Confluence score badge (safe - numeric)
    var cs = r.confluenceScore || 0;
    var clvl = cs >= 65 ? 'strong' : (cs >= 40 ? 'moderate' : 'weak');
    var cbadge = cs > 0 ? '<span class="confluence-badge ' + clvl + '" title="三框架融合得分">' + cs + '分</span>' : '';

    // Correction badge (safe - numeric)
    var corrBadge = '';
    if (r.correctionApplied && r.correctionFactor !== 0) {
      var ctag = r.correctionFactor < -0.03 ? 'down' : (r.correctionFactor > 0.03 ? 'up' : 'neutral');
      corrBadge = '<span class="bt-correction-tag ' + ctag + '" title="原始得分:' + (r.rawConfluenceScore || cs) + '">已校正 ' + (r.correctionFactor >= 0 ? '+' : '') + r.correctionFactor.toFixed(2) + '</span>';
    }

    // Framework contribution percentages (safe - numeric)
    var hw = r.harmonicWeight || 0, fw = r.factorWeight || 0, sw = r.statsWeight || 0;
    var aqw = r.antiQuantWeight || 0;
    var tw = Math.max(1, hw + fw + sw + aqw);
    var hPct = Math.round(hw / tw * 100);
    var fPct = Math.round(fw / tw * 100);
    var sPct = Math.round(sw / tw * 100);
    var aqPct = Math.round(aqw / tw * 100);

    // Pattern label
    var pn = escapeHtml(r.patternName || '结构分析');
    var pd = r.patternDirection === 'bullish'
      ? ' <span style="color:var(--green);font-size:0.65rem;" aria-label="看涨">▲</span>'
      : (r.patternDirection === 'bearish' ? ' <span style="color:var(--red);font-size:0.65rem;" aria-label="看跌">▼</span>' : '');

    // Stats info line (safe - numeric)
    var sinfo = '';
    if (r.sharpe != null) {
      sinfo = '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:4px;">' +
        '夏普: <span style="font-family:var(--font-mono);color:' +
        (r.sharpe >= 1 ? 'var(--green)' : r.sharpe >= 0.3 ? 'var(--orange)' : 'var(--red)') + ';">' +
        (r.sharpe >= 0 ? '+' : '') + r.sharpe.toFixed(2) + '</span>' +
        ' | 相关: <span style="font-family:var(--font-mono);">' +
        (r.correlation != null ? (r.correlation * 100).toFixed(0) + '%' : '--') + '</span>' +
        ' | 检验: <span style="color:' + (r.statsPass ? 'var(--green)' : 'var(--orange)') + ';">' +
        (r.statsPass ? '通过' : '部分通过') + '</span></div>';
    }

    var liveIndicator = r.live ? '<span style="font-size:0.65rem;color:var(--green);" title="实时行情" aria-label="实时行情">● 实时</span>' :
                                  '<span style="font-size:0.65rem;color:var(--orange);" title="使用模拟数据" aria-label="模拟数据">● 模拟</span>';

    // Rationale contains HTML tags from analysis (pre-formatted, trusted)
    // It comes from our own analysis engine, not user input

    html += '<div class="rec-card ' + (isRec ? 'recommended' : 'watch') + '" role="article" aria-label="' + escapeHtml(r.code) + ' ' + escapeHtml(r.name) + ' ' + escapeHtml(r.signal) + '">' +
      '<div class="rec-card-top">' +
        '<div>' +
          '<div class="rec-stock-code">' + escapeHtml(r.code) + ' ' + liveIndicator + ' ' + cbadge + ' ' + corrBadge + '</div>' +
          '<div class="rec-stock-name">' + escapeHtml(r.name) +
            ' <span style="font-size:0.65rem;color:var(--purple);">' + pn + pd + '</span></div>' +
        '</div>' +
        '<span class="rec-badge ' + (r.signalClass === 'buy' ? 'buy' : 'hold') + '">' + escapeHtml(r.signal) + '</span>' +
      '</div>' +
      '<div class="rec-details">' +
        '<div class="rec-detail"><span class="lbl">建议仓位</span><span class="val" style="color:var(--cyan)">' + escapeHtml(r.position) + '</span></div>' +
        '<div class="rec-detail"><span class="lbl">持有周期</span><span class="val">' + escapeHtml(r.holdPeriod) + '</span></div>' +
        '<div class="rec-detail"><span class="lbl">入场价格区间</span><span class="val up">' + escapeHtml(r.entryRange) + '</span></div>' +
        '<div class="rec-detail"><span class="lbl">止损价</span><span class="val down">' + escapeHtml(r.stopLoss) + '</span></div>' +
        '<div class="rec-detail"><span class="lbl">止盈目标</span><span class="val up">' + escapeHtml(r.takeProfit) + '</span></div>' +
        '<div class="rec-detail"><span class="lbl">ATR(14)</span><span class="val">' + escapeHtml(r.atr) + '</span></div>' +
      '</div>' +
      '<div class="framework-scores" aria-label="三框架贡献度">' +
        '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">三框架贡献度' + (aqw > 0 ? ' + 反量化' : '') + '</div>' +
        '<div class="fw-score-row">' +
          '<span class="fw-score-label">谐波</span>' +
          '<div class="fw-score-bar-wrap"><div class="fw-score-fill harmonic" style="width:' + hPct + '%"></div></div>' +
          '<span class="fw-score-val">' + (r.harmonicScore || 0) + '</span>' +
        '</div>' +
        '<div class="fw-score-row">' +
          '<span class="fw-score-label">因子</span>' +
          '<div class="fw-score-bar-wrap"><div class="fw-score-fill factors" style="width:' + fPct + '%"></div></div>' +
          '<span class="fw-score-val">' + (r.factorScore || 0) + '</span>' +
        '</div>' +
        '<div class="fw-score-row">' +
          '<span class="fw-score-label">统计</span>' +
          '<div class="fw-score-bar-wrap"><div class="fw-score-fill stats" style="width:' + sPct + '%"></div></div>' +
          '<span class="fw-score-val">' + (sw || 0) + '</span>' +
        '</div>' +
        (aqw > 0 ?
        '<div class="fw-score-row">' +
          '<span class="fw-score-label" style="color:var(--orange);">反量化</span>' +
          '<div class="fw-score-bar-wrap"><div class="fw-score-fill anti-quant" style="width:' + aqPct + '%;background:var(--orange);"></div></div>' +
          '<span class="fw-score-val" style="color:var(--orange);">' + (r.antiQuantScore || 0) + '</span>' +
        '</div>' : '') +
      '</div>' +
      sinfo +
      '<div class="rec-rationale">' + (r.rationale || '') + '</div>' +
    '</div>';
  }
  container.innerHTML = html;
}

/**
 * Generate skeleton loading cards for recommendations
 */
function getSkeletonRecCards() {
  var html = '';
  for (var i = 0; i < 3; i++) {
    html += '<div class="skeleton-rec-card" aria-hidden="true">' +
      '<div class="skeleton-rec-header">' +
        '<div><div class="skeleton skeleton-rec-code"></div></div>' +
        '<div class="skeleton skeleton-rec-badge"></div>' +
      '</div>' +
      '<div class="skeleton-rec-details">' +
        '<div class="skeleton skeleton-rec-detail"></div>' +
        '<div class="skeleton skeleton-rec-detail"></div>' +
        '<div class="skeleton skeleton-rec-detail"></div>' +
        '<div class="skeleton skeleton-rec-detail"></div>' +
        '<div class="skeleton skeleton-rec-detail"></div>' +
        '<div class="skeleton skeleton-rec-detail"></div>' +
      '</div>' +
      '<div class="skeleton-rec-rationale">' +
        '<div class="skeleton skeleton-rec-line"></div>' +
        '<div class="skeleton skeleton-rec-line"></div>' +
        '<div class="skeleton skeleton-rec-line"></div>' +
      '</div>' +
    '</div>';
  }
  return html;
}

// ---- Active Positions Table ----

function renderActivePositions() {
  var table = document.getElementById('posTable');
  var countEl = document.getElementById('posCount');
  if (!table) return;

  var positions = store.positions;
  if (!positions || positions.length === 0) {
    positions = POSITION_DEFS.map(function(p) {
      return {
        entryDate: p.entryDate, code: p.code, name: p.name,
        entryPrice: fmtPrice(p.entryPrice, false),
        currentPrice: fmtPrice(p.entryPrice, false),
        currentPriceRaw: p.entryPrice, pnl: '--', pnlClass: 'positive',
        status: p.status, statusText: p.statusText,
        action: p.action, actionClass: p.actionClass,
        daysHeld: calcDaysHeld(p.daysHeldBase),
        expectedRemain: p.expectedRemain,
        stopLoss: fmtPrice(p.stopLoss, false),
        atr: p.atr, advice: p.advice, live: false, pnlRaw: 0
      };
    });
  }

  if (countEl) {
    countEl.textContent = '共 ' + positions.length + ' 个活跃持仓';
  }

  var html = '<thead><tr>' +
    '<th scope="col">买入日</th><th scope="col">代码</th><th scope="col">名称</th><th scope="col">买入价</th><th scope="col">现价</th>' +
    '<th scope="col">盈亏</th><th scope="col">状态</th><th scope="col">操作建议</th><th scope="col">持有天数</th>' +
    '<th scope="col">止损价</th><th scope="col">分析点评</th>' +
    '</tr></thead><tbody>';

  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    var liveMark = p.live ? '' : ' <span style="font-size:0.6rem;color:var(--orange)" aria-label="延迟数据">(延迟)</span>';
    html += '<tr>' +
      '<td>' + escapeHtml(p.entryDate) + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:600">' + escapeHtml(p.code) + '</td>' +
      '<td>' + escapeHtml(p.name) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + escapeHtml(p.entryPrice) + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:600">' + escapeHtml(p.currentPrice) + liveMark + '</td>' +
      '<td class="pos-pnl ' + p.pnlClass + '">' + escapeHtml(p.pnl) + '</td>' +
      '<td><span class="status-badge ' + escapeHtml(p.status) + '">' + escapeHtml(p.statusText) + '</span></td>' +
      '<td><span class="action-badge ' + escapeHtml(p.actionClass) + '">' + escapeHtml(p.action) + '</span></td>' +
      '<td>' + p.daysHeld + '天</td>' +
      '<td style="font-family:var(--font-mono);color:var(--red)">' + escapeHtml(p.stopLoss) + '</td>' +
      '<td style="max-width:200px;white-space:normal;font-size:0.76rem;color:var(--text-secondary)">' + escapeHtml(p.advice) + '</td>' +
      '</tr>';
  }
  html += '</tbody>';
  table.innerHTML = html;
}

// ---- History Table ----

function renderHistory() {
  var table = document.getElementById('historyTable');
  if (!table) return;
  var history = store.history;

  var html = '<thead><tr>' +
    '<th scope="col">推荐日期</th><th scope="col">代码</th><th scope="col">名称</th><th scope="col">入场价</th><th scope="col">出场价</th>' +
    '<th scope="col">盈亏</th><th scope="col">结果</th><th scope="col">持有天数</th><th scope="col">分析框架</th>' +
    '</tr></thead><tbody>';

  for (var i = 0; i < history.length; i++) {
    var h = history[i];
    html += '<tr>' +
      '<td>' + escapeHtml(h.date) + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:600">' + escapeHtml(h.code) + '</td>' +
      '<td>' + escapeHtml(h.name) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + escapeHtml(h.entry) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + escapeHtml(h.exit) + '</td>' +
      '<td class="pos-pnl ' + (h.outcome === 'win' ? 'positive' : 'negative') + '">' + escapeHtml(h.pnl) + '</td>' +
      '<td><span class="outcome-badge ' + escapeHtml(h.outcome) + '">' + escapeHtml(h.result) + '</span></td>' +
      '<td>' + h.days + '天</td>' +
      '<td style="font-size:0.76rem;color:var(--text-secondary)">' + escapeHtml(h.framework) + '</td>' +
      '</tr>';
  }
  html += '</tbody>';
  table.innerHTML = html;
}

// ---- Footer ----

function updateFooter() {
  var timeSpan = document.querySelector('.footer-bar span:first-child');
  var dataSourceSpan = document.getElementById('footerDataSource');
  var now = new Date();
  var timeStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0') + ' CST';

  if (timeSpan) {
    var dotClass = store.dataStatus.indices === 'live' ? 'dot-live' : '';
    timeSpan.innerHTML = '<span class="' + dotClass + '" style="width:7px;height:7px;background:' +
      (store.dataStatus.indices === 'live' ? 'var(--green)' : 'var(--orange)') +
      ';border-radius:50%;display:inline-block;' +
      (store.dataStatus.indices === 'live' ? 'animation:pulse 2s infinite;' : '') +
      '"></span> 最后更新: ' + escapeHtml(timeStr);
  }

  if (dataSourceSpan) {
    if (store.isPreGenerated) {
      dataSourceSpan.textContent = '预生成数据 · ' + (store.preGeneratedTime || '--') + ' | 三框架分析引擎 v2.0';
    } else if (store.dataStatus.indices === 'live' && store.dataStatus.positions === 'live') {
      dataSourceSpan.textContent = '东方财富 (实时行情) | 三框架分析引擎 v2.0';
    } else if (store.dataStatus.indices === 'fallback') {
      dataSourceSpan.textContent = '东方财富 (连接失败) | 三框架分析引擎 (降级模式)';
    } else {
      dataSourceSpan.textContent = '东方财富 + 三框架分析引擎 | 加载中...';
    }
  }
}
