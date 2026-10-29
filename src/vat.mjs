/**
 * vat.mjs —— VAT 含税价 / 不含税价换算
 *
 * Three markets, three rates: 阿联酋 5% / 沙特 15% / 埃及 14%。
 *
 * 🔴 一个高频错误：VAT 不是「售价 × 税率」减掉就行。
 *    含税价里已经包含了 VAT，反算要用除法：
 *      不含税价 = 含税价 ÷ (1 + 税率)
 *      VAT 金额 = 含税价 − 不含税价
 *    133 AED 含 5% VAT：不含税 = 133 ÷ 1.05 = 126.67，VAT = 6.33
 *    而不是 133 × 5% = 6.65（这样算出来的不含税价是 126.35，错的）
 *
 * 而且 Noon 的佣金是按**不含税价**算的，所以这一步算错，佣金、利润全跟着错。
 *
 * 在线版：https://noonmate.com/tool/vat
 */

import { readFileSync } from 'node:fs'

const MARKETS = JSON.parse(
  readFileSync(new URL('../data/markets.json', import.meta.url), 'utf8')
).markets

/** 各站点标准 VAT 税率（%） */
export const SITE_VAT = {
  ae: MARKETS.ae.vat,
  sa: MARKETS.sa.vat,
  eg: MARKETS.eg.vat,
}

/**
 * 含税价 → 不含税价 + VAT 金额
 * @param {number} inc 含税价
 * @param {number} ratePct 税率（百分数，5 表示 5%）
 * @returns {{inc:number, ex:number, vat:number}}
 */
export function fromInclusive(inc, ratePct) {
  const v = ratePct / 100
  const ex = v > -1 ? inc / (1 + v) : 0
  return { inc, ex, vat: inc - ex }
}

/**
 * 不含税价 → 含税价 + VAT 金额
 * @param {number} ex 不含税价
 * @param {number} ratePct 税率（百分数）
 * @returns {{inc:number, ex:number, vat:number}}
 */
export function fromExclusive(ex, ratePct) {
  const v = ratePct / 100
  const inc = ex * (1 + v)
  return { inc, ex, vat: inc - ex }
}

/**
 * 按站点税率换算。
 * @param {number} amount 金额
 * @param {'ae'|'sa'|'eg'} market
 * @param {'inc2ex'|'ex2inc'} [mode='inc2ex'] inc2ex = 含税转不含税
 */
export function convert(amount, market, mode = 'inc2ex') {
  const rate = SITE_VAT[market]
  if (rate == null) throw new Error(`未知站点：${market}（可选 ae / sa / eg）`)
  return mode === 'inc2ex' ? fromInclusive(amount, rate) : fromExclusive(amount, rate)
}

/** 批量换算：传一段文本（空格、逗号、分号分隔），逐个数返回 */
export function convertBatch(text, market, mode = 'inc2ex') {
  return text
    .split(/[\s,，;；]+/)
    .map((s) => parseFloat(s))
    .filter((n) => Number.isFinite(n))
    .map((n) => ({ input: n, ...convert(n, market, mode) }))
}
