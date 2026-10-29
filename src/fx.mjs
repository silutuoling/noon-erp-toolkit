/**
 * fx.mjs —— 多币种换算（AED / SAR / EGP / USD / CNY）
 *
 * 汇率模型：所有币种都存「1 单位该币 = 多少人民币」，换算是两边过桥：
 *    amountInTo = amount × rate[from] / rate[to]
 *
 * 🔴 为什么 AED 和 SAR 要走锚定反算：
 *    这两个币钉住美元（1 USD = 3.6725 AED = 3.75 SAR），是固定汇率。
 *    各家数据源给的 AED 数值常带 2–3 位小数误差，直接取会让人民币成本差 0.5%。
 *    正确做法是只取 USD/CNY，再用锚定比例推 AED / SAR —— 比直接取源值更稳。
 *
 * 汇率是实时变动的，本模块**不内置汇率快照**，只提供算法。
 * 调用方自己传 rates（例如从你的数据源拉 USD/CNY 后按锚定推导）。
 *
 * 在线版（实时汇率，带折算对比）：https://noonmate.com/tool/fx
 */

/** 钉住美元的固定汇率：1 USD = ? 本币 */
export const USD_PEG = { AED: 3.6725, SAR: 3.75 }

export const CURRENCIES = ['CNY', 'USD', 'AED', 'SAR', 'EGP']

/**
 * 由「1 USD = ? CNY」推导出 AED / SAR 的汇率。
 * 例：usdCny = 6.6893 → AED = 6.6893 / 3.6725 = 1.8215
 * @param {number} usdCny
 * @returns {Record<string, number>} 可并入 rates 使用
 */
export function pegRates(usdCny) {
  if (!(usdCny > 0)) return {}
  const out = { USD: usdCny }
  for (const [code, peg] of Object.entries(USD_PEG)) out[code] = usdCny / peg
  return out
}

/**
 * 换算。
 * @param {Record<string, number>} rates 各币种「1 单位 = ? CNY」，必须含 from 和 to
 * @param {number} amount
 * @param {string} from 源币种
 * @param {string} to 目标币种
 * @returns {number}
 */
export function convert(rates, amount, from, to) {
  if (from === to) return amount
  const rf = rates[from]
  const rt = rates[to]
  if (!(rf > 0) || !(rt > 0)) throw new Error(`缺少汇率：${!rf ? from : to}`)
  return (amount * rf) / rt
}

/**
 * 一次换算到所有币种，方便做对比表。
 * @returns {Array<{code:string, value:number}>}
 */
export function convertAll(rates, amount, from) {
  return CURRENCIES.filter((c) => c !== from && rates[c] > 0).map((c) => ({
    code: c,
    value: convert(rates, amount, from, c),
  }))
}

/**
 * 校验一组汇率是否自洽（AED / SAR 是否与 USD 锚定吻合）。
 * 用于发现数据源给的锚定币数值有偏差。
 * @returns {{ok:boolean, drift:Record<string, number>}} drift 为相对误差（%）
 */
export function checkPeg(rates, tolerancePct = 0.05) {
  const drift = {}
  let ok = true
  if (!(rates.USD > 0)) return { ok: false, drift: { USD: NaN } }
  for (const [code, peg] of Object.entries(USD_PEG)) {
    if (!(rates[code] > 0)) continue
    const expected = rates.USD / peg
    const d = ((rates[code] - expected) / expected) * 100
    drift[code] = Number(d.toFixed(3))
    if (Math.abs(d) > tolerancePct) ok = false
  }
  return { ok, drift }
}
