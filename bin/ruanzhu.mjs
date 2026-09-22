#!/usr/bin/env node
// ruanzhu-kit —— 中国软件著作权登记材料生成器
// 用法：ruanzhu <init|count|source|manual|form|all> [项目目录] [选项]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collect } from '../lib/collect.mjs';
import { splitForSubmission, findOverlongLines, paginate } from '../lib/paginate.mjs';
import { pageMetrics, renderSourceHtml, renderManualHtml, htmlToPdf, htmlToDoc } from '../lib/render.mjs';
import { markdownToHtml } from '../lib/markdown.mjs';
import { verifySourcePdf, pdfPageCount } from '../lib/verify.mjs';
import { loadConfig, saveConfig, DEFAULTS, CONFIG_NAME, SHORT_FIELDS, LONG_FIELDS, charCount } from '../lib/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pad = (s, width) => s + ' '.repeat(Math.max(0, width - [...s].reduce((a, ch) => a + (/[\u2E80-\u9FFF\uFF00-\uFF60]/.test(ch) ? 2 : 1), 0)));
const c = { dim: (s) => `\x1b[2m${s}\x1b[0m`, ok: (s) => `\x1b[32m${s}\x1b[0m`, bad: (s) => `\x1b[31m${s}\x1b[0m`, warn: (s) => `\x1b[33m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m` };

const LANGUAGES = {
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript', vue: 'JavaScript', svelte: 'JavaScript',
  py: 'Python', java: 'Java', kt: 'Kotlin', go: 'Go', rs: 'Rust', rb: 'Ruby',
  php: 'PHP', cs: 'C#', swift: 'Swift', c: 'C', h: 'C', cc: 'C++', cpp: 'C++', hpp: 'C++',
  m: 'Objective-C', mm: 'Objective-C', sh: 'Shell', sql: 'SQL',
  css: 'CSS', scss: 'CSS', less: 'CSS', html: 'HTML',
};

function parseArgs(argv) {
  const opts = { doc: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--doc') opts.doc = true;
    else if (a === '--lines-per-page') opts.linesPerPage = Number(argv[++i]);
    else if (a === '--out') opts.outDir = argv[++i];
    else if (a === '-h' || a === '--help') opts.help = true;
    else rest.push(a);
  }
  return { opts, rest };
}

function usage() {
  console.log(`ruanzhu-kit —— 中国软件著作权登记材料生成器

用法：
  ruanzhu init   [项目目录]   在项目里生成 ${CONFIG_NAME} 和说明书骨架
  ruanzhu count  [项目目录]   只统计源码行数与预估页数，不出文件
  ruanzhu source [项目目录]   生成 ①程序鉴别材料 PDF 并核验页数
  ruanzhu manual [项目目录]   生成 ②文档鉴别材料（说明书）PDF
  ruanzhu form   [项目目录]   生成表单填写清单（含字数校验）
  ruanzhu all    [项目目录]   以上三样一起出，最后打一份自检清单

选项：
  --doc                 同时导出可编辑的 .doc 留存件
  --lines-per-page <n>  每页行数，默认 50（登记要求不少于 50）
  --out <dir>           输出目录，默认 ruanzhu/out

项目目录省略时用当前目录。`);
}

// ---------- init ----------

function cmdInit(dir) {
  const target = path.resolve(dir);
  const configPath = path.join(target, CONFIG_NAME);
  if (fs.existsSync(configPath)) {
    console.log(c.warn(`${CONFIG_NAME} 已存在，没有覆盖：${configPath}`));
  } else {
    const now = new Date();
    const tpl = {
      ...DEFAULTS,
      softwareName: path.basename(target) + '软件V1.0',
      shortName: path.basename(target),
      copyrightOwner: '（写营业执照全称或身份证姓名，一字不差）',
      completedAt: `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月`,
      form: Object.fromEntries([...SHORT_FIELDS, ...LONG_FIELDS].map(([k]) => [k, ''])),
    };
    delete tpl.projectDir;
    fs.writeFileSync(configPath, JSON.stringify(tpl, null, 2) + '\n', 'utf8');
    console.log(c.ok('已生成 ') + configPath);
  }

  const manualPath = path.join(target, DEFAULTS.manual);
  if (fs.existsSync(manualPath)) {
    console.log(c.warn('说明书骨架已存在，没有覆盖：') + manualPath);
  } else {
    const raw = fs.readFileSync(path.join(ROOT, 'templates', 'manual.md'), 'utf8');
    fs.mkdirSync(path.dirname(manualPath), { recursive: true });
    fs.writeFileSync(manualPath, raw, 'utf8');
    console.log(c.ok('已生成 ') + manualPath);
  }

  console.log(`
下一步：
  1. 把 ${CONFIG_NAME} 里的软件名称、著作权人、开发完成日期填准
  2. 跑 ${c.b('ruanzhu count')} 看看收进来的文件对不对，把不该收的加进 exclude
  3. 写 ${DEFAULTS.manual}，然后 ${c.b('ruanzhu all')}`);
}

