/**
 * title-check.mjs —— Noon 商品标题规范检查
 *
 * 12 类检查 + 扣分评级。规则来自 Noon 商品标题要求（title requirements）
 * 与卖家侧长期被拒原因的归纳。
 *
 * 🔴 字符上限不是固定的：官方按类目不同（常见 100–150），
 *    所以本模块把上限做成参数，默认 100，不写死。
 *
 * 🔴 这一项容易被忽略但影响很大：标题里含中文字符。
 *    Noon 前台标题为英文（阿语站点另需阿语文案），中文会被审核打回。
 *    从 1688/淘宝采集来的标题直接上架，这是第一批被拒的主要原因。
 *
 * 评分：起始 100 分，high −18 / mid −8 / low −3。
 *   ≥85 基本合规 · ≥70 可以优化 · 其余建议重写
 *
 * 在线版（实时体检报告 + 高亮命中位置）：https://noonmate.com/tool/title
 */

import { readFileSync } from 'node:fs'

const RULES = JSON.parse(
  readFileSync(new URL('../data/title-rules.json', import.meta.url), 'utf8')
)

/** 促销 / 绝对化表述词表（标题里出现即高优先级问题） */
export const PROMO_WORDS = RULES.promo_words
/** 默认字符上限 */
export const DEFAULT_CHAR_LIMIT = RULES.default_char_limit
/** 检查项元数据（id / 级别 / 规则说明） */
export const CHECK_META = RULES.checks

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu
const CN_RE = /[\u4e00-\u9fa5]/g
const BAD_SYMBOL_RE = /[!@#$%^&*~`<>{}|\\]/g

const PENALTY = { high: 18, mid: 8, low: 3 }

/**
 * 检查一条标题。
 *
 * @param {string} text 标题
 * @param {number} [charLimit=100] 字符上限（按类目调）
 * @returns {{chars:number, wordCount:number, issues:Array<{level:string,id:string,title:string,detail:string}>, score:number, grade:string}}
 */
export function checkTitle(text, charLimit = DEFAULT_CHAR_LIMIT) {
  const t = String(text).trim()
  const lim = Math.max(parseInt(charLimit, 10) || DEFAULT_CHAR_LIMIT, 10)
  const issues = []

  const chars = t.length
  const words = t.split(/\s+/).filter(Boolean)
  const wordCount = words.length

  if (!t) return { chars: 0, wordCount: 0, issues: [], score: 0, grade: '待填写' }

  /* 1. 长度 */
  if (chars > lim) {
    issues.push({ level: 'high', id: 'length-over', title: `超出字符上限（${chars} / ${lim}）`, detail: '后台可能截断或拒收，删掉次要修饰词，把前面的核心词保留。' })
  } else if (chars > lim * 0.95) {
    issues.push({ level: 'mid', id: 'length-near', title: '已接近字符上限', detail: '再补卖点容易超，建议留 5–10 个字符余量。' })
  } else if (chars < 25) {
    issues.push({ level: 'mid', id: 'length-short', title: '标题偏短，信息量不足', detail: '建议补上品牌、材质、规格或适用场景，便于搜索召回。' })
  }

  /* 2. 词数 */
  if (wordCount < 4) {
    issues.push({ level: 'high', id: 'word-count', title: '词数过少', detail: '标题至少要说清「是什么 + 什么规格 + 给谁用」。' })
  }

  /* 3. 中文残留 */
  const cn = t.match(CN_RE)
  if (cn && cn.length > 0) {
    issues.push({ level: 'high', id: 'chinese', title: `含 ${cn.length} 个中文字符`, detail: 'Noon 前台标题为英文（阿语站点另需阿语文案），中文会被审核打回或影响曝光。' })
  }

  /* 4. emoji */
  const emoji = t.match(EMOJI_RE)
  if (emoji && emoji.length > 0) {
    issues.push({ level: 'mid', id: 'emoji', title: `含 ${emoji.length} 个 emoji 或符号图形`, detail: '标题里不要放表情符号，会被判低质。' })
  }

  /* 5. 促销 / 绝对化 */
  const lower = t.toLowerCase()
  const promos = PROMO_WORDS.filter((p) => lower.includes(p))
  if (promos.length > 0) {
    issues.push({ level: 'high', id: 'promo', title: `含促销或绝对化表述：${promos.join('、')}`, detail: '这类词既可能被判违规，也会拉低转化信任度，建议直接删掉。' })
  }

  /* 6. 特殊符号 */
  const sym = t.match(BAD_SYMBOL_RE)
  if (sym && sym.length > 0) {
    issues.push({ level: 'mid', id: 'symbols', title: `含 ${sym.length} 个装饰性符号`, detail: '用逗号、连字符分隔即可，其它符号会被当作噪声。' })
  }

  /* 7. 全大写 */
  const upper = words.filter((w) => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w))
  if (upper.length >= 2) {
    issues.push({ level: 'mid', id: 'uppercase', title: `有 ${upper.length} 个全大写单词`, detail: '除了型号与缩写，其它词用首字母大写即可，整段大写会被视为喊话。' })
  }

  /* 8. 关键词重复 ≥3 次 */
  const freq = new Map()
  for (const w of words) {
    const k = w.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (k.length < 3) continue
    freq.set(k, (freq.get(k) ?? 0) + 1)
  }
  const dups = [...freq.entries()].filter(([, n]) => n >= 3)
  if (dups.length > 0) {
    issues.push({ level: 'mid', id: 'repeat-word', title: `关键词重复：${dups.map(([w, n]) => `${w}×${n}`).join('、')}`, detail: '同一词出现三次以上属于堆砌，删到一两次即可。' })
  }

  /* 9. 相邻重复 */
  if (/\b(\w+)\s+\1\b/i.test(t)) {
    issues.push({ level: 'mid', id: 'repeat-adjacent', title: '有连续重复的单词', detail: '明显的复制粘贴痕迹，删掉多余的一个。' })
  }

  /* 10. 结尾标点 */
  if (/[.。]$/.test(t)) {
    issues.push({ level: 'low', id: 'trailing-dot', title: '结尾带句号', detail: '标题不加句号，去掉更规范。' })
  }

  /* 11. 多数小写开头 */
  const lowerStart = words.filter((w) => /^[a-z]/.test(w))
  if (lowerStart.length >= Math.ceil(wordCount / 2)) {
    issues.push({ level: 'low', id: 'lower-start', title: '多数单词为小写开头', detail: '采用首字母大写（Title Case）更整齐，也更接近平台内主流写法。' })
  }

  /* 12. 逗号过多 */
  if ((t.match(/,/g) ?? []).length >= 4 && wordCount <= 8) {
    issues.push({ level: 'mid', id: 'comma-stuffing', title: '逗号过多、词数偏少', detail: '像是把关键词塞成列表，读起来不像商品名。' })
  }

  const penalty = issues.reduce((s, i) => s + (PENALTY[i.level] ?? 0), 0)
  const score = Math.max(0, Math.min(100, 100 - penalty))
  const grade = score >= 85 ? '基本合规' : score >= 70 ? '可以优化' : '建议重写'

  return { chars, wordCount, issues, score, grade }
}
