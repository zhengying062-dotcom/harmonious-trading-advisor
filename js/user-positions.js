/* ============================================================
   USER POSITION MANAGEMENT
   Input, autocomplete, analysis, and result rendering
   All DOM output uses escapeHtml() for XSS prevention
   ============================================================ */
"use strict";

var UP_ROWS_EXPANDED = false;
var _acTimer = null;

// ---- Position I/O ----

function loadUserPositions() {
  try {
    var raw = localStorage.getItem(UP_STORAGE_KEY);
    if (raw) {
      var data = JSON.parse(raw);
      if (Array.isArray(data)) {
        store.userPositions = data.slice(0, UP_MAX_SLOTS);
        return;
      }
    }
  } catch (err) {
    console.warn('[UserPos] Failed to load positions:', err.message);
  }
  store.userPositions = [];
}

function saveUserPositions() {
  var positions = readPositionsFromDOM();
  store.userPositions = positions;
  try {
    localStorage.setItem(UP_STORAGE_KEY, JSON.stringify(positions));
    updateSlotCount();
    var saveBtn = document.querySelector('.up-btn-save');
    if (saveBtn) {
      saveBtn.textContent = '已保存';
      saveBtn.style.background = 'var(--green)';
      saveBtn.style.borderColor = 'var(--green)';
      setTimeout(function() {
        saveBtn.textContent = '保存持仓';
        saveBtn.style.background = 'var(--blue)';
        saveBtn.style.borderColor = 'var(--blue)';
      }, 1500);
    }
    syncUserPositionsToTracker();
  } catch (err) {
    console.warn('[UserPos] Failed to save positions:', err.message);
    showToast('error', '保存失败', '无法保存持仓数据: ' + err.message);
  }
}

function readPositionsFromDOM() {
  var positions = [];
  var container = document.getElementById('upInputContainer');
  if (!container) return positions;

  var rows = container.querySelectorAll('.up-input-row');
  rows.forEach(function(row) {
    var codeInput = row.querySelector('.up-code-input');
    var priceInput = row.querySelector('.up-price-input');
    var dateInput = row.querySelector('.up-date-input');
    var nameDisplay = row.querySelector('.up-name-display');

    var code = codeInput ? codeInput.value.trim() : '';
    if (code && code.length >= 6) {
      positions.push({
        code: code,
        name: nameDisplay ? nameDisplay.textContent.replace('--', '') : '',
        buyPrice: priceInput ? parseFloat(priceInput.value) || 0 : 0,
        buyDate: dateInput ? (dateInput.value || TODAY) : TODAY
      });
    }
  });
  return positions;
}

function updateSlotCount() {
  var positions = readPositionsFromDOM();
  var countEl = document.getElementById('upSlotCount');
  if (countEl) {
    countEl.textContent = '已录入 ' + positions.length + '/' + UP_MAX_SLOTS + ' 个持仓';
  }
}

// ---- Input Rendering ----

