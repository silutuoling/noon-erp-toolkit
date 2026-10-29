/**
 * import-duty.mjs —— 进口关税与落地成本估算
 *
 * ============================ 计算顺序（不能颠倒） ============================
 *   CIF 货值（货值 + 保险 + 运费）
 *     → 关税 = CIF × 关税率
 *     → 计税额 = CIF + 关税          ← VAT 的基数是「含关税」的，不是 CIF
 *     → VAT = 计税额 × VAT 率
 *     → 进口服务费 = CIF × 服务费率
 *
 * 🔴 最容易错的一步：VAT 按「CIF + 关税」算，不是按 CIF 算。
 *    用 CIF 直接乘会少算 5%–15% 的关税部分对应的 VAT。
 *
 * 🔴 第二个坑：「现金支出」和「真实成本」不是一回事。
 *    进口 VAT 通常可作进项税抵扣，所以它占用你的现金流，但不该全额计入成本。
 *    本模块同时给两个口径：perUnitCash（现金流）与 perUnitCost（成本表）。
 *    混用这两个数，毛利会凭空少一大截。
 *
 * 🔴 关税率必须按 HS 编码查，这里的默认值只是「标准税率示例」。
 *    本模块不做归类 —— 归类是法律申报行为，找报关行或查官方税则。
 *
 * 在线版：https://noonmate.com/tool/duty
 */

import { readFileSync } from 'node:fs'

const DATA = JSON.parse(
  readFileSync(new URL('../data/duty-defaults.json', import.meta.url), 'utf8')
)

/** 三站进口参数（默认税率、编码查询入口、国别特殊要求） */
export const DUTY_DEFAULTS = DATA.markets

/**
 * 进口税费测算。
 *
 * @param {object} p
 * @param {number} p.cif CIF 货值（本币）
 * @param {number} [p.qty=1] 件数
 * @param {'sa'|'eg'|'ae'} [p.market='sa']
 * @param {number} [p.dutyPct] 关税率（%），不传用该国默认值
 * @param {number} [p.vatPct] VAT 率（%），不传用该国默认值
 * @param {number} [p.servicePct] 进口服务费率（% of CIF），不传用该国默认值
 * @returns {{duty:number, vat:number, service:number, total:number, perUnitCash:number, perUnitCost:number, perUnitDuty:number, perUnitVat:number, taxPct:number}}
 */
export function importDuty({
  cif,
  qty = 1,
  market = 'sa',
  dutyPct,
  vatPct,
  servicePct,
}) {
  const meta = DUTY_DEFAULTS[market]
  if (!meta) throw new Error(`未知站点：${market}（可选 sa / eg / ae）`)

  const dRate = dutyPct ?? meta.defaultDutyPct
  const vRate = vatPct ?? meta.defaultVatPct
  const sRate = servicePct ?? meta.defaultServicePct
  const n = Math.max(1, Math.floor(qty))

  const duty = (cif * dRate) / 100
  const vat = ((cif + duty) * vRate) / 100
  const service = (cif * sRate) / 100
  const total = cif + duty + vat + service

  return {
    duty,
    vat,
    service,
    total,
    /** 现金口径：所有税费都真金白银先付出去 */
    perUnitCash: total / n,
    /** 成本口径：进口 VAT 可抵扣，不计入最终成本 */
    perUnitCost: (cif + duty + service) / n,
    perUnitDuty: duty / n,
    perUnitVat: vat / n,
    taxPct: cif > 0 ? ((duty + vat + service) / cif) * 100 : 0,
  }
}

/** 该国的官方编码查询入口与进口前置要求 */
export function lookupFor(market) {
  const m = DUTY_DEFAULTS[market]
  if (!m) throw new Error(`未知站点：${market}`)
  return { name: m.lookupName, url: m.lookupUrl, requirement: m.extraRequirement ?? null }
}
