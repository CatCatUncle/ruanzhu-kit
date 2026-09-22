// HTML → PDF。
//
// 不走 Word 导出：Word 的分页随版本、字体、打印机驱动漂，同一份稿子在两台机器上
// 能差出十几页。这里自己算好每页装哪些行，用 <div class=page> 把分页点钉死，
// 再交给 Chrome 无头模式出 PDF，页数是确定的。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const MM_TO_PT = 72 / 25.4;
const COURIER_ADVANCE = 0.6; // Courier New 的字符前进宽度，单位 em

/** 从页面几何算出每行能排多少字符、每页能排多少行。写死这两个数，页数才稳。 */
export function pageMetrics({ pageWidthMm = 210, pageHeightMm = 297, marginMm = 20, fontSizePt = 9, lineHeightPt = 11 } = {}) {
  const contentWidthPt = (pageWidthMm - marginMm * 2) * MM_TO_PT;
  const contentHeightPt = (pageHeightMm - marginMm * 2) * MM_TO_PT;
  return {
    charsPerLine: Math.floor(contentWidthPt / (fontSizePt * COURIER_ADVANCE)),
    maxUnitsPerPage: Math.floor(contentHeightPt / lineHeightPt),
    fontSizePt,
    lineHeightPt,
    marginMm,
  };
}

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const sourceStyle = (m) => `
@page { size: A4 portrait; margin: ${m.marginMm / 10}cm; }
html, body { margin: 0; padding: 0; }
body { font-family: 'Courier New', Consolas, SimSun, monospace; font-size: ${m.fontSizePt}pt; color: #000; }
div.page { page-break-after: always; break-after: page; }
div.page:last-child { page-break-after: auto; break-after: auto; }
p { margin: 0; padding: 0; border: 0; text-indent: 0; text-align: left;
    font-family: 'Courier New', Consolas, SimSun, monospace; font-size: ${m.fontSizePt}pt;
    line-height: ${m.lineHeightPt}pt; white-space: pre-wrap; word-break: break-all; }
p.blank { height: ${m.lineHeightPt}pt; }
p.t1 { text-align: center; font-family: SimHei, 'Heiti SC', sans-serif; font-size: 28pt; font-weight: bold; line-height: 44pt; margin-top: 150pt; white-space: normal; }
p.t2 { text-align: center; font-family: SimHei, 'Heiti SC', sans-serif; font-size: 24pt; font-weight: bold; line-height: 38pt; margin-top: 24pt; white-space: normal; }
p.meta { text-align: center; font-family: SimSun, serif; font-size: 14pt; line-height: 32pt; white-space: normal; }
p.note-title { text-align: center; font-family: SimHei, 'Heiti SC', sans-serif; font-size: 18pt; font-weight: bold; line-height: 40pt; margin-top: 120pt; white-space: normal; }
p.note-body { text-align: center; font-family: SimSun, serif; font-size: 13pt; line-height: 30pt; white-space: normal; }
`;

const codePage = (lines) => `<div class=page>\n${lines.map((l) => (l.length ? `<p>${escapeHtml(l)}</p>` : '<p class=blank>&nbsp;</p>')).join('\n')}\n</div>`;