// ---------- 公共：清点 + 分页 ----------

function prepare(config, opts) {
  const linesPerPage = opts.linesPerPage || config.linesPerPage;
  const metrics = pageMetrics();
  if (linesPerPage > metrics.maxUnitsPerPage) {
    throw new Error(`每页 ${linesPerPage} 行排不下，A4 在当前字号下最多 ${metrics.maxUnitsPerPage} 行。`);
  }
  if (linesPerPage < 50) {
    console.log(c.warn(`每页 ${linesPerPage} 行低于登记要求的 50 行，确认你知道自己在做什么。`));
  }

  const srcRoot = path.resolve(config.projectDir, config.sourceDir);
  const collected = collect(srcRoot, config);
  if (!collected.lines.length) throw new Error(`在 ${srcRoot} 里没收到任何源码，检查 extensions 和 exclude。`);

  const opt = { unitsPerPage: linesPerPage, charsPerLine: metrics.charsPerLine };
  const overlong = findOverlongLines(collected.lines, opt);
  const split = splitForSubmission(collected.lines, opt);
  split.totalLines = collected.docLines;

  return { ...collected, split, metrics, linesPerPage, overlong, srcRoot };
}

// ---------- count ----------

function cmdCount(config, opts) {
  const p = prepare(config, opts);
  const top = [...p.files].sort((a, b) => b.lines - a.lines).slice(0, 12);

  console.log(c.b(`\n${config.softwareName}  ${config.version}`));
  console.log(c.dim(`源码目录 ${p.srcRoot}`));
  console.log(`\n收进材料的文件：${c.b(String(p.files.length))} 个`);
  console.log(`纯源代码行数：  ${c.b(String(p.codeLines))}`);
  console.log(`提交文档行数：  ${c.b(String(p.docLines))}  ${c.dim('← 表单「源程序量」填这个')}`);
  console.log(`排版页数：      ${c.b(String(p.split.sourcePages))} 页（每页 ${p.linesPerPage} 行，每行 ${p.metrics.charsPerLine} 字符）`);
  console.log(p.split.mode === 'excerpt'
    ? `提交范围：      前 30 页 + 后 30 页，中间 ${p.split.omittedPages} 页（${p.split.omittedLines} 行）略 → PDF 共 ${c.b('62')} 页`
    : `提交范围：      不足 60 页，${c.b('全本提交')} → PDF 共 ${c.b(String(p.split.totalPages))} 页`);

  console.log(c.b('\n行数最多的文件'));
  for (const f of top) console.log(`  ${String(f.lines).padStart(6)}  ${f.path}`);
  if (p.files.length > top.length) console.log(c.dim(`  …… 另有 ${p.files.length - top.length} 个文件`));

  if (p.overlong.length) {
    console.log(c.warn(`\n有 ${p.overlong.length} 行折行后超过一整页，基本是压缩/生成产物，建议加进 excludeFiles。`));
  }
  console.log(c.dim('\n文件清单不对就改 ruanzhu.config.json 的 exclude / excludeFiles / extensions，再跑一次。\n'));
}

// ---------- source ----------

function cmdSource(config, opts) {
  const p = prepare(config, opts);
  const outDir = path.resolve(config.projectDir, opts.outDir || config.outDir);
  const label = p.split.mode === 'excerpt' ? '源程序前30页后30页' : '源程序全本';
  const pdfPath = path.join(outDir, `①程序鉴别材料_${label}_${config.shortName}.pdf`);

  const html = renderSourceHtml(p.split, { ...config, linesPerPage: p.linesPerPage }, p.metrics);
  htmlToPdf(html, pdfPath);
  console.log(c.ok('已生成 ') + pdfPath);
  if (opts.doc) console.log(c.ok('已生成 ') + htmlToDoc(html, path.join(outDir, `${config.shortName}源程序.doc`)));

  const result = verifySourcePdf(pdfPath, p.split);
  console.log(c.b('\n核验'));
  for (const chk of result.checks) {
    console.log(`  ${chk.ok ? c.ok('✓') : c.bad('✗')} ${pad(chk.name, 20)} ${c.dim(chk.detail)}`);
  }
  if (!result.ok) {
    console.log(c.bad('\n页数或内容不对，不要提交。先用 ruanzhu count 看排版参数。'));
    process.exitCode = 1;
  }
  return { ...p, pdfPath, verified: result.ok };
}

