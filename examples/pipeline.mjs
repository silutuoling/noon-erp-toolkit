/**
 * pipeline.mjs —— 用这些模块串一条「上架前决策链」
 *
 * 这是 Noon ERP 里最核心的一段逻辑：
 *   一个从 1688 采来的商品，到底能不能做、卖多少钱、上架会被卡在哪。
 *
 * 七个环节，每个环节对应一个模块：
 *   ① 编码结构   → hs-code.mjs        码不对，后面税率全错
 *   ② 到岸成本   → freight.mjs        整批运费摊到单件
 *   ③ 平台费用   → commission.mjs     佣金阶梯 + FBN 出库费
 *   ④ 定价       → pricing.mjs        按目标加价率反推
 *   ⑤ 净利       → profit.mjs         真实到手多少
 *   ⑥ 汇率       → fx.mjs             美元锚定反推 AED/SAR
 *   ⑦ 上架闸门   → title-check / banned-words / sku-matrix
 *
 * 运行：node examples/pipeline.mjs
 */

import {
  hsCode, freight, commission, pricing, profit, fx,
  volumetric, titleCheck, bannedWords, skuMatrix,
} from '../src/index.mjs'

const money = (n, d = 2) => n.toFixed(d)
const line = (t) => console.log(`\n${t}\n${'─'.repeat(58)}`)

/* ============================================================
 * 场景：1688 采一款蓝牙耳机，走 FBN 发阿联酋
 * ============================================================ */
const ITEM = {
  name: 'Wireless Bluetooth Earbuds with Charging Case, 30H Playtime, IPX5 Waterproof',
  costCny: 45,          // 单件采购价
  batchQty: 500,        // 一批 500 件
  batchFreight: 9000,   // 整批头程运费（CNY）
  batchWeight: 200,     // 整批重量 200kg
  batchValue: 22500,    // 整批货值
  unitWeight: 0.35,     // 单件重 kg
  box: { length: 12, width: 10, height: 4 }, // 单件包装 cm
  hsCodeRaw: '8518.30.00.1000',
  market: 'ae',
  commissionId: 'headphones',
  targetPrice: 120,     // 打算卖 120 AED
  adPct: 5,
  returnRatePct: 8,
}

console.log('场景：1688 蓝牙耳机 · 500 件 · 发阿联酋（FBN）')

/* ---------------------------------------------------- ① 编码结构 */
line('① 编码结构 — 码不对，税率全错')
const hs = hsCode.parseHsCode(ITEM.hsCodeRaw, ITEM.market)
console.log(`  ${ITEM.hsCodeRaw} → ${hs.title}（章 ${hs.chapter?.ch} ${hs.chapter?.cn}）`)
if (hs.status !== 'ok') {
  console.log(`  ⚠ ${hs.detail}`)
  console.log('  ⚠ 结构不合规，下面用默认税率估算，实际报关前必须补全')
}

/* ---------------------------------------------------- ② 到岸成本 */
line('② 到岸成本 — 整批运费摊到单件')
const fr = freight.compareBases({
  freight: ITEM.batchFreight,
  totalQty: ITEM.batchQty,
  totalWeight: ITEM.batchWeight,
  totalValue: ITEM.batchValue,
  unitWeight: ITEM.unitWeight,
  unitCost: ITEM.costCny,
  basis: 'weight',
})
console.log(`  按件 ${money(fr.qty.picked)} / 按重 ${money(fr.weight.picked)} / 按值 ${money(fr.value.picked)} CNY 每件`)
console.log(`  三种摊法极差 ${money(fr.spread, 0)}% —— 耳机是轻抛货，选按重摊更公平`)
const landedCny = ITEM.costCny + fr.weight.picked
console.log(`  到岸成本 = ${ITEM.costCny} + ${money(fr.weight.picked)} = ${money(landedCny)} CNY`)

/* ---------------------------------------------------- ③ 汇率 */
line('③ 汇率 — AED 走美元锚定')
const rates = { CNY: 1, USD: 6.6893, EGP: 0.123, ...fx.pegRates(6.6893) }
const aed = rates[commission.MARKETS[ITEM.market].currency]
const landedLocal = landedCny / aed
console.log(`  USD 6.6893 → AED ${money(aed, 4)}（锚定反推，不用源值）`)
console.log(`  到岸成本 ${money(landedCny)} CNY = ${money(landedLocal)} AED`)

/* ---------------------------------------------------- ④ 平台费用 */
line('④ 平台费用 — 佣金阶梯 + FBN 出库费')
const vol = volumetric.chargeableWeight({
  ...ITEM.box, actual: ITEM.unitWeight, divisor: 5000,
})
console.log(`  包装 ${ITEM.box.length}×${ITEM.box.width}×${ITEM.box.height}cm → 体积重 ${money(vol.volumetric)}kg，计费重 ${money(vol.billable)}kg`)

const tiers = commission.findTiers(ITEM.commissionId, ITEM.market)
const vatPct = profit.VAT_OF[ITEM.market]
const pev = ITEM.targetPrice / (1 + vatPct / 100)
const fee = commission.referralFee(pev, tiers, 1)
console.log(`  ${ITEM.commissionId} 阶梯：${commission.tierText(tiers, 'AED')}，佣金按不含税价算`)
console.log(`  售价 ${ITEM.targetPrice} AED → 不含税 ${money(pev)} → 佣金 ${money(fee)} AED（有效费率 ${money(commission.effectiveRate(pev, fee), 1)}%）`)