function renderUserPositionInputs() {
  var container = document.getElementById('upInputContainer');
  var expandBtn = document.getElementById('btnExpandRows');
  if (!container) return;

  var positions = store.userPositions || [];
  var html = '';

  for (var i = 0; i < UP_MAX_SLOTS; i++) {
    var pos = (i < positions.length) ? positions[i] : null;
    var code = pos ? escapeHtml(pos.code) : '';
    var name = pos ? escapeHtml(pos.name || '--') : '--';
    var buyPrice = pos ? (pos.buyPrice || '') : '';
    var buyDate = pos ? (pos.buyDate || TODAY) : TODAY;
    var rowClass = (i >= UP_VISIBLE_DEFAULT) ? 'up-input-row up-row-hidden' : 'up-input-row';
    if (pos) rowClass += ' filled';

    html += '<div class="' + rowClass + '" data-slot="' + i + '" role="group" aria-label="持仓行 ' + (i + 1) + '">' +
      '<span class="row-index" aria-hidden="true">#' + (i + 1) + '</span>' +
      '<div class="up-code-wrap">' +
        '<input type="text" class="up-code-input" placeholder="股票代码" value="' + code +
        '" maxlength="6" autocomplete="off" aria-label="股票代码 行' + (i + 1) + '"' +
        ' oninput="onCodeInput(this, ' + i + ')" onfocus="onCodeFocus(this, ' + i + ')" onblur="onCodeBlur(this, ' + i + ')"' +
        ' onkeydown="onCodeKeydown(event, this, ' + i + ')">' +
        '<div class="up-autocomplete" id="upAc_' + i + '" role="listbox" aria-label="搜索建议"></div>' +
      '</div>' +
      '<span class="up-name-display' + (name === '--' ? ' empty' : '') + '" id="upName_' + i + '" aria-live="polite">' + name + '</span>' +
      '<input type="number" class="up-price-input" placeholder="买入价(可选)" value="' + buyPrice +
      '" step="0.01" aria-label="买入价格 行' + (i + 1) + '" onchange="updateSlotCount()">' +
      '<input type="date" class="up-date-input" value="' + buyDate + '" aria-label="买入日期 行' + (i + 1) + '" onchange="updateSlotCount()">' +
      '<button class="up-btn up-btn-remove" onclick="removeUserPositionRow(' + i + ')" title="清除此行" aria-label="清除第' + (i + 1) + '行持仓">X</button>' +
    '</div>';
  }

  container.innerHTML = html;

  if (expandBtn) {
    expandBtn.style.display = UP_MAX_SLOTS > UP_VISIBLE_DEFAULT ? 'block' : 'none';
    expandBtn.textContent = '展开更多 (' + (UP_VISIBLE_DEFAULT + 1) + '-' + UP_MAX_SLOTS + ')';
  }

  updateSlotCount();

  if (UP_ROWS_EXPANDED) {
    expandHiddenRows(true);
  }
}

// ---- Row Management ----

function toggleExpandRows() {
  UP_ROWS_EXPANDED = !UP_ROWS_EXPANDED;
  expandHiddenRows(UP_ROWS_EXPANDED);
  var btn = document.getElementById('btnExpandRows');
  if (btn) {
    btn.textContent = UP_ROWS_EXPANDED ? '收起' : '展开更多 (' + (UP_VISIBLE_DEFAULT + 1) + '-' + UP_MAX_SLOTS + ')';
  }
}

function expandHiddenRows(expand) {
  var rows = document.querySelectorAll('.up-row-hidden');
  rows.forEach(function(row) {
    if (expand) {
      row.classList.add('expanded');
    } else {
      row.classList.remove('expanded');
    }
  });
}

function removeUserPositionRow(index) {
  var row = document.querySelector('.up-input-row[data-slot="' + index + '"]');
  if (row) {
    var codeInput = row.querySelector('.up-code-input');
    var priceInput = row.querySelector('.up-price-input');
    var nameDisplay = row.querySelector('.up-name-display');
    if (codeInput) codeInput.value = '';
    if (priceInput) priceInput.value = '';
    if (nameDisplay) { nameDisplay.textContent = '--'; nameDisplay.classList.add('empty'); }
    row.classList.remove('filled');
  }
  updateSlotCount();
  clearUserAnalysisResult(index);
}

function clearAllUserPositions() {
  showConfirmModal('确定要清空所有持仓数据吗？此操作不可恢复。', function() {
    for (var i = 0; i < UP_MAX_SLOTS; i++) {
      removeUserPositionRow(i);
    }
    store.userPositions = [];
    store.userAnalysisResults = [];
    try { localStorage.removeItem(UP_STORAGE_KEY); } catch(e) {}
    updateSlotCount();
    hideUserAnalysisResults();
  });
}

// ---- Autocomplete with Keyboard Navigation ----

var _acSelectedIndex = {}; // slotIndex -> selected index

function onCodeInput(inputEl, slotIndex) {
  updateSlotCount();
  var code = inputEl.value.trim();
  var nameDisplay = document.getElementById('upName_' + slotIndex);
  if (nameDisplay && code.length < 6) {
    nameDisplay.textContent = '--';
    nameDisplay.classList.add('empty');
  }

  if (_acTimer) clearTimeout(_acTimer);
  if (code.length >= 3) {
    _acTimer = setTimeout(function() {
      searchStockName(code, slotIndex);
    }, 300);
  } else {
    hideAutocomplete(slotIndex);
  }
}

function onCodeFocus(inputEl, slotIndex) {
  var code = inputEl.value.trim();
  if (code.length >= 3) {
    searchStockName(code, slotIndex);
  }
}

