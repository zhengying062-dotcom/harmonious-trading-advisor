/* ============================================================
   API LAYER - Fetch functions with retry & timeout
   ============================================================ */
"use strict";

/**
 * Fetch with timeout and abort controller
 * @param {string} url - API URL
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<object>} Parsed JSON response
 */
async function apiFetch(url, timeout) {
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
 * Fetch with retry logic (exponential backoff)
 * @param {string} url - API URL
 * @param {number} timeout - Timeout per attempt in ms
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<object>} Parsed JSON response
 */
async function apiFetchWithRetry(url, timeout, maxRetries) {
  timeout = timeout || FETCH_TIMEOUT;
  maxRetries = maxRetries || 2;
  var lastErr = null;

  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiFetch(url, timeout);
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, 1500ms, ...
        var delay = 500 * Math.pow(2, attempt);
        await new Promise(function(r) { setTimeout(r, delay); });
      }
    }
  }
  throw lastErr;
}

/**
 * Fetch stock daily K-line data
 * @param {string} secid - EastMoney security ID, e.g. 1.600519
 * @param {number} limit - Number of K-line bars, default 60
 * @returns {Promise<Array|null>} K-line data array
 */
async function fetchStockKline(secid, limit) {
  limit = limit || 60;
  var url = API.KLINE +
    '?secid=' + encodeURIComponent(secid) +
    '&fields1=f1,f2,f3,f4,f5,f6' +
    '&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61' +
    '&klt=101&fqt=0&end=20500101&lmt=' + limit;
  try {
    var data = await apiFetchWithRetry(url, 8000, 2);
    if (!data || !data.data) {
      throw new Error('K线数据为空: ' + secid);
    }
    var klinesRaw = data.data.klines;
    if (!klinesRaw || klinesRaw.length === 0) {
      throw new Error('无K线记录: ' + secid);
    }
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
    console.warn('[Kline] 获取K线失败 secid=' + secid + ': ' + err.message);
    return null;
  }
}

/**
 * Fetch index daily K-line data
 */
async function fetchIndexKline(indexSecid, limit) {
  return fetchStockKline(indexSecid, limit || 60);
}

/**
 * Fetch Chinese index data from EastMoney
 */
async function fetchIndices() {
  var cnSecids = INDEX_DEFS
    .filter(function(d) { return !d.intl; })
    .map(function(d) { return d.secid; })
    .join(',');
  var url = API.ULIST + '?fltt=2&fields=f2,f3,f4,f12,f14&secids=' + cnSecids;
  try {
    var data = await apiFetchWithRetry(url, FETCH_TIMEOUT, 2);
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
              raw: item
            };
            break;
          }
        }
      });
      store.marketData = INDEX_DEFS.map(function(def) {
        if (liveMap[def.name]) {
          return {
            name: def.name,
            value: fmtPrice(liveMap[def.name].value, true),
            change: fmtChange(liveMap[def.name].change),
            up: liveMap[def.name].up,
            live: true
          };
        }
        var fb = FALLBACK_MARKET[def.fbIdx];
        return fb ? Object.assign({}, fb, { live: false }) : { name: def.name, value: '--', change: '--', up: false, live: false };
      });
      store.dataStatus.indices = 'live';
      store.lastUpdate = new Date();
      store.updateCount++;
    } else {
      throw new Error('Invalid API response structure');
    }
  } catch (err) {
    console.warn('[Data] Index fetch failed, using fallback:', err.message);
    recordError('indices', err.message);
    store.marketData = FALLBACK_MARKET.map(function(m) {
      return Object.assign({}, m, { live: false });
    });
    store.dataStatus.indices = 'fallback';
  }
}

/**
 * Fetch live prices for active positions
 */
