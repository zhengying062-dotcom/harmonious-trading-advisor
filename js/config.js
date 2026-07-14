/* ============================================================
   CONFIGURATION & CONSTANTS
   ============================================================ */
"use strict";

// ---- API Endpoints ----
// NOTE: The EastMoney search token below is the public token used by
// EastMoney's own web frontend (visible in their network requests).
// For a production deployment, consider proxying through a backend
// service to avoid exposing it in client-side code.
const API = {
  ULIST: 'https://push2.eastmoney.com/api/qt/ulist.np/get',
  CLIST: 'https://push2.eastmoney.com/api/qt/clist/get',
  KLINE: 'https://push2his.eastmoney.com/api/qt/stock/kline/get',
  SEARCH: 'https://searchadapter.eastmoney.com/api/suggest/get',
  SEARCH_TOKEN: 'D43BF722C8E33BDC906FB84D85E326E8'
};

const REFRESH_INTERVAL = 60000; // 60 seconds for index polling
const FETCH_TIMEOUT = 10000;    // 10 seconds per API call
const SEARCH_TIMEOUT = 5000;    // 5 seconds for search autocomplete

// TODAY is computed dynamically when init runs
var TODAY = '2026-05-15';

// ---- Fallback Market Data ----
const FALLBACK_MARKET = [
  { name: '上证综指', value: '3,287.42', change: '+0.73%', up: true },
  { name: '深证成指', value: '11,056.39', change: '+1.12%', up: true },
  { name: '沪深300', value: '4,152.80', change: '+0.85%', up: true },
  { name: '创业板指', value: '2,287.15', change: '+1.68%', up: true },
  { name: '恒生指数', value: '21,430.55', change: '-0.42%', up: false },
  { name: '日经225', value: '38,912.70', change: '+0.31%', up: true },
  { name: 'S&P 500', value: '5,847.63', change: '+0.54%', up: true },
  { name: '纳斯达克', value: '19,520.18', change: '+0.91%', up: true },
  { name: 'FTSE 100', value: '8,312.45', change: '-0.18%', up: false },
  { name: 'DAX', value: '18,935.20', change: '+0.47%', up: true }
];

const FALLBACK_RECS = [
  {
    code: '600519.SH', name: '贵州茅台', signal: '买入', signalClass: 'buy',
    position: '15%', holdPeriod: '中线 (2-4周)', entry: '1,482.00',
    entryRange: '1,475 - 1,488', stopLoss: '1,412.00',
    takeProfit: '1,580.00 (161.8% 延伸)', atr: '32.5',
    framework: '谐波看涨鲨鱼形态 + 多因子排名前5% + EV=+3.2%',
    rationale: '<strong>谐波形态</strong>: 日线完成看涨鲨鱼形态，PRZ区间 1,470-1,490 获得两次确认。<br><strong>因子排名</strong>: 动量因子 +1.8σ, 质量因子 +2.1σ, 综合排名沪深300第 4/300。<br><strong>期望值</strong>: 基于历史回测，该形态胜率 62%，风险回报比 1:3.1，正期望值 +3.2%。<br><strong>市场共振</strong>: 白酒板块资金流入加速，北向连续5日净买入。'
  },
  {
    code: '300750.SZ', name: '宁德时代', signal: '买入', signalClass: 'buy',
    position: '12%', holdPeriod: '短线 (3-5天)', entry: '238.50',
    entryRange: '236.80 - 240.00', stopLoss: '225.80',
    takeProfit: '258.00 (127.2% 延伸)', atr: '6.8',
    framework: '谐波看涨蝴蝶形态 + 均值回归信号 + EV=+1.8%',
    rationale: '<strong>谐波形态</strong>: 4小时图完成看涨蝴蝶形态，D点精准落在 127.2% Fibonacci 扩展。<br><strong>因子信号</strong>: 波动率收缩至布林带下轨，RSI(14) 32.6 进入超卖反弹区。<br><strong>Quantopia验证</strong>: ADF检验确认价格偏离均值 2.3σ，均值回归概率 78%。'
  },
  {
    code: '000858.SZ', name: '五粮液', signal: '关注', signalClass: 'hold',
    position: '8%', holdPeriod: '中线 (2-3周)', entry: '138.20',
    entryRange: '136.50 - 139.50', stopLoss: '128.40',
    takeProfit: '152.00 (161.8% 延伸)', atr: '4.1',
    framework: '谐波看涨螃蟹形态 + 质量因子驱动 + EV=+2.4%',
    rationale: '<strong>谐波形态</strong>: 周线完成看涨螃蟹形态，PRZ 与 61.8% 回撤位高度重合。<br><strong>因子排名</strong>: 质量因子排名前 8%，但动量因子中性，建议小仓位试探。<br><strong>待确认</strong>: 等待日线突破 140 压力位确认加仓信号。'
  }
];