/** 源程序鉴别材料：封面 + 前 30 页 + 说明页 + 后 30 页。 */
export function renderSourceHtml(split, config, metrics) {
  const cover = `<div class=page>
<p class=t1>${escapeHtml(config.softwareName)}</p>
<p class=t2>源 程 序</p>
<p class=meta>&nbsp;</p><p class=meta>&nbsp;</p><p class=meta>&nbsp;</p>
<p class=meta>软件名称：${escapeHtml(config.softwareName)}</p>
<p class=meta>版 本 号：${escapeHtml(config.version)}</p>
<p class=meta>著作权人：${escapeHtml(config.copyrightOwner)}</p>
<p class=meta>开发完成日期：${escapeHtml(config.completedAt)}</p>
</div>`;

  const notePage = split.mode === 'excerpt' ? `<div class=page>
<p class=note-title>说 明</p>
<p class=note-body>本软件源程序共 ${split.totalLines} 行，按每页 ${config.linesPerPage} 行排版，共 ${split.sourcePages} 页。</p>
<p class=note-body>依据《计算机软件著作权登记办法》第十二条，</p>
<p class=note-body>源程序超过 60 页的，只提交前连续 30 页与后连续 30 页，</p>
<p class=note-body>中间 ${split.omittedPages} 页（${split.omittedLines} 行）连续源程序略。</p>
</div>` : '';

  const body = [cover, ...split.front.map(codePage), notePage, ...split.back.map(codePage)].filter(Boolean).join('\n');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>${escapeHtml(config.softwareName)} 源程序</title>
<style>${sourceStyle(metrics)}</style></head><body>
${body}
</body></html>`;
}

/** 文档鉴别材料（说明书）的样式，正文宋体、标题黑体。 */
export const manualStyle = `
@page { size: A4 portrait; margin: 2.2cm 2cm; }
html, body { margin: 0; padding: 0; }
body { font-family: SimSun, 'Songti SC', serif; font-size: 12pt; color: #000; }
h1 { font-family: SimHei, 'Heiti SC', sans-serif; font-size: 16pt; line-height: 28pt; margin: 0 0 14pt; page-break-before: always; break-before: page; }
h1:first-of-type { page-break-before: auto; break-before: auto; }
h2 { font-family: SimHei, 'Heiti SC', sans-serif; font-size: 13.5pt; line-height: 24pt; margin: 16pt 0 8pt; }
h3 { font-family: SimHei, 'Heiti SC', sans-serif; font-size: 12pt; line-height: 22pt; margin: 12pt 0 6pt; }
p { font-size: 11pt; line-height: 20pt; text-align: justify; text-indent: 22pt; margin: 0 0 8pt; }
ul, ol { margin: 0 0 10pt; padding-left: 26pt; }
li { font-size: 11pt; line-height: 20pt; margin-bottom: 3pt; }
pre { font-family: 'Courier New', monospace; font-size: 9.5pt; line-height: 14pt; background: #f4f4f4;
      border: 0.75pt solid #bbb; padding: 6pt 8pt; margin: 0 0 10pt; white-space: pre-wrap; word-break: break-all; }
code { font-family: 'Courier New', monospace; font-size: 10pt; }
table { border-collapse: collapse; width: 100%; margin: 0 0 12pt; page-break-inside: avoid; }
th { border: 0.75pt solid #333; background: #e8e8e8; font-family: SimHei, sans-serif; font-size: 10.5pt; padding: 5pt; text-align: left; }
td { border: 0.75pt solid #333; font-size: 10pt; padding: 5pt; line-height: 16pt; vertical-align: top; }
div.cover { page-break-after: always; break-after: page; text-align: center; }
div.cover p.t1 { font-family: SimHei, sans-serif; font-size: 28pt; font-weight: bold; line-height: 44pt; margin-top: 150pt; text-indent: 0; }
div.cover p.t2 { font-family: SimHei, sans-serif; font-size: 24pt; font-weight: bold; line-height: 38pt; margin-top: 24pt; text-indent: 0; }
div.cover p.meta { font-size: 14pt; line-height: 32pt; text-indent: 0; text-align: center; }
`;

export function renderManualHtml(bodyHtml, config) {
  const cover = `<div class=cover>
<p class=t1>${escapeHtml(config.softwareName)}</p>
<p class=t2>软件说明书</p>
<p class=meta>&nbsp;</p><p class=meta>&nbsp;</p><p class=meta>&nbsp;</p>
<p class=meta>软件名称：${escapeHtml(config.softwareName)}</p>
<p class=meta>版 本 号：${escapeHtml(config.version)}</p>
<p class=meta>著作权人：${escapeHtml(config.copyrightOwner)}</p>
<p class=meta>开发完成日期：${escapeHtml(config.completedAt)}</p>
</div>`;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>${escapeHtml(config.softwareName)} 说明书</title>
<style>${manualStyle}</style></head><body>
${cover}
${bodyHtml}
</body></html>`;
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

export function findChrome() {
  for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p;
  throw new Error('找不到 Chrome。装一个 Chrome/Chromium/Edge，或用环境变量 CHROME_PATH 指定可执行文件路径。');
}

/** 用 Chrome 无头模式把 HTML 打成 PDF。中间 HTML 落在临时目录，不污染项目。 */
export function htmlToPdf(html, outPdf) {
  const chrome = findChrome();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruanzhu-'));
  const htmlPath = path.join(tmp, 'render.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  fs.mkdirSync(path.dirname(outPdf), { recursive: true });
  try {
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
      `--print-to-pdf=${outPdf}`, htmlPath,
    ], { stdio: 'pipe', timeout: 180000 });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (!fs.existsSync(outPdf)) throw new Error(`Chrome 没有产出 PDF：${outPdf}`);
  return outPdf;
}

/** 同一份 HTML 存成 .doc，Word 能直接打开改字，用于留存。 */
export function htmlToDoc(html, outDoc) {
  fs.mkdirSync(path.dirname(outDoc), { recursive: true });
  fs.writeFileSync(outDoc, '\ufeff' + html, 'utf8');
  return outDoc;
}
