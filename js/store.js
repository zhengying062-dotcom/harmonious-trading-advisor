/* ============================================================
   GLOBAL STATE MANAGEMENT
   ============================================================ */
"use strict";

const store = {
  marketData: [],
  recommendations: [],
  positions: [],
  history: FALLBACK_HISTORY,
  dataStatus: {
    indices: 'loading',
    recommendations: 'loading',
    positions: 'loading',
    intlIndices: 'fallback'
  },
  lastUpdate: null,
  updateCount: 0,
  errors: [],
  analysisRunning: false,
  isPreGenerated: false,
  preGeneratedTime: null,
  userPositions: [],
  userAnalysisRunning: false,
  userAnalysisResults: [],
  backtestResults: null,
  correctionFactor: null,
  correctionEnabled: true,
  quantRegime: null,
  // Track which positions came from user analysis
  userSyncedPositions: []
};

/**
 * Update the data badge in navbar
 */
function updateDataBadge(status) {
  var badge = document.getElementById('dataBadge');
  if (!badge) return;
  var text = '';
  switch (status) {
    case 'live':
      text = '<span class="data-dot live"></span> 实时数据';
      break;
    case 'delayed':
      text = '<span class="data-dot delayed"></span> 延迟数据';
      break;
    case 'loading':
      text = '<span class="spinner" style="width:10px;height:10px;border-width:1.5px;"></span> 加载中';
      break;
    case 'error':
      text = '<span class="data-dot error"></span> 数据异常';
      break;
    case 'pregenerated':
      text = '<span class="data-dot live" style="background:var(--cyan);"></span> 预生成数据';
      break;
    default:
      text = status;
  }
  badge.className = 'data-badge ' + status;
  badge.innerHTML = text;
}

/**
 * Determine overall data status from individual statuses
 */
function updateOverallStatus() {
  var statuses = [store.dataStatus.indices, store.dataStatus.recommendations, store.dataStatus.positions];
  var hasLive = statuses.some(function(s) { return s === 'live'; });
  var allFallback = statuses.every(function(s) { return s === 'fallback'; });
  var anyError = statuses.some(function(s) { return s === 'error'; });

  if (allFallback || anyError) {
    updateDataBadge('delayed');
  } else if (hasLive) {
    updateDataBadge('live');
  } else {
    updateDataBadge('loading');
  }
}

/**
 * Record an error for diagnostics
 */
function recordError(source, message) {
  store.errors.push({ time: new Date(), source: source, message: message });
  if (store.errors.length > 50) store.errors.shift();
}
