/**
 * profit.mjs —— Noon 单件净利测算（本地备货 FBN/FBP 与 NGS 直发两套）
 *
 * ============================ 两条链路，两套算法 ============================
 * ① 本地备货（FBN 入仓 / FBP 自发货）
 *    你已经把货发到当地，拿站点本币的销售额，扣掉 Noon 各项费用。
 *    佣金与广告都按**不含税价**算，VAT 只是代收代缴，不是你的收入。
 *
 * ② NGS 直发（Transfer Price 全额回款）
 *    按 Transfer Price 结算，USD 回款。没有佣金、没有 VAT，
 *    但卖了才回款，退货就等于这一单的钱全没（可售会转当地 FBN 另算）。
 *
 * 🔴 一个反直觉点：本地备货的 VAT 要从售价里**除**掉，不是乘。
 *    含税 105 AED、VAT 5% ⇒ 你的收入是 100，不是 105 − 5.25。
 *    这一步算错，佣金基数、广告占比、利润率全跟着错。
 *
 * 🔴 退货不是「全损」，是按折损率算。
 *    退回的商品通常还能二次销售，本地备货按五折（0.5）折损估。
 *
 * 在线版（含费用拆分条与保本价反算）：https://noonmate.com/tool/profit
 */

import { readFileSync } from 'node:fs'

const MARKETS = JSON.parse(
  readFileSync(new URL('../data/markets.json', import.meta.url), 'utf8')
).markets

/** 退货商品按五折处理（本地备货口径） */
export const RETURN_LOSS_RATE = 0.5

/**
 * FBN 出库费的常见值（AE/SA 小标准件约 9，埃及约 25）。
 * 🔴 只是「没填时的占位」，真实值按尺寸档 + 重量档查 ../data/fbn-outbound.json
 */
export const FBN_SAMPLE = { ae: 9, sa: 9, eg: 25 }

/**
 * 本地备货单件净利。
 *
 * @param {object} p
 * @param {number} p.price 含税售价（本币）
 * @param {number} p.vatPct 站点 VAT（%）
 * @param {number} p.commissionPct 佣金率（%）
 * @param {number} p.fulfillLocal 履约费（本币）：FBN 出库费或 FBP 运费
 * @param {number} [p.adPct] 广告费占不含税售价（%）
 * @param {number} [p.returnRatePct] 退货率（%）
 * @param {number} [p.returnLossRate] 退货折损率，默认 0.5
 * @param {number} [p.otherLocal] 其它费用（本币）
 * @param {number} p.costCny 采购成本（CNY）
 * @param {number} [p.freightCny] 头程分摊（CNY）
 * @param {number} p.fx 汇率（1 本币 = ? CNY）
 * @returns {{pev:number, revenueCny:number, comm:number, fulfill:number, ad:number, returnLoss:number, other:number, vatAmount:number, netLocal:number, netCny:number, marginPct:number, roiPct:number, breakEvenPrice:number}}
 */
export function localProfit({
  price,
  vatPct,
  commissionPct,
  fulfillLocal,
  adPct = 0,
  returnRatePct = 0,
  returnLossRate = RETURN_LOSS_RATE,
  otherLocal = 0,
  costCny = 0,
  freightCny = 0,
  fx,
}) {
  const v = vatPct / 100
  const c = commissionPct / 100
  const a = adPct / 100
  const rr = returnRatePct / 100
  const P = price

  const pev = v > -1 ? P / (1 + v) : 0
  const comm = pev * c
  const ad = pev * a
  const returnLoss = pev * rr * returnLossRate
  const other = otherLocal

  const netLocal = pev - comm - fulfillLocal - ad - returnLoss - other
  const costAll = costCny + freightCny
  const netCny = netLocal * fx - costAll

  const revenueCny = pev * fx
  const marginPct = revenueCny > 0 ? (netCny / revenueCny) * 100 : 0
  const roiPct = costAll > 0 ? (netCny / costAll) * 100 : 0

  /* 保本价：令净利 = 0 反解含税售价 */
  const k = 1 - c - a - rr * returnLossRate
  const need = fx > 0 ? costAll / fx + fulfillLocal + other : 0
  const bePev = k > 0 ? need / k : 0

  return {
    pev,
    revenueCny,
    comm,
    fulfill: fulfillLocal,
    ad,
    returnLoss,
    other,
    vatAmount: P - pev,
    netLocal,
    netCny,
    marginPct,
    roiPct,
    breakEvenPrice: bePev * (1 + v),
  }
}

/**
 * NGS 直发单件净利（Transfer Price 口径，USD 回款）。
 *
 * @param {object} p
 * @param {number} p.transferPriceUsd Transfer Price（USD）
 * @param {number} [p.adUsd] 广告（USD/件）
 * @param {number} [p.otherUsd] 其它 USD 支出
 * @param {number} [p.returnRatePct] 退货率（%），退货即拿不到这一单 TP
 * @param {number} p.costCny 采购成本（CNY）
 * @param {number} [p.freightCny] 头程（CNY）
 * @param {number} p.usdCny USD/CNY
 * @returns {{netUsd:number, netCny:number, marginPct:number, roiPct:number, breakEvenTp:number}}
 */
export function ngsProfit({
  transferPriceUsd,
  adUsd = 0,
  otherUsd = 0,
  returnRatePct = 0,
  costCny = 0,
  freightCny = 0,
  usdCny,
}) {
  const rr = returnRatePct / 100
  const tp = transferPriceUsd
  const retLoss = tp * rr
  const netUsd = tp - retLoss - adUsd - otherUsd
  const costAll = costCny + freightCny
  const netCny = netUsd * usdCny - costAll

  const grossCny = tp * usdCny
  const marginPct = grossCny > 0 ? (netCny / grossCny) * 100 : 0
  const roiPct = costAll > 0 ? (netCny / costAll) * 100 : 0

  const breakEvenTp = usdCny > 0 && rr < 1 ? (costAll / usdCny + adUsd + otherUsd) / (1 - rr) : 0

  return { netUsd, netCny, marginPct, roiPct, breakEvenTp }
}

/** 各站点标准 VAT，方便直接取用 */
export const VAT_OF = { ae: MARKETS.ae.vat, sa: MARKETS.sa.vat, eg: MARKETS.eg.vat }