function onCodeBlur(inputEl, slotIndex) {
  setTimeout(function() {
    hideAutocomplete(slotIndex);
  }, 200);
}

/**
 * Keyboard navigation for autocomplete dropdown
 */
function onCodeKeydown(event, inputEl, slotIndex) {
  var acEl = document.getElementById('upAc_' + slotIndex);
  if (!acEl || !acEl.classList.contains('active')) return;

  var items = acEl.querySelectorAll('.up-autocomplete-item');
  if (items.length === 0) return;

  if (_acSelectedIndex[slotIndex] === undefined) {
    _acSelectedIndex[slotIndex] = -1;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    _acSelectedIndex[slotIndex] = Math.min(_acSelectedIndex[slotIndex] + 1, items.length - 1);
    updateAcSelection(items, slotIndex);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    _acSelectedIndex[slotIndex] = Math.max(_acSelectedIndex[slotIndex] - 1, 0);
    updateAcSelection(items, slotIndex);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (_acSelectedIndex[slotIndex] >= 0 && _acSelectedIndex[slotIndex] < items.length) {
      items[_acSelectedIndex[slotIndex]].click();
    }
  } else if (event.key === 'Escape') {
    hideAutocomplete(slotIndex);
  }
}

function updateAcSelection(items, slotIndex) {
  items.forEach(function(item, idx) {
    if (idx === _acSelectedIndex[slotIndex]) {
      item.classList.add('keyboard-selected');
      item.setAttribute('aria-selected', 'true');
      // Scroll into view
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('keyboard-selected');
      item.setAttribute('aria-selected', 'false');
    }
  });
}