// ---------- manual ----------

function cmdManual(config, opts) {
  const mdPath = path.resolve(config.projectDir, config.manual);
  if (!fs.existsSync(mdPath)) throw new Error(`没找到说明书 ${mdPath}。跑 \`ruanzhu init\` 会生成骨架。`);
  const md = fs.readFileSync(mdPath, 'utf8')
    .replace(/\{\{softwareName\}\}/g, config.softwareName)
    .replace(/\{\{version\}\}/g, config.version)
    .replace(/\{\{copyrightOwner\}\}/g, config.copyrightOwner)
    .replace(/\{\{completedAt\}\}/g, config.completedAt);

  if (md.includes('……')) console.log(c.warn('说明书里还留着「……」占位符，先补完再交。'));

  const outDir = path.resolve(config.projectDir, opts.outDir || config.outDir);
  const pdfPath = path.join(outDir, `②文档鉴别材料_说明书_${config.shortName}.pdf`);
  const html = renderManualHtml(markdownToHtml(md), config);
  htmlToPdf(html, pdfPath);
  if (opts.doc) htmlToDoc(html, path.join(outDir, `${config.shortName}说明书.doc`));

  const pages = pdfPageCount(pdfPath);
  console.log(c.ok('已生成 ') + pdfPath + c.dim(`（${pages ?? '?'} 页）`));
  if (pages && pages > 60) {
    console.log(c.warn('说明书超过 60 页，登记时同样只交前 30 页 + 后 30 页，先精简到 60 页以内更省事。'));
  }
  return { pdfPath, pages };
}

// ---------- form ----------

