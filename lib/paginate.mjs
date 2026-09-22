// 折行感知分页。
//
// 源程序 PDF 的页数必须在生成之前就算死，不能交给排版引擎去漂。核心难点是
// 超长代码行：一行 300 字符在 A4 上会折成 4 行，按「行数」切页必然撑破页面，
// 所以这里一律按「折行之后占几个行高单位」来累加。

// 东亚宽字符（中文/日文/韩文/全角标点）在等宽字体里占两个字符宽。
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;

/** 一行代码在等宽字体里实际占多少字符宽（制表符按 tabWidth 对齐展开）。 */
export function displayWidth(line, tabWidth = 4) {
  let w = 0;
  for (const ch of line) {
    if (ch === '\t') { w += tabWidth - (w % tabWidth); continue; }
    w += WIDE.test(ch) ? 2 : 1;
  }
  return w;
}

/** 一行折行之后占几个行高单位。空行也占 1。 */
export function wrapUnits(line, charsPerLine, tabWidth = 4) {
  return Math.max(1, Math.ceil(displayWidth(line, tabWidth) / charsPerLine));
}

/**
 * 按折行高度切页。
 * @returns {string[][]} 每个元素是一页的行
 */
export function paginate(lines, { unitsPerPage, charsPerLine, tabWidth = 4 }) {
  const pages = [];
  let cur = [];
  let used = 0;
  for (const line of lines) {
    // 单行折行后超过一整页的，给它单独一页，避免死循环
    const u = Math.min(wrapUnits(line, charsPerLine, tabWidth), unitsPerPage);
    if (used + u > unitsPerPage && cur.length) { pages.push(cur); cur = []; used = 0; }
    cur.push(line);
    used += u;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/**
 * 按《计算机软件著作权登记办法》第十二条切分提交范围。
 *
 * 超过 60 页的，交前连续 30 页 + 后连续 30 页，中间略；不足 60 页全交。
 * 注意是「整份源程序的前 30 页和最后 30 页」，不是「把源程序对半分再各凑 30 页」——
 * 后者在代码量大的项目上会把每页撑到几百行，出来的 PDF 远不止 62 页。
 */
export function splitForSubmission(lines, opts) {
  const pages = paginate(lines, opts);
  if (pages.length <= 60) {
    return {
      mode: 'full',
      front: pages,
      back: [],
      omittedPages: 0,
      omittedLines: 0,
      sourcePages: pages.length,
      totalPages: pages.length + 1, // 封面
    };
  }
  const front = pages.slice(0, 30);
  const back = pages.slice(-30);
  const kept = front.reduce((a, p) => a + p.length, 0) + back.reduce((a, p) => a + p.length, 0);
  return {
    mode: 'excerpt',
    front,
    back,
    omittedPages: pages.length - 60,
    omittedLines: lines.length - kept,
    sourcePages: pages.length,
    totalPages: 62, // 封面 + 30 + 说明页 + 30
  };
}

/** 找出折行后会超过一整页的行，这种基本是压缩产物，应该从源码清单里排掉。 */
export function findOverlongLines(lines, { unitsPerPage, charsPerLine, tabWidth = 4 }) {
  const out = [];
  lines.forEach((line, i) => {
    if (wrapUnits(line, charsPerLine, tabWidth) > unitsPerPage) out.push({ index: i, width: displayWidth(line, tabWidth) });
  });
  return out;
}