function showAutocomplete(slotIndex, items, keyword) {
  var acEl = document.getElementById('upAc_' + slotIndex);
  if (!acEl) return;

  _acSelectedIndex[slotIndex] = -1;

  if (!items || items.length === 0) {
    acEl.innerHTML = '<div class="up-autocomplete-item" style="color:var(--text-muted);cursor:default;" role="option" aria-disabled="true">未找到匹配股票</div>';
    acEl.classList.add('active');
    return;
  }

  var html = '';
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    html += '<div class="up-autocomplete-item" role="option" aria-selected="false"' +
      ' onmousedown="event.preventDefault();selectStock(' + slotIndex + ',\'' +
      escapeHtml(item.code).replace(/'/g, "\\'") + '\',\'' +
      escapeHtml(item.name || '').replace(/'/g, "\\'") + '\',\'' +
      escapeHtml(item.fullCode || '').replace(/'/g, "\\'") + '\')">' +
      '<span><span class="ac-code">' + escapeHtml(item.code) + '</span>' +
      (item.market ? ' <span class="ac-market">' + escapeHtml(item.market) + '</span>' : '') +
      '</span>' +
      '<span class="ac-name">' + escapeHtml(item.name || '') + '</span>' +
    '</div>';
  }
  acEl.innerHTML = html;
  acEl.classList.add('active');
}

function hideAutocomplete(slotIndex) {
  var acEl = document.getElementById('upAc_' + slotIndex);
  if (acEl) acEl.classList.remove('active');
  _acSelectedIndex[slotIndex] = -1;
}

function selectStock(slotIndex, code, name, fullCode) {
  var row = document.querySelector('.up-input-row[data-slot="' + slotIndex + '"]');
  if (!row) return;

  var codeInput = row.querySelector('.up-code-input');
  var nameDisplay = document.getElementById('upName_' + slotIndex);

  if (codeInput) {
    codeInput.value = code;
    row.classList.add('filled');
  }
  if (nameDisplay) {
    nameDisplay.textContent = name;
    nameDisplay.classList.remove('empty');
  }

  hideAutocomplete(slotIndex);
  updateSlotCount();
}

// ---- User Position Analysis ----

async function analyzeUserPositions() {
  var positions = readPositionsFromDOM();

  if (positions.length === 0) {
    showToast('warning', '无持仓数据', '请先输入至少一个股票代码再进行分析。', 4000);
    return;
  }

  if (store.userAnalysisRunning) {
    return;
  }
  store.userAnalysisRunning = true;

  var btn = document.getElementById('btnAnalyzeUser');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '分析中...';
  }

  var container = document.getElementById('upAnalysisContainer');
  var grid = document.getElementById('upAnalysisGrid');
  var subtitle = document.getElementById('upAnalysisSubtitle');
  if (container) container.style.display = 'block';
  if (subtitle) subtitle.textContent = '正在获取实时数据并运行三框架分析...';

  // Render skeleton loading cards
  if (grid) {
    grid.innerHTML = getSkeletonAnalysisCards(positions);
  }

  // Step 1: Get index K-line for correlation & quant regime
  var indexKlines = null;
  var quantRegime = null;
  try {
    indexKlines = await fetchIndexKline('1.000300', 60);
    if (indexKlines && indexKlines.length >= 20) {
      quantRegime = detectQuantRegime(indexKlines, store.marketData);
    }
  } catch(e) {
    console.warn('[UserAnalysis] Index kline fetch failed');
  }

  // Step 2: Analyze each stock
  var results = [];
  for (var i = 0; i < positions.length; i++) {
    var pos = positions[i];
    var loadCard = document.getElementById('upLoadCard_' + i);

    try {
      if (loadCard) {
        loadCard.querySelector('.loading-detail').textContent = '获取K线数据...';
      }

      var secid = makeSecidFromRawCode(pos.code);
      var klines = await fetchStockKline(secid, 60);
      if (!klines || klines.length < 15) {
        throw new Error('K线数据不足 (获取到' + (klines ? klines.length : 0) + '根)');
      }

      if (loadCard) {
        loadCard.querySelector('.loading-detail').textContent = '运行谐波形态检测...';
      }

      // Get live price
      var livePrice = null, liveChange = null;
      try {
        var priceUrl = API.ULIST + '?fltt=2&fields=f2,f3,f4,f14&secids=' + secid;
        var priceData = await apiFetch(priceUrl, 5000);
        if (priceData && priceData.data && priceData.data.diff && priceData.data.diff.length > 0) {
          livePrice = priceData.data.diff[0].f2;
          liveChange = priceData.data.diff[0].f3;
          if (!pos.name || pos.name === '--') {
            pos.name = priceData.data.diff[0].f14 || pos.name;
          }
        }
      } catch(e) {
        console.warn('[UserAnalysis] Live price fetch failed for ' + pos.code);
      }

      if (!livePrice) {
        livePrice = klines[klines.length - 1].close;
        liveChange = klines[klines.length - 1].changePct || 0;
      }

      // Build pseudo stock object for factor calculation
      var stockObj = {
        f2: livePrice, f3: liveChange,
        f7: klines[klines.length - 1].amplitude || 0,
        f9: 20, f10: 1.0,
        f12: pos.code, f14: pos.name || ('股票' + pos.code),
        f6: klines[klines.length - 1].amount || 0
      };

      if (loadCard) {
        loadCard.querySelector('.loading-detail').textContent = '计算多因子评分...';
      }

      var harmonic = HarmonicPatternDetector.analyze(klines);
      var factors = calculateMultiFactorScore(stockObj, klines, indexKlines);
      var stats = statisticalValidation(klines, indexKlines, 10);

      // Anti-quant analysis
      var volumeAuth = calcVolumeAuthenticity(klines);
      var patternStability = calcPatternStability(klines);
      var trapRisk = calcQuantTrapRisk(klines, harmonic);
      var antiQuantScore = volumeAuth.score * 0.35 + patternStability.score * 0.35 + trapRisk.score * 0.30;
      var quantPosMultiplier = 1.0;
      if (quantRegime && quantRegime.regime === 'high_quant') quantPosMultiplier = 0.6;
      else if (quantRegime && quantRegime.regime === 'moderate_quant') quantPosMultiplier = 0.8;

      // Dynamic weight adjustment
      var hWeight, fWeight, sWeight, aqWeight;
      if (quantRegime && quantRegime.regime === 'high_quant') {
        hWeight = 0.20; fWeight = 0.30; sWeight = 0.25; aqWeight = 0.25;
      } else if (quantRegime && quantRegime.regime === 'moderate_quant') {
        hWeight = 0.30; fWeight = 0.35; sWeight = 0.25; aqWeight = 0.10;
      } else {
        hWeight = 0.40; fWeight = 0.35; sWeight = 0.25; aqWeight = 0.00;
      }

      var statsScore = stats.pass ? Math.min(100, Math.max(10, 50 + stats.sharpe * 30)) : Math.max(0, 20 + stats.sharpe * 20);
      var rawScore = harmonic.score * hWeight + factors.totalScore * fWeight +
                      statsScore * sWeight + antiQuantScore * aqWeight;
      var confluenceScore = applyCorrectionToScore(rawScore);

      var recommendation = determineRecommendation(confluenceScore, harmonic, factors, stats, pos, livePrice);

      var result = {
        code: pos.code, name: pos.name || stockObj.f14,
        buyPrice: pos.buyPrice || 0, buyDate: pos.buyDate || TODAY,
        currentPrice: livePrice, changePct: liveChange,
        harmonic: harmonic, factors: factors, stats: stats,
        confluenceScore: Math.round(confluenceScore),
        rawConfluenceScore: Math.round(rawScore),
        correctionApplied: store.correctionEnabled && store.correctionFactor && store.correctionFactor.factor !== null,
        correctionFactor: store.correctionEnabled && store.correctionFactor ? store.correctionFactor.factor : 0,
        recommendation: recommendation, klines: klines,
        antiQuant: {
          regime: quantRegime,
          volumeAuth: volumeAuth, patternStability: patternStability, trapRisk: trapRisk,
          compositeScore: Math.round(antiQuantScore), quantPosMultiplier: quantPosMultiplier
        },
        antiQuantWeight: Math.round(antiQuantScore * aqWeight)
      };

      results.push(result);

      if (loadCard) {
        loadCard.querySelector('.loading-detail').textContent = '分析完成';
      }

    } catch (err) {
      console.warn('[UserAnalysis] Analysis failed for ' + pos.code + ': ' + err.message);
      results.push({
        code: pos.code, name: pos.name || ('股票' + pos.code),
        buyPrice: pos.buyPrice || 0, buyDate: pos.buyDate || TODAY,
        currentPrice: 0, changePct: 0, error: err.message,
        confluenceScore: 0, recommendation: 'error'
      });
    }
  }

  store.userAnalysisResults = results;
  store.userAnalysisRunning = false;

  if (btn) {
    btn.disabled = false;
    btn.textContent = '分析我的持仓';
  }

  if (subtitle) {
    subtitle.textContent = '已完成 ' + results.length + ' 只股票分析 · 基于谐波形态 + 多因子模型 + 统计检验';
  }

  renderUserPositionResults(results);
}

function getSkeletonAnalysisCards(positions) {
  var html = '';
  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    html += '<div class="skeleton-result-card" id="upLoadCard_' + i + '" aria-hidden="true">' +
      '<div class="skeleton-result-header">' +
        '<div><div class="skeleton skeleton-result-code"></div></div>' +
        '<div class="skeleton skeleton-result-badge"></div>' +
      '</div>' +
      '<div class="skeleton skeleton-result-score"></div>' +
      '<div class="skeleton-result-bars">' +
        '<div class="skeleton skeleton-result-bar"></div>' +
        '<div class="skeleton skeleton-result-bar"></div>' +
        '<div class="skeleton skeleton-result-bar"></div>' +
        '<div class="skeleton skeleton-result-bar"></div>' +
        '<div class="skeleton skeleton-result-bar"></div>' +
      '</div>' +
      '<div class="skeleton-result-stats">' +
        '<div class="skeleton skeleton-result-stat"></div>' +
        '<div class="skeleton skeleton-result-stat"></div>' +
      '</div>' +
      '<div class="skeleton-result-summary">' +
        '<div class="skeleton skeleton-result-summary-line"></div>' +
        '<div class="skeleton skeleton-result-summary-line"></div>' +
      '</div>' +
      // Hidden loading detail for status updates
      '<div class="loading-detail" style="display:none;">准备中...</div>' +
    '</div>';
  }
  return html;
}