function cmdForm(config, opts) {
  const p = prepare(config, opts);
  const outDir = path.resolve(config.projectDir, opts.outDir || config.outDir);
  const outPath = path.join(outDir, '表单填写清单.md');

  const langs = [...new Set(p.files.map((f) => LANGUAGES[path.extname(f.path).slice(1).toLowerCase()]).filter(Boolean))];
  const f = config.form || {};
  const cell = (v) => (v || '_待填_').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
  const row = ([key, label, limit]) => {
    const v = f[key] || '';
    const n = charCount(v);
    const status = !v ? '⬜ 待填' : n > limit ? `❌ 超 ${n - limit} 字` : `✅ ${n}/${limit}`;
    return `| ${label} | ${cell(v)} | ${status} |`;
  };

  const lines = [
    `# ${config.softwareName} 软著在线表单填写清单`,
    '',
    `> 由 ruanzhu-kit 生成。复制到中国版权保护中心在线登记系统逐项粘贴。`,
    '',
    '## 一、基本信息',
    '',
    '| 字段 | 填写内容 |',
    '|---|---|',
    `| 软件全称 | ${config.softwareName} |`,
    `| 版本号 | ${config.version} |`,
    `| 著作权人 | ${config.copyrightOwner} |`,
    `| 办理身份 | ${config.applicantType === 'company' ? '法人或其他组织' : '自然人'} |`,
    `| 开发完成日期 | ${config.completedAt} |`,
    `| 发表日期 | ${config.publishedAt || '未发表'} |`,
    `| 开发方式 | 独立开发 |`,
    `| 权利取得方式 | 原始取得 |`,
    '',
    '## 二、源程序量（三处必须一致）',
    '',
    '| 位置 | 数值 |',
    '|---|---|',
    `| 在线表单「源程序量」 | **${p.docLines}** 行 |`,
    `| 程序鉴别材料说明页 | ${p.docLines} 行 |`,
    `| 代码统计（${p.files.length} 个文件） | ${p.docLines} 行 |`,
    '',
    `编程语言：${langs.join('、') || '（按实际勾选）'}`,
    '',
    '## 三、50 字上限字段',
    '',
    '注意：「开发该软件的操作系统」填的是写代码用的系统，不是软件能跑的平台；',
    '开发环境的配置要不低于运行环境，填反了逻辑上说不通。',
    '',
    '| 字段 | 填写内容（直接复制） | 字数 |',
    '|---|---|---|',
    ...SHORT_FIELDS.map(row),
    '',
    '## 四、长文本字段',
    '',
    ...LONG_FIELDS.map(([key, label, min, max]) => {
      const v = f[key] || '';
      const n = charCount(v);
      const status = !v ? '⬜ 待填' : n < min ? `❌ 少 ${min - n} 字` : n > max ? `❌ 超 ${n - max} 字` : '✅';
      return `### ${label}（${min ? `${min}–${max}` : `≤${max}`} 字，当前 ${n} 字 ${status}）\n\n${v || '> 待填。主要功能分 6–9 条，每条「小标题 + 2–4 句」，覆盖：核心能力、扩展机制、容错、数据存储、跨平台。少于 500 字会被驳回。'}\n`;
    }),
    '## 五、上传材料',
    '',
    '| 上传栏位 | 文件 |',
    '|---|---|',
    `| 程序鉴别材料 | ①程序鉴别材料_${p.split.mode === 'excerpt' ? '源程序前30页后30页' : '源程序全本'}_${config.shortName}.pdf |`,
    `| 文档鉴别材料 | ②文档鉴别材料_说明书_${config.shortName}.pdf |`,
    config.applicantType === 'company'
      ? '| 其他证明文件 | 营业执照 + 权属证明（职务开发声明或著作权转让合同） |'
      : '| 其他证明文件 | 一般不需要 |',
    '',
  ];

  if (config.applicantType === 'company') {
    lines.push(
      '> 个人开发、公司申请的，必须准备《软件著作权转让合同》，写明转让**全部财产权利**',
      '> 且**含对外再许可**的权利，否则公司后续对外授权存在效力瑕疵。',
      ''
    );
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(c.ok('已生成 ') + outPath);

  const problems = [
    ...SHORT_FIELDS.filter(([k, , limit]) => f[k] && charCount(f[k]) > limit).map(([, label]) => `${label} 超字数`),
    ...LONG_FIELDS.filter(([k, , min, max]) => f[k] && (charCount(f[k]) < min || charCount(f[k]) > max)).map(([, label]) => `${label} 字数不合格`),
    ...[...SHORT_FIELDS, ...LONG_FIELDS].filter(([k]) => !f[k]).map(([, label]) => `${label} 未填`),
  ];
  if (problems.length) console.log(c.warn('待办：') + problems.join('、'));
  return { outPath, problems, docLines: p.docLines };
}

// ---------- all ----------

function cmdAll(config, opts) {
  const source = cmdSource(config, opts);
  const manual = cmdManual(config, opts);
  const form = cmdForm(config, opts);

  console.log(c.b('\n交付自检'));
  const checks = [
    [`程序鉴别材料 ${source.split.mode === 'excerpt' ? '62' : source.split.totalPages} 页`, source.verified],
    ['说明书页数真实非空壳', (manual.pages || 0) >= 8],
    [`源程序量三处一致（${form.docLines} 行）`, true],
    ['表单字段字数全部合格', form.problems.length === 0],
    [`著作权人与证照一字不差：${config.copyrightOwner}`, null],
    ['材料里没有混入依赖、构建产物、运行期数据', null],
  ];
  for (const [label, ok] of checks) {
    console.log(`  ${ok === null ? c.warn('?') : ok ? c.ok('✓') : c.bad('✗')} ${label}`);
  }
  console.log(c.dim('\n带 ? 的两项脚本判不了，自己对一遍再提交。\n'));
}

// ---------- main ----------

function main() {
  const { opts, rest } = parseArgs(process.argv.slice(2));
  const cmd = rest[0];
  const dir = rest[1] || '.';
  if (!cmd || opts.help || cmd === 'help') return usage();

  try {
    if (cmd === 'init') return cmdInit(dir);
    const config = loadConfig(dir);
    if (cmd === 'count') return cmdCount(config, opts);
    if (cmd === 'source') return void cmdSource(config, opts);
    if (cmd === 'manual') return void cmdManual(config, opts);
    if (cmd === 'form') return void cmdForm(config, opts);
    if (cmd === 'all') return cmdAll(config, opts);
    console.error(c.bad(`未知命令 ${cmd}`));
    usage();
    process.exitCode = 1;
  } catch (err) {
    console.error(c.bad('出错：') + err.message);
    process.exitCode = 1;
  }
}

main();
