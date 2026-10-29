/**
 * pricing.mjs —— 按目标加价率反推售价
 *
 * 🔴 「加价率」和「毛利率」不是一个东西，混淆是跨境定价最常见的错。
 *    同一个 50%：
 *      加价率 50% ⇒ 售价 = 成本 × 1.50（赚了成本的 50%）
 *      毛利率 50% ⇒ 售价 = 成本 ÷ 0.50 = 成本 × 2.00（赚了售价的 50%）
 *    差一倍。谈价时说「我要 50 个点」，两边理解的可能是不同数。
 *
 * 本模块用的是**加价率**：售价 ÷ 成本 − 1。
 *
 * 反推逻辑（本地备货）：
 *   不含税售价 pev 要满足两件事 —— 覆盖成本、并且赚到 (1+加价率) 倍：
 *     pev × (1 − 佣金率) = (1 + 加价率) × (采购成本 + 履约费)
 *   ⇒ pev = (1 + 加价率) × (采购成本 + 履约费) ÷ (1 − 佣金率)
 *   ⇒ 含税售价 = pev × (1 + VAT 率)
 *
 * 加价率是「相对总成本」的，不只相对采购价 —— 履约费也要被加价覆盖，
 * 否则运费越高你越亏。
 *
 * 在线版（含四档加价率对照表）：https://noonmate.com/tool/pricing
 */

/**
 * 本地备货（FBN / FBP）反推含税售价。
 *
 * @param {object} p
 * @param {number} p.markupPct 目标加价率（%，50 表示 50%）
 * @param {number} p.costCny 单件采购成本（CNY）
 * @param {number} [p.freightCny] 单件头程分摊（CNY）
 * @param {number} p.fx 站点币种汇率（1 本币 = ? CNY）
 * @param {number} p.commissionPct 佣金率（%）
 * @param {number} [p.fulfillLocal] 履约费（本币，FBN 出库费或 FBP 运费）
 * @param {number} [p.vatPct] 站点 VAT 率（%）
 * @returns {{pev:number, price:number, netLocal:number, netCny:number, baseLocal:number, ok:boolean}}
 *   pev = 不含税价，price = 挂出去的含税价
 */
export function priceFromMarkup({
  markupPct,
  costCny = 0,
  freightCny = 0,
  fx,
  commissionPct,
  fulfillLocal = 0,
  vatPct = 0,
}) {
  const mu = markupPct / 100
  const c = commissionPct / 100
  const v = vatPct / 100
  const costAll = costCny + freightCny
  const costLocal = fx > 0 ? costAll / fx : 0
  const baseLocal = fulfillLocal + costLocal

  const ok = 1 - c > 0 && fx > 0 && costAll > 0
  const pev = ok ? ((1 + mu) * baseLocal) / (1 - c) : 0
  const price = pev * (1 + v)
  const netLocal = pev * (1 - c) - baseLocal

  return { pev, price, netLocal, netCny: netLocal * fx, baseLocal, ok }
}

/**
 * NGS 直发（Transfer Price，USD 全额回款）反推。
 * 退货会拿不到这一单的 TP，所以要用 (1 − 退货率) 兜住。
 *
 * @param {object} p
 * @param {number} p.markupPct 目标加价率（%）
 * @param {number} p.costCny 采购成本（CNY）
 * @param {number} [p.freightCny] 头程（CNY）
 * @param {number} p.usdCny USD/CNY
 * @param {number} [p.adUsd] 广告（USD/件）
 * @param {number} [p.otherUsd] 其它 USD 支出
 * @param {number} [p.returnRatePct] 退货率（%）
 * @returns {{tp:number, netUsd:number, netCny:number, ok:boolean}}
 */
export function transferPriceFromMarkup({
  markupPct,
  costCny = 0,
  freightCny = 0,
  usdCny,
  adUsd = 0,
  otherUsd = 0,
  returnRatePct = 0,
}) {
  const mu = markupPct / 100
  const rr = returnRatePct / 100
  const costAll = costCny + freightCny
  const costUsd = usdCny > 0 ? costAll / usdCny : 0

  const ok = 1 - rr > 0 && usdCny > 0 && costAll > 0
  const tp = ok ? ((costUsd + adUsd + otherUsd) * (1 + mu)) / (1 - rr) : 0
  const retLoss = tp * rr
  const netUsd = tp - retLoss - adUsd - otherUsd
  const netCny = netUsd * usdCny - costAll

  return { tp, netUsd, netCny, ok }
}

/**
 * 加价率 ↔ 毛利率 互转。用来对齐别人报的「点数」到底是哪个口径。
 * @param {number} markupPct 加价率（%）
 * @returns {number} 等效毛利率（%）＝ 净利 ÷ 售价
 */
export function markupToMargin(markupPct) {
  const mu = markupPct / 100
  return mu / (1 + mu) * 100
}

/** 毛利率 → 加价率 */
export function marginToMarkup(marginPct) {
  const m = marginPct / 100
  return m < 1 ? (m / (1 - m)) * 100 : Infinity
}

/** 报价倍率 = 售价 ÷ 采购成本。加价率口径下常见 1.5–3 倍，≥5 倍要复核 */
export function priceMultiple(price, costLocal) {
  return costLocal > 0 && price > 0 ? price / costLocal : 0
}
