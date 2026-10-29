/**
 * hs-code.mjs —— HS 编码结构校验
 *
 * ============================ 做什么 / 不做什么 ============================
 * ✅ 做：校验编码**结构**（位数、是否全数字、章号范围），逐段解释每一位代表什么，
 *        给出章级标题，帮你判断手上这串码是不是抄错、抄短了。
 * ❌ 不做：判定某个商品该归到哪个编码。归类是法律申报行为，同一产品因材质、用途、
 *        加工方式不同可能落到不同编码，错报后果是滞港、罚款、追税、退运。
 *        所以本模块不含任何「商品 → 编码」映射，只含「编码 → 层级含义」的确定性解析。
 *
 * ============================ 口径 ============================
 * 🔴 1. HS 前 6 位全球统一（WCO）：1-2 章、3-4 品目、5-6 子目。
 * 🔴 2. 沙特 / 阿联酋属 GCC 关税同盟：7-8 位为 GCC 统一细分，9-12 位为各国本国细分。
 * 🔴 3. 埃及**不是** GCC 成员：7-12 位整段都是埃及本国细分，不能套 GCC 两层结构。
 * 🔴 4. 12 位编码**没有公开的统一校验位算法**，所以「结构合规」≠「编码真实存在」。
 *
 * 在线版（含逐段可视化与按品类找章）：https://noonmate.com/tool/hscode
 */

import { readFileSync } from 'node:fs'

const DATA = JSON.parse(
  readFileSync(new URL('../data/hs-rules.json', import.meta.url), 'utf8')
)

/** 各国编码位数与分段规则 */
export const HS_RULES = DATA.rules
/** 推荐展示顺序 */
export const HS_COUNTRY_ORDER = DATA.country_order
/** 97 章章节表（第 77 章为 WCO 保留空章） */
export const CHAPTERS = DATA.chapters

/** 去掉全角数字、空格、连字符、点、下划线、中点 */
export function cleanHsCode(raw) {
  return String(raw)
    .replace(/[\uFF10-\uFF19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s\-_.·]/g, '')
}

/**
 * 解析并校验一个 HS 编码。
 *
 * @param {string} raw 原始输入
 * @param {'intl'|'sa'|'ae'|'eg'} [country='sa']
 * @returns {{status:string, title:string, detail:string, cleaned:string, segments:Array, chapter?:object, missing:number}}
 *   status: empty | format | long | short | badChapter | reserved | ok
 */
export function parseHsCode(raw, country = 'sa') {
  const rule = HS_RULES[country]
  if (!rule) throw new Error(`未知国家：${country}（可选 intl / sa / ae / eg）`)

  const cleaned = cleanHsCode(raw)
  const base = {
    cleaned,
    segments: [],
    missing: Math.max(0, rule.digits - cleaned.length),
  }

  if (cleaned.length === 0) {
    return { ...base, status: 'empty', title: '等待输入', detail: `粘贴编码后自动校验，${rule.name}需要 ${rule.digits} 位。` }
  }

  if (/[^0-9]/.test(cleaned)) {
    const bad = [...new Set(cleaned.replace(/[0-9]/g, '').split(''))].join(' ')
    return {
      ...base,
      status: 'format',
      title: '含非数字字符',
      detail: `编码只能是数字，检测到「${bad}」。若原始文件里带字母（如 HS 前缀、备注），请只保留数字段。`,
    }
  }

  if (cleaned.length > 12) {
    return {
      ...base,
      status: 'long',
      title: '位数超出',
      detail: `输入 ${cleaned.length} 位，各国税则最长 12 位。可能把两个编码粘连了，或混入了序号。`,
    }
  }

  const segments = rule.segments.map((s) => {
    const digits = cleaned.slice(s.from - 1, s.to)
    return { ...s, digits, missing: digits.length < s.to - s.from + 1 }
  })

  const chCode = cleaned.slice(0, 2)
  const chapter = CHAPTERS.find((c) => c.ch === chCode)
  const withSeg = { ...base, segments, chapter }

  if (cleaned.length < 2) {
    return { ...withSeg, status: 'short', title: '位数不足', detail: `只有 ${cleaned.length} 位，连章号都不完整。${rule.name}需要 ${rule.digits} 位。` }
  }

  const chNum = Number(chCode)
  if (!chapter || chNum === 0) {
    return {
      ...withSeg,
      status: 'badChapter',
      title: '章号无效',
      detail: `前两位是 ${chCode}，不在 01–97 范围内。HS 章号到 97 为止，98 / 99 是部分国家自定的特殊章，需单独查该国税则。`,
    }
  }

  if (chNum === 77) {
    return {
      ...withSeg,
      status: 'reserved',
      title: '落在保留章',
      detail: '第 77 章是 WCO 保留给将来使用的空章，正常商品不应出现在这里，请核对前两位。',
    }
  }

  if (cleaned.length < rule.digits) {
    const lack = segments.filter((s) => s.missing).map((s) => s.label)
    return {
      ...withSeg,
      status: 'short',
      title: `还差 ${rule.digits - cleaned.length} 位`,
      detail: `现有 ${cleaned.length} 位，${rule.name}需要 ${rule.digits} 位。缺的是「${lack.join('」「') || '本国细分'}」段，这一段由该国海关税则确定，必须查官方税则或由报关行补齐，不能自行推测。`,
    }
  }

  return {
    ...withSeg,
    status: 'ok',
    title: '结构合规',
    detail: `位数与章号均符合${rule.name}的结构规则。注意：这只是格式检查，不代表该编码真实存在或适用你的商品。`,
  }
}

/** 按关键词找章（支持章号、中文名、英文名、常见口语词）。第 77 章不返回 */
export function searchChapters(q) {
  const k = String(q).trim().toLowerCase()
  if (!k) return []
  return CHAPTERS.filter((c) => {
    if (c.ch === '77') return false
    if (c.ch.startsWith(k)) return true
    if (c.cn.toLowerCase().includes(k)) return true
    if (c.en.toLowerCase().includes(k)) return true
    return (c.tags ?? []).some((t) => t.toLowerCase().includes(k) || k.includes(t.toLowerCase()))
  })
}