async function fetchPositionPrices() {
  try {
    var secids = POSITION_DEFS.map(function(p) { return p.secid; }).join(',');
    var url = API.ULIST + '?fltt=2&fields=f2,f3,f4,f12,f14&secids=' + secids;
    var data = await apiFetchWithRetry(url, FETCH_TIMEOUT, 1);

    if (!data || !data.data || !data.data.diff) {
      throw new Error('Invalid position price response');
    }

    var priceMap = {};
    data.data.diff.forEach(function(item) {
      priceMap[String(item.f12)] = { price: item.f2, change: item.f3, name: item.f14 };
    });

    store.positions = POSITION_DEFS.map(function(p) {
      var codeNum = p.secid.replace('1.', '').replace('0.', '');
      var live = priceMap[codeNum];
      var currentPrice = live ? live.price : p.entryPrice;
      var pnlPct = ((currentPrice - p.entryPrice) / p.entryPrice) * 100;

      return {
        entryDate: p.entryDate,
        code: p.code,
        name: p.name,
        entryPrice: fmtPrice(p.entryPrice, false),
        currentPrice: fmtPrice(currentPrice, false),
        currentPriceRaw: currentPrice,
        pnl: (pnlPct >= 0 ? '+' : '') + fmtNum(pnlPct, 2) + '%',
        pnlClass: pnlClass(pnlPct),
        status: p.status,
        statusText: p.statusText,
        action: p.action,
        actionClass: p.actionClass,
        daysHeld: calcDaysHeld(p.daysHeldBase),
        expectedRemain: p.expectedRemain,
        stopLoss: fmtPrice(p.stopLoss, false),
        atr: p.atr,
        advice: p.advice,
        live: !!live,
        pnlRaw: pnlPct
      };
    });

    store.dataStatus.positions = 'live';
  } catch (err) {
    console.warn('[Data] Position price fetch failed:', err.message);
    recordError('positions', err.message);
    store.positions = POSITION_DEFS.map(function(p) {
      return {
        entryDate: p.entryDate, code: p.code, name: p.name,
        entryPrice: fmtPrice(p.entryPrice, false),
        currentPrice: fmtPrice(p.entryPrice, false),
        currentPriceRaw: p.entryPrice,
        pnl: '0.00%', pnlClass: 'positive',
        status: p.status, statusText: p.statusText,
        action: p.action, actionClass: p.actionClass,
        daysHeld: calcDaysHeld(p.daysHeldBase),
        expectedRemain: p.expectedRemain,
        stopLoss: fmtPrice(p.stopLoss, false),
        atr: p.atr, advice: p.advice + ' (实时价格获取失败)',
        live: false, pnlRaw: 0
      };
    });
    store.dataStatus.positions = 'fallback';
  }
}

/**
 * Search stock codes via EastMoney suggest API
 * @param {string} keyword - Search keyword
 * @param {number} slotIndex - Autocomplete slot index
 * @returns {Promise<Array>} Stock suggestions
 */
async function searchStockName(keyword, slotIndex) {
  if (window._acCache && window._acCache[keyword]) {
    showAutocomplete(slotIndex, window._acCache[keyword], keyword);
    return;
  }

  var url = API.SEARCH + '?input=' +
    encodeURIComponent(keyword) + '&type=14&token=' + API.SEARCH_TOKEN + '&count=8';

  try {
    var resp = await apiFetch(url, SEARCH_TIMEOUT);
    if (resp && resp.QuotationCodeTable && resp.QuotationCodeTable.Data) {
      var items = resp.QuotationCodeTable.Data.map(function(d) {
        return {
          code: d.Code,
          name: d.Name,
          market: (d.Market && d.Market.indexOf('SH') !== -1) ? '沪市' :
                  (d.Market && d.Market.indexOf('SZ') !== -1) ? '深市' : '',
          fullCode: d.Code + ((d.Market && d.Market.indexOf('SH') !== -1) ? '.SH' :
                               (d.Market && d.Market.indexOf('SZ') !== -1) ? '.SZ' : '')
        };
      });
      if (!window._acCache) window._acCache = {};
      window._acCache[keyword] = items;
      showAutocomplete(slotIndex, items, keyword);
    }
  } catch (err) {
    console.warn('[UserPos] Stock search failed:', err.message);
  }
}