const outFee = commission.outboundFee(ITEM.market, '标准包裹', vol.billable, ITEM.targetPrice > 25)
console.log(`  标准包裹 ${money(vol.billable)}kg，ASP ${ITEM.targetPrice > 25 ? '> 25' : '≤ 25'} → FBN 出库费 ${outFee} AED`)

/* ---------------------------------------------------- ⑤ 净利 */
line('⑤ 净利 — 到手多少')
const pf = profit.localProfit({
  price: ITEM.targetPrice,
  vatPct,
  commissionPct: (commission.effectiveRate(pev, fee)),
  fulfillLocal: outFee,
  adPct: ITEM.adPct,
  returnRatePct: ITEM.returnRatePct,
  costCny: ITEM.costCny,
  freightCny: fr.weight.picked,
  fx: aed,
})
console.log(`  不含税收入 ${money(pf.pev)} − 佣金 ${money(pf.comm)} − 履约 ${money(pf.fulfill)} − 广告 ${money(pf.ad)} − 退货折损 ${money(pf.returnLoss)}`)
console.log(`  = 单件净利 ${money(pf.netLocal)} AED ≈ ${money(pf.netCny)} CNY`)
console.log(`  毛利率 ${money(pf.marginPct, 1)}% · 投入回报 ${money(pf.roiPct, 1)}% · 保本价 ${money(pf.breakEvenPrice)} AED`)

/* ---------------------------------------------------- ⑥ 反推定价 */
line('⑥ 反推定价 — 两种口径，别混用')
/*
 * 🔴 反推定价工具只扣佣金与履约费，不含广告与退货折损。
 *    拿它算出的价直接上架，扣完广告退货后加价率会明显低一截。
 *    要得到「扣完所有费用后仍有 N% 加价」的价，把广告与退货并入分母：
 *      pev = base × (1 + 加价率) ÷ (1 − 佣金 − 广告 − 退货率×折损率)
 *    base = 到岸成本 + 履约费
 */
const cRate = commission.effectiveRate(pev, fee) / 100
const adRate = ITEM.adPct / 100
const rrRate = ITEM.returnRatePct / 100
const D = 1 - cRate - adRate - rrRate * 0.5
const base = landedLocal + outFee

console.log(`  base = 到岸 ${money(landedLocal)} + 履约 ${money(outFee)} = ${money(base)} AED`)
console.log(`  扣减系数 D = 1 − 佣金 ${money(cRate * 100, 0)}% − 广告 ${ITEM.adPct}% − 退货 ${money(rrRate * 50, 1)}% = ${money(D, 2)}`)
console.log('\n  目标加价率   工具口径（只含佣金履约）   含广告与退货（真实）')
for (const mu of [30, 50, 80]) {
  const pr = pricing.priceFromMarkup({
    markupPct: mu, costCny: ITEM.costCny, freightCny: fr.weight.picked,
    fx: aed, commissionPct: commission.effectiveRate(pev, fee),
    fulfillLocal: outFee, vatPct,
  })
  const truePrice = (base * (1 + mu / 100) / D) * (1 + vatPct / 100)
  console.log(
    `  ${String(mu).padStart(9)}%   ${money(pr.price).padStart(18)} AED   ${money(truePrice).padStart(15)} AED`
  )
}
console.log('  差的那一截就是广告与退货折损，不能让定价工具替你吞掉。')

const trueNetLocal = pf.netLocal - landedLocal
const impliedMarkup = (trueNetLocal / base) * 100
console.log(`\n  反过来说：卖 ${ITEM.targetPrice} AED，扣完全部费用后净利 ${money(trueNetLocal)} AED`)
console.log(`  相当于真实加价率 ${money(impliedMarkup, 1)}%（等效毛利率 ${money(trueNetLocal / pf.pev * 100, 1)}%）`)

/* ---------------------------------------------------- ⑦ 上架闸门 */
line('⑦ 上架闸门 — 上架前会被卡在哪')
const t = titleCheck.checkTitle(ITEM.name)
console.log(`  标题 ${t.score} 分（${t.grade}）${t.issues.length ? '：' + t.issues.map((i) => i.title).join('；') : ''}`)

const bw = bannedWords.scan(ITEM.name)
console.log(`  违禁词 ${bw.length ? bw.map((h) => h.word).join(' / ') : '未命中'}`)

const sku = skuMatrix.buildMatrix({
  dim1: 'Black,White', dim2: '', prefix: 'EP', sep: '-', letterCase: 'upper', maxLen: 16,
})
console.log(`  SKU 矩阵 ${sku.total} 个${sku.bad ? `，${sku.bad} 个有问题` : '，全部合规'}：${sku.rows.map((r) => r.sku).join(' / ')}`)

/* ---------------------------------------------------- 结论 */
line('结论')
const okHs = hs.status === 'ok'
const okTitle = t.score >= 85
const okBanned = bw.length === 0
const okSku = sku.bad === 0
const okProfit = pf.marginPct >= 15
const mark = (b) => (b ? '✓' : '✗')
console.log(`  ${mark(okHs)} 编码结构   ${mark(okTitle)} 标题规范   ${mark(okBanned)} 无违禁词   ${mark(okSku)} SKU 合规   ${mark(okProfit)} 毛利达标`)
console.log(okHs && okTitle && okBanned && okSku && okProfit
  ? '\n  可以上架。'
  : '\n  有闸门未通过，先修再上。')
console.log(`\n  完整工具链：https://noonmate.com/tool`)