const POSITION_DEFS = [
  { secid: '1.600036', code: '600036.SH', name: '招商银行', entryPrice: 38.75,
    entryDate: '2026-05-12', stopLoss: 36.80, status: 'holding', statusText: '持仓中',
    action: '持有', actionClass: 'hold', daysHeldBase: '2026-05-12',
    expectedRemain: '2-3周', atr: '0.85',
    advice: '沿5日均线稳步上行，谐波形态目标位 43.20 不变。维持当前仓位，止损上移至 38.10。' },
  { secid: '1.601899', code: '601899.SH', name: '紫金矿业', entryPrice: 17.62,
    entryDate: '2026-05-08', stopLoss: 17.80, status: 'add', statusText: '加仓信号',
    action: '加仓 5%', actionClass: 'buy', daysHeldBase: '2026-05-08',
    expectedRemain: '1-2周', atr: '0.42',
    advice: '突破前高 18.70 确认上行趋势延续，因子模型动量增强(+2.4σ)。建议在 18.80-19.00 区间加仓 5%，总仓位增至 15%。' },
  { secid: '0.002415', code: '002415.SZ', name: '海康威视', entryPrice: 32.40,
    entryDate: '2026-05-05', stopLoss: 31.20, status: 'holding', statusText: '持仓中',
    action: '持有', actionClass: 'hold', daysHeldBase: '2026-05-05',
    expectedRemain: '1-3周', atr: '0.78',
    advice: '价格在 PRZ 支撑区 32.50-33.00 上方整固。成交量温和放大，谐波结构完好。继续持有。' },
  { secid: '0.300014', code: '300014.SZ', name: '亿纬锂能', entryPrice: 58.20,
    entryDate: '2026-04-28', stopLoss: 54.50, status: 'reduce', statusText: '减仓信号',
    action: '减仓 50%', actionClass: 'sell', daysHeldBase: '2026-04-28',
    expectedRemain: '观察中', atr: '1.62',
    advice: '跌破谐波形态 61.8% 斐波那契支撑 57.00，短线动能转弱。建议减仓 50% 锁定部分风险，剩余仓位止损设 54.50。待价格回到 58.00 上方再考虑回补。' }
];

const FALLBACK_HISTORY = [
  { date: '2026-05-02', code: '300308.SZ', name: '中际旭创', entry: '115.20', exit: '128.40', pnl: '+11.46%', outcome: 'win', result: '止盈触发', days: 12, framework: '谐波蝴蝶 + 动量因子' },
  { date: '2026-04-22', code: '688981.SH', name: '中芯国际', entry: '68.50', exit: '72.10', pnl: '+5.26%', outcome: 'win', result: '止盈触发', days: 9, framework: '谐波螃蟹 + 均值回归' },
  { date: '2026-04-18', code: '601318.SH', name: '中国平安', entry: '48.90', exit: '45.30', pnl: '-7.36%', outcome: 'loss', result: '止损触发', days: 15, framework: '谐波加特利 + 质量因子' },
  { date: '2026-04-18', code: '600809.SH', name: '山西汾酒', entry: '186.00', exit: '202.50', pnl: '+8.87%', outcome: 'win', result: '止盈触发', days: 8, framework: '谐波蝙蝠 + 情绪因子' },
  { date: '2026-04-15', code: '002230.SZ', name: '科大讯飞', entry: '42.80', exit: '41.20', pnl: '-3.74%', outcome: 'loss', result: '止损触发', days: 11, framework: '谐波螃蟹 + AI因子' },
  { date: '2026-04-10', code: '600276.SH', name: '恒瑞医药', entry: '35.60', exit: '39.15', pnl: '+9.97%', outcome: 'win', result: '止盈触发', days: 14, framework: '谐波鲨鱼 + 价值因子' }
];

// Index definitions with secid mapping
const INDEX_DEFS = [
  { secid: '1.000001', name: '上证综指', fbIdx: 0 },
  { secid: '0.399001', name: '深证成指', fbIdx: 1 },
  { secid: '1.000300', name: '沪深300', fbIdx: 2 },
  { secid: '0.399006', name: '创业板指', fbIdx: 3 },
  { secid: '100.HSI',  name: '恒生指数', fbIdx: 4 },
  { secid: 'intl_N225',  name: '日经225',  fbIdx: 5, intl: true },
  { secid: 'intl_SPX',   name: 'S&P 500',  fbIdx: 6, intl: true },
  { secid: 'intl_IXIC',  name: '纳斯达克', fbIdx: 7, intl: true },
  { secid: 'intl_FTSE',  name: 'FTSE 100', fbIdx: 8, intl: true },
  { secid: 'intl_GDAXI', name: 'DAX',      fbIdx: 9, intl: true }
];

// ---- User Position Constants ----
const UP_STORAGE_KEY = 'user_positions';
const UP_MAX_SLOTS = 10;
const UP_VISIBLE_DEFAULT = 3;

// ---- Backtest Constants ----
const BT_STORAGE_KEY_RESULTS = 'harmonious_backtest_results';
const BT_STORAGE_KEY_FACTOR = 'harmonious_correction_factor';
const BT_STORAGE_KEY_ENABLED = 'harmonious_correction_enabled';
