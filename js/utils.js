/* ============================================================
   UTILITY FUNCTIONS
   Includes HTML escaping for XSS prevention
   ============================================================ */
"use strict";

/**
 * HTML-escape a string to prevent XSS attacks.
 * Use this for ANY user-provided or API-returned data before
 * inserting into innerHTML.
 * @param {*} str - The value to escape
 * @returns {string} HTML-safe string
 */
function escapeHtml(str) {
  if (str == null) return '';
  var s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Safely set innerHTML after escaping all variable parts.
 * Use as: safeInnerHTML(el, '<span>', escapeHtml(name), '</span>')
 * Or use template literals with escapeHtml() on all dynamic values.
 * @param {HTMLElement} el - Target element
 * @param {string} html - Pre-escaped HTML string
 */
function safeInnerHTML(el, html) {
  if (!el) return;
  el.innerHTML = html;
}

/**
 * Format price for display
 */
function fmtPrice(v, isIndex) {
  if (v == null || isNaN(v)) return '--';
  if (isIndex) {
    return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return Number(v).toFixed(2);
}

/**
 * Format change percentage
 */
function fmtChange(v) {
  if (v == null || isNaN(v)) return '--';
  var sign = v >= 0 ? '+' : '';
  return sign + Number(v).toFixed(2) + '%';
}

/**
 * Format number to fixed decimals
 */
function fmtNum(n, decimals) {
  decimals = decimals || 2;
  return Number(n).toFixed(decimals);
}

/**
 * Get CSS class for P&L value
 */
function pnlClass(val) {
  return val >= 0 ? 'positive' : 'negative';
}

/**
 * Calculate days held from entry date
 */
function calcDaysHeld(dateStr) {
  var entry = new Date(dateStr);
  var today = new Date(TODAY);
  return Math.max(1, Math.floor((today - entry) / (1000 * 60 * 60 * 24)));
}

/**
 * Convert display code to EastMoney secid
 * "600519.SH" -> "1.600519"
 */
function makeSecid(code) {
  if (code.indexOf('.SH') > -1) return '1.' + code.replace('.SH', '');
  if (code.indexOf('.SZ') > -1) return '0.' + code.replace('.SZ', '');
  return code;
}

/**
 * Convert EastMoney secid to display code
 * "1.600519" -> "600519.SH"
 */
function makeDisplayCode(secid) {
  if (secid.startsWith('1.')) return secid.substring(2) + '.SH';
  if (secid.startsWith('0.')) return secid.substring(2) + '.SZ';
  return secid;
}

/**
 * Generate EastMoney secid from raw stock code
 * "600519" -> "1.600519", "000858" -> "0.000858"
 */
function makeSecidFromRawCode(rawCode) {
  var code = String(rawCode);
  var prefix = (code.startsWith('6') || code.startsWith('5') || code.startsWith('9')) ? '1' : '0';
  return prefix + '.' + code;
}

/**
 * Build a DOM element from an HTML string safely.
 * Only use with TRUSTED (pre-escaped) HTML content.
 * @param {string} html - Pre-escaped HTML string
 * @returns {HTMLElement}
 */
function htmlToElement(html) {
  var template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstChild;
}

/**
 * Show a toast notification to the user
 * @param {string} type - 'error', 'warning', 'info', 'success'
 * @param {string} title - Toast title
 * @param {string} message - Toast message
 * @param {number} duration - Auto-dismiss in ms (0 = no auto-dismiss)
 */
function showToast(type, title, message, duration) {
  type = type || 'info';
  duration = (duration === undefined) ? 5000 : duration;

  var container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-label', '通知消息');
    document.body.appendChild(container);
  }

  var icons = { error: '⚠', warning: '⚡', info: 'ℹ', success: '✓' };
  var icon = icons[type] || icons.info;

  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.setAttribute('role', 'alert');
  toast.innerHTML =
    '<span class="toast-icon" aria-hidden="true">' + icon + '</span>' +
    '<div class="toast-body">' +
      '<div class="toast-title">' + escapeHtml(title) + '</div>' +
      '<div class="toast-msg">' + escapeHtml(message) + '</div>' +
    '</div>' +
    '<button class="toast-close" aria-label="关闭通知" onclick="this.parentElement.remove()">✕</button>';

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(function() {
      if (toast.parentElement) {
        toast.classList.add('removing');
        setTimeout(function() {
          if (toast.parentElement) toast.remove();
        }, 300);
      }
    }, duration);
  }
}
