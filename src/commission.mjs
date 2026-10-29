/**
 * commission.mjs —— Noon 佣金与 FBN 出库费
 *
 * 这个文件解决一个很具体的坑：
 *   Noon 的佣金费率是「边际阶梯」，不是整单单价。
 *   官方原文：N% for the portion of the total sales price up to X,
 *            M% for any portion greater than X
 *   ⇒ 珠宝卖 8,000 AED = 5,000×10% + 3,000×5% = 650
 *     不是 8,000×5% = 400
 *
 *   市面上一堆计算器直接拿「一个百分比 × 售价」，在这里会全线算错。
 *   本模块按官方口径逐档累加。
 *
 * 数据来自同目录 ../data/referral-fees.json 与 ../data/fbn-outbound.json
 * 所有数字整理自 Noon 卖家帮助中心的公开服务附件，以官方页面为准。
 * 在线版（带完整界面与算例）：https://noonmate.com/tool/commission
 */

import { readFileSync } from 'node:fs'

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'))

const REFERRAL_DATA = load('referral-fees.json')
const OUTBOUND_DATA = load('fbn-outbound.json')
const MARKETS_DATA = load('markets.json')

/** 站点：ae 阿联酋 / sa 沙特 / eg 埃及 */
export const MARKETS = MARKETS_DATA.markets

/** 佣金费率行：[{ id, family, label, rates: { ae: [{upto, rate}], ... }, note }] */
export const REFERRAL = REFERRAL_DATA.rows

/** FBN 出库费：[market] → { aspSplit, rows } */
export const FBN_OUTBOUND = OUTBOUND_DATA.outbound

/**
 * 按 id 取某站点某类目的费率阶梯。
 * @param {string} id 类目 id，如 'apparel'
 * @param {'ae'|'sa'|'eg'} market
 * @returns {Array<{upto: number|null, rate: number}>|undefined}
 */
export function findTiers(id, market) {
  const row = REFERRAL.find((r) => r.id === id)
  return row?.rates?.[market]
}

/**
 * 佣金试算：按官方「边际阶梯」逐档累加，再套最低费。
 *
 * @param {number} price 售价（站点本币）
 * @param {Array<{upto: number|null, rate: number}>} tiers 阶梯
 * @param {number} [minReferral] 站点最低佣金，埃及官方未写按 0
 * @returns {number} 佣金金额（不含 VAT）
 *
 * @example
 *   const tiers = findTiers('jewelry', 'ae')   // [{upto:5000,rate:10},{upto:null,rate:5}]
 *   referralFee(8000, tiers, 1)                // 650
 */
export function referralFee(price, tiers, minReferral = 0) {
  if (!tiers || tiers.length === 0 || !(price > 0)) return 0
  let fee = 0
  let prev = 0
  for (const t of tiers) {
    const cap = t.upto == null ? price : Math.min(price, t.upto)
    if (cap > prev) fee += ((cap - prev) * t.rate) / 100
    if (t.upto == null || price <= t.upto) break
    prev = t.upto
  }
  return Math.max(fee, minReferral)
}

/**
 * 有效费率（fee ÷ 售价 × 100）。跨站点对比时看「实际扣了几个点」。
 * 阶梯费率下这个值一定小于最高档费率。
 */
export function effectiveRate(price, fee) {
  return price > 0 ? (fee / price) * 100 : 0
}

/** 把阶梯写成一句话：如「前 5,000 AED 10%，超出部分 5%」 */
export function tierText(tiers, currency) {
  if (!tiers || tiers.length === 0) return '—'
  if (tiers.length === 1) return `${tiers[0].rate}%`
  const parts = []
  let prev = 0
  for (const t of tiers) {
    if (t.upto == null) {
      parts.push(`超出 ${fmt(prev)} ${currency} 部分 ${t.rate}%`)
      break
    }
    parts.push(
      prev === 0
        ? `前 ${fmt(t.upto)} ${currency} ${t.rate}%`
        : `${fmt(prev)}–${fmt(t.upto)} ${currency} ${t.rate}%`
    )
    prev = t.upto
  }
  return parts.join('，')
}

/**
 * FBN 出库费：给定尺寸档 + 重量 + 售价档，返回单件费用。
 *
 * 🔴 三个容易搞错的点：
 *   1. AE / SA 按售价分两档（ASP ≤ 25 / > 25），埃及只有单一价
 *   2. 某些档位超重后是「每多 1kg 加 N」，不是直接跳到下一个档。
 *      比如 ≤3kg 之后每加 1kg 加 1，8kg 要走累加，不能误取下一个固定档的价
 *   3. 每个尺寸档有自己的最大适用范围（标准包裹到 12kg，超大包裹到 30kg）。
 *      超过范围时本函数按最后一档 + perKg 封顶返回，**不会返回 null** ——
 *      所以调用前请自己确认「这个尺寸档真的能寄这么重」，别拿标准包裹问 28kg。
 *
 * @param {'ae'|'sa'|'eg'} market
 * @param {string} size 尺寸档，如 '标准包裹'
 * @param {number} weightKg 计费重 kg
 * @param {boolean} aspOver25 售价是否超过 25（仅 AE/SA 有效）
 * @returns {number|null} 单件费用（站点本币，不含 VAT），无匹配档返回 null
 */
export function outboundFee(market, size, weightKg, aspOver25) {
  const conf = FBN_OUTBOUND[market]
  if (!conf) return null
  const rows = conf.rows.filter((r) => r.size === size)
  if (rows.length === 0 || !(weightKg > 0)) return null

  const pick = (r) => (conf.aspSplit ? (aspOver25 ? (r.b ?? r.a) : r.a) : r.a)

  const flat = rows.find((r) => r.maxKg == null)
  if (flat) return pick(flat)

  const sorted = [...rows].sort((x, y) => (x.maxKg ?? 0) - (y.maxKg ?? 0))

  for (const r of sorted) {
    if (
      r.perKg != null &&
      r.maxKg != null &&
      r.perKgTill != null &&
      weightKg > r.maxKg &&
      weightKg <= r.perKgTill
    ) {
      return pick(r) + (weightKg - r.maxKg) * r.perKg
    }
  }

  for (const r of sorted) {
    if (weightKg <= (r.maxKg ?? 0)) return pick(r)
  }

  const last = sorted[sorted.length - 1]
  if (!last) return null
  const base = pick(last)
  if (last.perKg && last.maxKg != null) {
    const ceil = last.perKgTill ?? weightKg
    const kg = Math.max(0, Math.min(weightKg, ceil) - last.maxKg)
    return base + kg * last.perKg
  }
  return base
}

function fmt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