/**
 * Determine recommendation based on confluence score
 */
function determineRecommendation(confluenceScore, harmonic, factors, stats, pos, currentPrice) {
  var pnlPct = 0;
  if (pos.buyPrice > 0 && currentPrice > 0) {
    pnlPct = ((currentPrice - pos.buyPrice) / pos.buyPrice) * 100;
  }
  var hasProfit = pnlPct > 0;

  if (confluenceScore >= 70) return hasProfit ? 'add' : 'buy';
  else if (confluenceScore >= 50) return hasProfit ? 'hold' : 'add';
  else if (confluenceScore >= 30) return hasProfit ? 'reduce' : 'hold';
  else return hasProfit ? 'sell' : 'reduce';
}

/**
 * Render user position analysis results with XSS-safe output
 */
function renderUserPositionResults(results) {
  var grid = document.getElementById('upAnalysisGrid');
  if (!grid) return;

  if (!results || results.length === 0) {
    grid.innerHTML = '<div class="up-empty-hint">无分析结果</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < results.length; i++) {
    var r = results[i];

    if (r.error) {
      html += '<div class="up-error-card" role="alert">' +
        '<strong>' + escapeHtml(r.code) + '</strong> ' + escapeHtml(r.name || '') +
        '<br>分析失败: ' + escapeHtml(r.error) + '</div>';
      continue;
    }

    var recClass = 'recommend-' + r.recommendation;
    var recLabels = { 'buy': '买入', 'add': '加仓', 'hold': '持有', 'reduce': '减仓', 'sell': '卖出' };
    var recLabel = recLabels[r.recommendation] || '观望';

    var hm = r.harmonic;
    var fac = r.factors;
    var st = r.stats;

    var patternInfo = hm.bestPattern
      ? escapeHtml(hm.bestPattern.pattern) + ' (' + (hm.bestPattern.direction === 'bullish' ? '看涨' : '看跌') + ', 置信度' + hm.bestPattern.confidence + '%)'
      : (hm.pivotCount >= 4 ? '趋势结构完整 (转折点' + hm.pivotCount + '个)' : '转折点不足');

    var changeClass = (r.changePct >= 0) ? 'up' : 'down';
    var changeSign = (r.changePct >= 0) ? '+' : '';

    var atr = st.atr || HarmonicPatternDetector.calcATR(r.klines || [], 14);
    var suggestedStop = r.currentPrice > 0 ? Math.max(0, r.currentPrice - atr * 2) : 0;

    // Price change color
    var priceChangeColor = r.confluenceScore >= 60 ? 'var(--green)' : r.confluenceScore >= 40 ? 'var(--orange)' : 'var(--red)';
    var scoreColor = r.confluenceScore >= 60 ? 'var(--green)' : r.confluenceScore >= 40 ? 'var(--orange)' : 'var(--red)';

    html += '<div class="up-result-card ' + recClass + '" role="article" aria-label="' + escapeHtml(r.code) + ' 分析结果 ' + recLabel + '">' +
      '<div class="up-card-header">' +
        '<div>' +
          '<div class="up-card-code">' + escapeHtml(r.code) +
            '<span style="font-size:0.65rem;color:var(--text-muted);margin-left:4px;">' +
              (r.code.startsWith('6') ? '.SH' : '.SZ') + '</span></div>' +
          '<div class="up-card-name">' + escapeHtml(r.name) + '</div>' +
          '<div class="up-card-price">' + escapeHtml(fmtPrice(r.currentPrice, false)) +
            ' <span class="up-card-change ' + changeClass + '">' + changeSign + escapeHtml(fmtNum(r.changePct, 2)) + '%</span></div>' +
          (r.buyPrice > 0 ? '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">成本: ' +
            escapeHtml(fmtPrice(r.buyPrice, false)) + ' | 浮盈: <span style="font-family:var(--font-mono);color:' +
            ((r.currentPrice - r.buyPrice) >= 0 ? 'var(--green)' : 'var(--red)') + ';">' +
            ((r.currentPrice - r.buyPrice) >= 0 ? '+' : '') + escapeHtml(fmtNum(((r.currentPrice - r.buyPrice) / r.buyPrice) * 100, 2)) + '%</span></div>' : '') +
        '</div>' +
        '<span class="up-rec-badge ' + r.recommendation + '">' + recLabel + '</span>' +
      '</div>' +

      // Confluence score
      '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;">' +
        '三框架融合得分: <span style="font-family:var(--font-mono);font-weight:700;color:' +
        scoreColor + ';font-size:1rem;">' + r.confluenceScore + '</span>/100' +
        (r.correctionApplied ? '<span class="bt-correction-tag ' + (r.correctionFactor < -0.03 ? 'down' : (r.correctionFactor > 0.03 ? 'up' : 'neutral')) + '">校正 ' + (r.correctionFactor >= 0 ? '+' : '') + r.correctionFactor.toFixed(2) + ' (原始' + r.rawConfluenceScore + ')</span>' : '') +
        ' (谐波' + hm.score + ' + 因子' + fac.totalScore + ' + 统计' + (st.pass ? '通过' : '部分') + ')' +
      '</div>' +

      // Factor bars
      '<div class="up-factor-rows" aria-label="五因子评分">' +
        buildFactorRow('动量', fac.momentum, 'momentum') +
        buildFactorRow('价值', fac.value, 'value') +
        buildFactorRow('质量', fac.quality, 'quality') +
        buildFactorRow('波动', fac.volatility, 'volatility') +
        buildFactorRow('情绪', fac.sentiment, 'sentiment') +
      '</div>' +

      // Stats row
      '<div class="up-stats-row">' +
        '<span>谐波: <strong>' + patternInfo + '</strong></span>' +
        '<span>夏普: <strong style="color:' + (st.sharpe >= 1 ? 'var(--green)' : st.sharpe >= 0.3 ? 'var(--orange)' : 'var(--red)') + ';">' +
          (st.sharpe >= 0 ? '+' : '') + escapeHtml(st.sharpe.toFixed(2)) + '</strong></span>' +
        '<span>相关: <strong>' + (st.correlation * 100).toFixed(0) + '%</strong></span>' +
        '<span>ATR: <strong>' + escapeHtml(st.atrPct.toFixed(1)) + '%</strong></span>' +
      '</div>' +

      // Summary
      '<div class="up-card-summary">' +
        '<strong>操作建议: </strong>' + buildRecommendationText(r) +
        (suggestedStop > 0 && r.recommendation !== 'sell' ? '<br><strong>建议止损: </strong>' +
          '<span style="font-family:var(--font-mono);color:var(--red);">' + escapeHtml(fmtPrice(suggestedStop, false)) + '</span> (ATR x2)' : '') +
        '<br><strong>仓位建议: </strong>' +
          '<span style="font-family:var(--font-mono);color:var(--cyan);">' + st.adjustedPosition + '%</span> (ATR动态调整)' +
      '</div>' +
    '</div>';
  }

  grid.innerHTML = html;

  var container = document.getElementById('upAnalysisContainer');
  if (container) container.style.display = 'block';

  syncUserPositionsToTracker();
}

