// 零依赖自测。`npm test` 或 `node test/run.mjs`。
// 最后一项会真的调 Chrome 出一份 PDF 再回读页数——页数是这个工具唯一不能错的东西。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { displayWidth, wrapUnits, paginate, splitForSubmission, findOverlongLines } from '../lib/paginate.mjs';
import { collect, orderFiles } from '../lib/collect.mjs';
import { pageMetrics, renderSourceHtml, renderManualHtml, htmlToPdf, findChrome } from '../lib/render.mjs';
import { markdownToHtml } from '../lib/markdown.mjs';
import { pdfPageCount } from '../lib/verify.mjs';
import { charCount } from '../lib/config.mjs';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); passed++; }
  catch (err) { console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${err.message}`); failed++; }
};

console.log('\n折行与分页');

test('中文按两个字符宽算', () => {
  assert.equal(displayWidth('abc'), 3);
  assert.equal(displayWidth('中文'), 4);
  assert.equal(displayWidth('中文abc'), 7);
});

test('制表符按 4 列对齐展开', () => {
  assert.equal(displayWidth('\tx'), 5);
  assert.equal(displayWidth('ab\tx'), 5);
});

test('空行也占一个行高单位', () => {
  assert.equal(wrapUnits('', 89), 1);
});

test('超长行按折行数累加', () => {
  assert.equal(wrapUnits('x'.repeat(89), 89), 1);
  assert.equal(wrapUnits('x'.repeat(90), 89), 2);
  assert.equal(wrapUnits('x'.repeat(267), 89), 3);
});

test('分页不超出每页上限', () => {
  const lines = Array.from({ length: 500 }, (_, i) => (i % 7 === 0 ? 'z'.repeat(200) : `line ${i}`));
  const pages = paginate(lines, { unitsPerPage: 50, charsPerLine: 89 });
  for (const page of pages) {
    const used = page.reduce((a, l) => a + wrapUnits(l, 89), 0);
    assert.ok(used <= 50, `一页用了 ${used} 个行高单位，超过 50`);
  }
});

test('不足 60 页全本提交', () => {
  const r = splitForSubmission(Array.from({ length: 300 }, (_, i) => `a${i}`), { unitsPerPage: 50, charsPerLine: 89 });
  assert.equal(r.mode, 'full');
  assert.equal(r.omittedLines, 0);
  assert.equal(r.totalPages, r.front.length + 1);
});

test('超过 60 页切成前 30 + 后 30，总计 62 页', () => {
  const r = splitForSubmission(Array.from({ length: 50000 }, (_, i) => `a${i}`), { unitsPerPage: 50, charsPerLine: 89 });
  assert.equal(r.mode, 'excerpt');
  assert.equal(r.front.length, 30);
  assert.equal(r.back.length, 30);
  assert.equal(r.totalPages, 62);
  assert.equal(r.omittedLines, 50000 - 3000);
});

test('后 30 页取的是文件末尾，不是中段', () => {
  const lines = Array.from({ length: 50000 }, (_, i) => `a${i}`);
  const r = splitForSubmission(lines, { unitsPerPage: 50, charsPerLine: 89 });
  assert.equal(r.back.at(-1).at(-1), 'a49999');
  assert.equal(r.front[0][0], 'a0');
});

test('揪得出撑破整页的超长行', () => {
  const lines = ['ok', 'y'.repeat(50 * 89 + 1)];
  assert.equal(findOverlongLines(lines, { unitsPerPage: 50, charsPerLine: 89 }).length, 1);
});

console.log('\n页面几何');

test('A4 + 2cm 边距 + 9pt Courier = 每行 89 字符、每页最多 66 行', () => {
  const m = pageMetrics();
  assert.equal(m.charsPerLine, 89);
  assert.equal(m.maxUnitsPerPage, 66);
});

console.log('\n源码清点');

test('排除依赖目录与构建产物', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ruanzhu-test-'));
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'dep.js'), 'x\n'.repeat(100));
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'let a = 1;\nlet b = 2;\n');
  fs.writeFileSync(path.join(dir, 'app.min.js'), 'var a=1;\n');
  const r = collect(dir, { extensions: ['js'] });
  assert.deepEqual(r.files.map((f) => f.path), ['src/a.js']);
  assert.equal(r.codeLines, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('order 决定拼接顺序', () => {
  const files = ['lib/util.js', 'bin/cli.js', 'src/core.js'];
  assert.deepEqual(orderFiles(files, ['bin', 'src']), ['bin/cli.js', 'src/core.js', 'lib/util.js']);
});

console.log('\n说明书 Markdown');

test('标题、表格、代码块、列表都转得出来', () => {
  const html = markdownToHtml('# 一、标题\n\n正文 **粗** 和 `code`。\n\n- 甲\n- 乙\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nlet x = 1;\n```\n');
  assert.match(html, /<h1>一、标题<\/h1>/);
  assert.match(html, /<strong>粗<\/strong>/);
  assert.match(html, /<ul><li>甲<\/li><li>乙<\/li><\/ul>/);
  assert.match(html, /<th>a<\/th>/);
  assert.match(html, /<pre>let x = 1;<\/pre>/);
});

test('HTML 特殊字符被转义', () => {
  assert.match(markdownToHtml('a < b & c'), /a &lt; b &amp; c/);
});

console.log('\n表单字数');

test('中文按字符数算，连续空白折成一个', () => {
  assert.equal(charCount('  中文  abc '), 6); // 中 文 空格 a b c
});

console.log('\n端到端出 PDF');

let chrome = null;
try { chrome = findChrome(); } catch { /* 没装 Chrome 就跳过 */ }

if (!chrome) {
  console.log('  \x1b[33m-\x1b[0m 跳过：没找到 Chrome（设 CHROME_PATH 可指定）');
} else {
  test('源程序 PDF 的真实页数正好是 62', () => {
    const lines = Array.from({ length: 60000 }, (_, i) => (i % 11 === 0 ? `// ${'长'.repeat(60)}` : `const v${i} = ${i};`));
    const split = splitForSubmission(lines, { unitsPerPage: 50, charsPerLine: 89 });
    split.totalLines = lines.length;
    const config = { softwareName: '测试软件V1.0', version: 'V1.0', copyrightOwner: '测试著作权人', completedAt: '2026年09月', linesPerPage: 50 };
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ruanzhu-pdf-')), 'src.pdf');
    htmlToPdf(renderSourceHtml(split, config, pageMetrics()), out);
    assert.equal(pdfPageCount(out), 62);
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  });

  test('说明书 PDF 出得来且不是空壳', () => {
    const config = { softwareName: '测试软件V1.0', version: 'V1.0', copyrightOwner: '测试著作权人', completedAt: '2026年09月' };
    const md = Array.from({ length: 11 }, (_, i) => `# 第 ${i + 1} 章\n\n${'这是正文。'.repeat(40)}\n`).join('\n');
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ruanzhu-pdf-')), 'manual.pdf');
    htmlToPdf(renderManualHtml(markdownToHtml(md), config), out);
    assert.ok(pdfPageCount(out) >= 11);
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  });
}

console.log(`\n${failed ? '\x1b[31m' : '\x1b[32m'}${passed} 通过，${failed} 失败\x1b[0m\n`);
process.exit(failed ? 1 : 0);
