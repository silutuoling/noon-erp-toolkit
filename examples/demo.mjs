/**
 * demo.mjs —— 13 个模块的自检 + 用法演示
 * 运行：node examples/demo.mjs
 *
 * 每个模块都带断言，算错会直接报 FAIL 并以非零码退出。
 * 想改代码后快速确认没算错，跑这个就够。
 */

import { commission, pricing, profit, vat, fx, volumetric, freight, hsCode, importDuty, titleCheck, bannedWords, skuMatrix, barcode, TOOLS } from '../src/index.mjs'

let pass = 0
let fail = 0

const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol
function eq(label, got, want, tol) {
  const ok = typeof want === 'number' && typeof got === 'number' ? near(got, want, tol ?? 0.01) : got === want
  if (ok) { pass++; return }
  fail++
  console.log(`  ✗ FAIL  ${label}\n          期望 ${want}，实际 ${got}`)
}
function section(n, title) {
  console.log(`\n${n} ${title}\n${'-'.repeat(56)}`)
}

/* ---------------------------------------------------- 1. 佣金边际阶梯 */
section('①', '佣金与费率库 · 边际阶梯')
const watches = commission.findTiers('watches', 'ae')
console.log('  手表 AE 阶梯 :', commission.tierText(watches, 'AED'))
eq('8000 AED 手表佣金', commission.referralFee(8000, watches, 1), 900)
eq('8000 有效费率', commission.effectiveRate(8000, 900), 11.25)
eq('服饰 27%', commission.findTiers('apparel', 'ae')[0].rate, 27)
console.log('  卖 8000 若按整单 5% 算只有 400 —— 少算 500 AED')

/* -------------------------------------------------------- 2. 反推定价 */
section('②', '反推定价 · 加价率不是毛利率')
const p = pricing.priceFromMarkup({
  markupPct: 50, costCny: 30, freightCny: 5, fx: 1.82, commissionPct: 27, fulfillLocal: 9, vatPct: 5,
})
console.log(`  成本 35 CNY → 本币 ${(35 / 1.82).toFixed(2)} + 履约 9 = 基数 ${p.baseLocal.toFixed(2)}`)
console.log(`  不含税售价 ${p.pev.toFixed(2)} → 含税 ${p.price.toFixed(2)}，净利 ${p.netLocal.toFixed(2)} 本币`)
eq('加价率 50% 的等效毛利率', pricing.markupToMargin(50), 33.33, 0.01)
eq('毛利率 33.33% 反推加价率', pricing.marginToMarkup(33.33), 50, 0.05)

/* -------------------------------------------------------- 3. 利润测算 */
section('③', '利润测算 · 本地备货')
const lp = profit.localProfit({
  price: 105, vatPct: 5, commissionPct: 27, fulfillLocal: 9,
  adPct: 5, returnRatePct: 8, costCny: 30, freightCny: 5, fx: 1.82,
})
console.log(`  含税 105（VAT 5%）→ 不含税收入 ${lp.pev.toFixed(2)}（VAT 是按除法从售价里剥出来的）`)
eq('不含税收入', lp.pev, 100)
eq('VAT 金额', lp.vatAmount, 5)
console.log(`  佣金 ${lp.comm.toFixed(2)} 履约 ${lp.fulfill} 广告 ${lp.ad.toFixed(2)} 退货折损 ${lp.returnLoss.toFixed(2)}`)
console.log(`  净利 ${lp.netCny.toFixed(2)} CNY（毛利 ${lp.marginPct.toFixed(1)}%）保本价 ${lp.breakEvenPrice.toFixed(2)}`)

/* -------------------------------------------------------- 4. VAT 反算 */
section('④', 'VAT 反算 · 要除不要乘')
const v1 = vat.fromInclusive(133, 5)
console.log(`  133 AED 含 5% VAT → 不含税 ${v1.ex.toFixed(2)}，VAT ${v1.vat.toFixed(2)}`)
eq('133 含税反算不含税', v1.ex, 126.67, 0.01)
eq('误用乘法的结果', 133 - 133 * 0.05, 126.35, 0.01)
console.log('  两种算法差 0.32 —— 佣金按错的基数算，利润表全错')