function buildFactorRow(label, score, cls) {
  return '<div class="up-factor-row">' +
    '<span class="up-factor-label">' + escapeHtml(label) + '</span>' +
    '<div class="up-factor-bar-wrap"><div class="up-factor-fill ' + cls + '" style="width:' + Math.max(2, score) + '%"></div></div>' +
    '<span class="up-factor-val">' + (score || 0) + '</span>' +
  '</div>';
}

function buildRecommendationText(result) {
  var texts = {
    'buy': '<span style="color:var(--green);font-weight:700;">强烈建议买入</span> — 三框架高度共振，谐波形态明确且因子评分优异。建议在现价附近建立仓位。',
    'add': '<span style="color:var(--cyan);font-weight:700;">建议加仓</span> — 当前持仓方向正确，三框架信号支持继续增持。可在回调至支撑位时加仓。',
    'hold': '<span style="color:var(--blue);font-weight:700;">继续持有</span> — 三框架信号中性偏多，持有观望。密切跟踪止损位。',
    'reduce': '<span style="color:var(--orange);font-weight:700;">建议减仓</span> — 谐波结构转弱或因子评分下降，建议降低仓位锁定部分风险。',
    'sell': '<span style="color:var(--red);font-weight:700;">建议卖出</span> — 三框架信号均转弱，谐波结构破坏或止损触发风险高。建议离场观望。'
  };
  return texts[result.recommendation] || '待进一步观察';
}

