// 核验产出的 PDF。
//
// 页数是软著材料唯一一个「错了整份重做」的硬指标，所以生成完必须回读真实 PDF
// 去数，不许拿脚本里的预期值当结论。poppler（pdfinfo）在就用它，不在就退回
// 解析 PDF 页树，保证没装 poppler 的机器也能自检。

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

function tryPdfinfo(pdfPath) {
  try {
    const out = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = /^Pages:\s+(\d+)/m.exec(out);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

function parsePageTree(pdfPath) {
  const raw = fs.readFileSync(pdfPath).toString('latin1');
  const counts = [...raw.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  if (counts.length) return Math.max(...counts);
  const pages = raw.match(/\/Type\s*\/Page[^s]/g);
  return pages ? pages.length : null;
}

/** 返回 PDF 的真实页数，拿不到就返回 null。 */
export function pdfPageCount(pdfPath) {
  return tryPdfinfo(pdfPath) ?? parsePageTree(pdfPath);
}

/** 抽取每页文本，用来肉眼确认封面、说明页、末页没串位。没装 poppler 时返回 null。 */
export function pdfPages(pdfPath) {
  try {
    const out = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\f').slice(0, -1);
  } catch { return null; }
}

/** 对源程序 PDF 做整体体检，返回 {ok, checks[]}。 */
export function verifySourcePdf(pdfPath, expected) {
  const checks = [];
  const actual = pdfPageCount(pdfPath);
  checks.push({
    name: '页数',
    ok: actual === expected.totalPages,
    detail: `实际 ${actual ?? '未知'} 页，期望 ${expected.totalPages} 页`,
  });

  const pages = pdfPages(pdfPath);
  if (pages) {
    const cover = (pages[0] || '').replace(/\s+/g, '');
    checks.push({ name: '封面', ok: cover.includes('源程序'), detail: cover.slice(0, 40) || '(空)' });
    if (expected.mode === 'excerpt') {
      const note = (pages[31] || '').replace(/\s+/g, '');
      checks.push({ name: '说明页在第 32 页', ok: note.includes('说明') && note.includes('第十二条'), detail: note.slice(0, 50) || '(空)' });
    }
    if (expected.header) {
      // 页码只数正文页：封面和说明页不出页眉，末页页码应当正好是正文页数（超 60 页时是 60）
      const codePages = expected.front.length + expected.back.length;
      const first = (pages[1] || '').replace(/\s+/g, '');
      const tail = (pages[pages.length - 1] || '').replace(/\s+/g, '');
      const label = expected.header.replace(/\s+/g, '');
      checks.push({
        name: '页眉与页码',
        ok: first.includes(label) && first.includes('第1页') && tail.includes(`第${codePages}页`),
        detail: `首页「${expected.header}」第 1 页，末页第 ${codePages} 页`,
      });
    }
    // 页眉也是文字，判「末页非空」要先把页眉那一行去掉，只看正文
    const lastLines = (pages[pages.length - 1] || '').split('\n');
    const last = (expected.header ? lastLines.filter((l) => !/第\s*\d+\s*页\s*$/.test(l)) : lastLines).join('\n').trim();
    checks.push({ name: '末页非空', ok: last.length > 0, detail: last.slice(-40).replace(/\s+/g, ' ') || '(空)' });
  } else {
    checks.push({ name: '逐页内容', ok: true, detail: '未装 poppler，跳过（brew install poppler 可开启）' });
  }

  return { ok: checks.every((c) => c.ok), checks };
}