/* -------------------------------------------------------- 5. 汇率换算 */
section('⑤', '汇率换算 · AED/SAR 走美元锚定')
const rates = { CNY: 1, EGP: 0.123, ...fx.pegRates(6.6893) }
console.log(`  USD 6.6893 → AED ${rates.AED.toFixed(4)} / SAR ${rates.SAR.toFixed(4)}`)
eq('锚定推算 AED', rates.AED, 1.8215, 0.001)
eq('锚定推算 SAR', rates.SAR, 1.7838, 0.001)
eq('100 AED 换 CNY', fx.convert(rates, 100, 'AED', 'CNY'), 182.15, 0.01)
const pegChk = fx.checkPeg(rates)
console.log(`  锚定自洽检查: ${pegChk.ok ? '通过' : '偏差超限'} ${JSON.stringify(pegChk.drift)}`)

/* ---------------------------------------------------- 6. 体积重换算 */
section('⑥', '体积重 · 计费重取大')
const box = volumetric.chargeableWeight({ length: 40, width: 30, height: 25, actual: 3 })
console.log(`  40×30×25cm 实重 3kg → 体积重 ${box.volumetric.toFixed(2)}kg，计费重 ${box.billable.toFixed(2)}kg`)
eq('体积重', box.volumetric, 6)
eq('按体积重计费', box.byVolume, true)
eq('装填率', volumetric.fillRate(3, 6), 0.5)

/* -------------------------------------------------------- 7. 头程分摊 */
section('⑦', '头程分摊 · 三种摊法')
const fr = freight.compareBases({
  freight: 9000, duty: 800, misc: 200, totalQty: 500, totalWeight: 400,
  totalValue: 30000, unitWeight: 0.52, unitCost: 36,
})
console.log(`  整批费用 ${fr.qty.total} → 按件 ${fr.qty.picked.toFixed(2)} / 按重 ${fr.weight.picked.toFixed(2)} / 按值 ${fr.value.picked.toFixed(2)} 每件`)
eq('按件均摊', fr.qty.byQty, 20)
console.log(`  三种摊法极差 ${fr.spread.toFixed(0)}% —— 超过 20% 说明这批货结构不均衡，摊法选错会错杀产品线`)

/* ---------------------------------------------------- 8. HS 编码校验 */
section('⑧', 'HS 编码 · 只校验结构，不做归类')
const hsOk = hsCode.parseHsCode('6109.10.00.10.00', 'sa')
console.log(`  6109.10.00.10.00 → ${hsOk.title}（${hsOk.segments.length} 段，章 ${hsOk.chapter?.ch} ${hsOk.chapter?.cn}）`)
eq('结构合规', hsOk.status, 'ok')
const hsShort = hsCode.parseHsCode('610910', 'sa')
console.log(`  610910（6 位）→ ${hsShort.title}`)
eq('位数不足', hsShort.status, 'short')
const hsBad = hsCode.parseHsCode('9900', 'sa')
eq('章号无效', hsBad.status, 'badChapter')
const hsEg = hsCode.parseHsCode('610910001000', 'eg')
console.log(`  同一个 12 位码，埃及的分段与沙特不同（埃及不是 GCC）：${hsEg.segments.map((s) => s.label).join(' → ')}`)

/* ---------------------------------------------------- 9. 进口关税 */
section('⑨', '进口关税 · VAT 基数是 CIF+关税')
const d = importDuty.importDuty({ cif: 10000, qty: 100, market: 'sa' })
console.log(`  CIF 10000 SAR → 关税 ${d.duty} + VAT ${d.vat} + 服务费 ${d.service} = 落地 ${d.total}`)
eq('关税', d.duty, 500)
eq('VAT（10500×15%）', d.vat, 1575)
eq('进口服务费（10000×0.15%）', d.service, 15)
eq('现金口径单件', d.perUnitCash, 120.9)
eq('成本口径单件（VAT 可抵扣）', d.perUnitCost, 105.15)