function hideUserAnalysisResults() {
  var container = document.getElementById('upAnalysisContainer');
  if (container) container.style.display = 'none';
  var grid = document.getElementById('upAnalysisGrid');
  if (grid) grid.innerHTML = '';
}

function clearUserAnalysisResult(index) {
  if (store.userAnalysisResults && store.userAnalysisResults[index]) {
    store.userAnalysisResults.splice(index, 1);
  }
  if (store.userAnalysisResults && store.userAnalysisResults.length > 0) {
    renderUserPositionResults(store.userAnalysisResults);
  } else {
    hideUserAnalysisResults();
  }
}

/**
 * Sync user position analysis results to active positions tracker
 */
function syncUserPositionsToTracker() {
  if (!store.userAnalysisResults || store.userAnalysisResults.length === 0) return;

  var existingCodes = {};
  if (store.positions && store.positions.length > 0) {
    store.positions.forEach(function(p) {
      if (p.code) existingCodes[p.code.replace('.SH','').replace('.SZ','')] = true;
    });
  }

  var newPositions = [];
  store.userAnalysisResults.forEach(function(r) {
    if (r.error || r.recommendation === 'error') return;
    var bareCode = r.code;
    if (!existingCodes[bareCode] && !existingCodes[r.code]) {
      existingCodes[bareCode] = true;
      var atr = r.stats.atr || 1;
      var stopLoss = r.currentPrice > 0 ? Math.max(0, r.currentPrice - atr * 2) : 0;
      var recMap = { buy: '买入', add: '加仓 5%', hold: '持有', reduce: '减仓 50%', sell: '卖出' };
      var actionMap = { buy: 'buy', add: 'buy', hold: 'hold', reduce: 'sell', sell: 'sell' };
      var statusMap = { buy: 'await', add: 'add', hold: 'holding', reduce: 'reduce', sell: 'stop' };
      var statusTextMap = { buy: '等待入场', add: '加仓信号', hold: '持仓中', reduce: '减仓信号', sell: '止损触发' };

      var entryPrice = r.buyPrice > 0 ? r.buyPrice : r.currentPrice;
      var pnlRaw = ((r.currentPrice - entryPrice) / entryPrice) * 100;

      newPositions.push({
        entryDate: r.buyDate || TODAY,
        code: (r.code.startsWith('6') ? r.code + '.SH' : r.code + '.SZ'),
        name: r.name,
        entryPrice: fmtPrice(entryPrice, false),
        currentPrice: fmtPrice(r.currentPrice, false),
        currentPriceRaw: r.currentPrice,
        pnl: (pnlRaw >= 0 ? '+' : '') + fmtNum(pnlRaw, 2) + '%',
        pnlClass: pnlClass(pnlRaw),
        status: statusMap[r.recommendation] || 'holding',
        statusText: statusTextMap[r.recommendation] || '持仓中',
        action: recMap[r.recommendation] || '持有',
        actionClass: actionMap[r.recommendation] || 'hold',
        daysHeld: calcDaysHeld(r.buyDate || TODAY),
        expectedRemain: r.recommendation === 'buy' ? '待入场' : (r.recommendation === 'sell' ? '立即' : '1-3周'),
        stopLoss: fmtPrice(stopLoss, false),
        atr: fmtNum(atr, 2),
        advice: buildRecommendationText(r).replace(/<[^>]*>/g, ''),
        live: true,
        pnlRaw: pnlRaw
      });
    }
  });

  if (newPositions.length > 0) {
    store.positions = (store.positions || []).concat(newPositions);
    renderActivePositions();
  }
}

/**
 * Show a custom confirm modal instead of browser confirm()
 */
function showConfirmModal(message, onConfirm) {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '确认操作');
  overlay.innerHTML =
    '<div class="modal-box">' +
      '<h3>确认操作</h3>' +
      '<p>' + escapeHtml(message) + '</p>' +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
        '<button id="confirmModalCancel" style="background:var(--bg-hover);color:var(--text-primary);">取消</button>' +
        '<button id="confirmModalOk" style="background:var(--red);">确认清空</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  var close = function() {
    document.body.removeChild(overlay);
    document.removeEventListener('keydown', onKey);
  };

  var onKey = function(e) {
    if (e.key === 'Escape') close();
  };

  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) close();
  });

  document.getElementById('confirmModalCancel').addEventListener('click', close);
  document.getElementById('confirmModalOk').addEventListener('click', function() {
    close();
    if (onConfirm) onConfirm();
  });

  // Focus the cancel button
  setTimeout(function() {
    var cancelBtn = document.getElementById('confirmModalCancel');
    if (cancelBtn) cancelBtn.focus();
  }, 100);
}
