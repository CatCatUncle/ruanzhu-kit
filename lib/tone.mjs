// 表单文字的「口吻」检查。
//
// 审查员一天看几百份表，一眼能认出套话：一堆「赋能」「一站式」「全方位」，
// 每条都是「小标题：三个排比」，还夹着 Markdown 符号。这些不影响受理，
// 但读起来空，也不像开发者自己写的。这里只挑出来，改不改由人定。

const BUZZWORDS = [
  '赋能', '一站式', '全方位', '全链路', '多维度', '深度融合', '无缝', '闭环',
  '极致', '革命性', '颠覆', '助力', '打造', '智能化', '高效便捷', '强大的', '领先的',
  '行业领先', '旨在', '致力于', '全面提升', '显著提升', '有效提升', '极大地',
  '一键式', '沉浸式', '卓越', '无与伦比', '重塑', '引领', '抓手', '底层逻辑',
  '范式', '心智', '痛点', '降本增效',
];

const PATTERNS = [
  [/\*\*|__|^#{1,6}\s|`/m, 'Markdown 符号（** # `），粘进网页表单会原样显示'],
  [/^\s*[-*•]\s/m, '行首列表符号，表单里不会变成列表'],
  [/[一二三四五六七八九十]+、[^。]{2,12}[。：:]/, '「一、xx。二、xx。」汉字编号小标题，读着像提纲；用「1、」或直接成段写'],
  [/不仅[^。]{0,30}(?:更|还|而且)/, '「不仅……更……」句式'],
  [/——/, '破折号，表单里少用'],
  [/[!！]/, '感叹号'],
  [/[A-Za-z]{2,}[一-龥]{0,2}(?:能力|赋能)/, '中英混搭的概念词，写成具体动作'],
];

/** 返回 [{ word, hint }]；空数组表示没挑出毛病。 */
export function toneIssues(text) {
  const s = String(text || '');
  if (!s.trim()) return [];
  const out = [];
  for (const w of BUZZWORDS) if (s.includes(w)) out.push({ word: w, hint: '套话，换成具体做了什么' });
  for (const [re, hint] of PATTERNS) {
    const m = s.match(re);
    if (m) out.push({ word: m[0].trim().slice(0, 12), hint });
  }
  // 同一个句式开头连用三次以上，比如每句都是「支持……」「实现……」
  const starts = s.split(/[。；;\n]/).map((x) => x.replace(/[*_#`]/g, '').trim().replace(/^[\d一二三四五六七八九十]+[、.．)）]\s*/, '').slice(0, 2)).filter((x) => x.length === 2);
  const counts = starts.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
  for (const [k, n] of counts) if (n >= 4) out.push({ word: `${k}……×${n}`, hint: '好几句同一个开头，换着说' });
  return out;
}