/* ---------------------------------------------------- 10. 标题检查 */
section('⑩', '标题规范 · 12 类检查')
const badTitle = 'Best Seller 100% Wireless Earbuds 耳机 FAST FAST FAST'
const t1 = titleCheck.checkTitle(badTitle)
console.log(`  "${badTitle.slice(0, 40)}..."`)
console.log(`  得分 ${t1.score}（${t1.grade}），命中 ${t1.issues.length} 项：${t1.issues.map((i) => i.id).join(', ')}`)
eq('识别促销词', t1.issues.some((i) => i.id === 'promo'), true)
eq('识别中文', t1.issues.some((i) => i.id === 'chinese'), true)
eq('识别重复词', t1.issues.some((i) => i.id === 'repeat-word'), true)
const goodTitle = 'Wireless Bluetooth Earbuds with Charging Case, 30H Playtime, IPX5 Waterproof'
const t2 = titleCheck.checkTitle(goodTitle)
console.log(`  合规标题得分 ${t2.score}（${t2.grade}）`)
eq('合规标题 ≥85', t2.score >= 85, true)

/* ---------------------------------------------------- 11. 违禁词自检 */
section('⑪', '违禁词自检 · 61 词 4 组')
const hits = bannedWords.scan('Best seller! Kills 99.9% germs, FDA approved, replica design')
console.log(`  命中 ${hits.length} 个：${hits.map((h) => h.word).join(' / ')}`)
eq('绝对化 high 命中', hits.some((h) => h.group === 'absolute'), true)
eq('医疗宣称命中', hits.some((h) => h.group === 'medical'), true)
eq('仿冒词命中', hits.some((h) => h.group === 'counterfeit'), true)
eq('干净文本无命中', bannedWords.scan('Cotton T-shirt, short sleeve, crew neck').length, 0)

/* ---------------------------------------------------- 12. SKU 矩阵 */
section('⑫', 'SKU 变体矩阵 · 边生成边校验')
const m = skuMatrix.buildMatrix({
  dim1: 'Red,Blue', dim2: 'S,M,L', prefix: 'TS', sep: '-', letterCase: 'upper', maxLen: 16,
})
console.log(`  ${m.total} 行，问题 ${m.bad} 行：${m.rows.slice(0, 3).map((r) => r.sku).join(' / ')} ...`)
eq('组合数 2×3', m.total, 6)
eq('SKU 示例', m.rows[0].sku, 'TS-RED-S')
eq('全部合规', m.bad, 0)
const dup = skuMatrix.buildMatrix({ dim1: 'Red,Red', dim2: 'S', sep: '-' })
eq('重复检测', dup.rows[1].problems.includes('与其它 SKU 重复'), true)

/* ---------------------------------------------------- 13. 条码 */
section('⑬', '条码 · EAN 校验位与 GS1 尺寸')
eq('EAN-13 校验位（4006381333931）', barcode.eanCheckDigit('400638133393'), 1)
eq('码制判定 13 位', barcode.detect('4006381333931'), 'ean13')
eq('码制判定 12 位', barcode.detect('036000291452'), 'upca')
const bcBad = barcode.checkCode('4006381333932')
console.log(`  校验位写错 → ${bcBad.problems[0]}`)
eq('校验位错误被抓出', bcBad.problems.length, 1)
const bcSkew = barcode.checkCode('SKU+001%')
console.log(`  "SKU+001%" → ${bcSkew.problems[0]}`)
eq('禁用符号被抓出', bcSkew.problems.length > 0, true)
eq('GS1 缩放 0.264mm', Math.round(barcode.gs1ScalePct(0.264)), 80)
eq('0.264mm 是否合规', barcode.gs1ScaleOk(80), true)

/* ------------------------------------------------------------ 汇总 */
console.log(`\n${'='.repeat(56)}`)
console.log(`模块 ${TOOLS.length} 个 · 断言 ${pass + fail} 条 · 通过 ${pass} · 失败 ${fail}`)
console.log('='.repeat(56))
if (fail > 0) {
  console.log('有断言未通过，请检查上面标 FAIL 的项。')
  process.exit(1)
}
console.log('全部通过。在线工具：https://noonmate.com/tool')
