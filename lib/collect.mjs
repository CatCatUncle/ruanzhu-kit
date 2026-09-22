// 清点可提交的源代码。
//
// 审查员会把你申报的「源程序量」和 PDF 里看到的东西对着看，所以这一步只能收
// 真正自己写的代码：依赖、构建产物、运行期生成的文件、AI 写出来的中间产物，
// 全部排掉。行数虚高是驳回的高频原因。

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_EXCLUDE_DIRS = [
  '.git', '.svn', '.hg', '.idea', '.vscode', '.claude',
  'node_modules', 'vendor', 'bower_components', 'Pods',
  'dist', 'build', 'out', 'target', 'coverage', '.next', '.nuxt', '.output',
  '__pycache__', '.venv', 'venv', 'env', '.tox', '.mypy_cache', '.pytest_cache',
  'logs', 'log', 'tmp', 'temp', 'cache', '.cache',
  'workspace', 'workspaces', 'output', 'outputs', 'data', 'fixtures', 'testdata',
];

export const DEFAULT_EXCLUDE_FILES = [
  '*.min.js', '*.min.css', '*.map', '*-lock.json', '*.lock',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock', 'Cargo.lock',
  '*.d.ts', '*.pb.go', '*_pb2.py', '*.generated.*',
];

export const DEFAULT_EXTENSIONS = [
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte',
  'py', 'java', 'kt', 'go', 'rs', 'rb', 'php', 'cs', 'swift', 'm', 'mm',
  'c', 'h', 'cc', 'cpp', 'hpp', 'sh', 'sql', 'css', 'scss', 'less', 'html',
];

function globToRegExp(pattern) {
  const esc = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = esc.replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + body + '$');
}

function matchesAny(value, patterns) {
  return patterns.some((p) => (p.includes('*') || p.includes('?') ? globToRegExp(p).test(value) : value === p));
}

/** 递归收集符合条件的源码文件，返回仓库相对路径列表。 */
export function walk(root, { excludeDirs, excludeFiles, extensions, maxFileBytes = 2 * 1024 * 1024 }) {
  const found = [];
  const visit = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') && !excludeDirs.includes(entry.name)) continue;
        if (matchesAny(entry.name, excludeDirs) || matchesAny(rel, excludeDirs)) continue;
        visit(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (!extensions.includes(ext)) continue;
      if (matchesAny(entry.name, excludeFiles) || matchesAny(rel, excludeFiles)) continue;
      let stat;
      try { stat = fs.statSync(abs); } catch { continue; }
      if (stat.size > maxFileBytes) continue; // 超大文件基本是数据或压缩产物
      found.push(rel);
    }
  };
  visit(root);
  return found;
}

/**
 * 按「入口 → 核心 → 能力层 → 配置 → 其他」排序。
 * 审查员翻的是一份连贯的工程，不是一堆按字母表打乱的文件。
 */
export function orderFiles(files, order = []) {
  const rank = (rel) => {
    for (let i = 0; i < order.length; i++) {
      const p = order[i];
      if (rel === p || rel.startsWith(p.replace(/\/$/, '') + '/') || (p.includes('*') && globToRegExp(p).test(rel))) return i;
    }
    return order.length;
  };
  return [...files].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    const da = a.split('/').length, db = b.split('/').length;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });
}

/** 把选中的文件拼成一份连续文档，返回行数组与统计。 */
export function collect(root, config) {
  const excludeDirs = [...DEFAULT_EXCLUDE_DIRS, ...(config.exclude || [])];
  const excludeFiles = [...DEFAULT_EXCLUDE_FILES, ...(config.excludeFiles || [])];
  const extensions = (config.extensions || DEFAULT_EXTENSIONS).map((e) => e.replace(/^\./, '').toLowerCase());

  const files = orderFiles(walk(root, { excludeDirs, excludeFiles, extensions }), config.order || []);

  const lines = [];
  const perFile = [];
  let codeLines = 0;
  for (const rel of files) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n?/g, '\n');
    const body = text.split('\n');
    if (body.length && body[body.length - 1] === '') body.pop(); // 去掉末尾换行造成的空行
    if (!body.length) continue;
    if (config.fileHeaders !== false) {
      if (lines.length) lines.push('');
      lines.push(`/* ==================== ${rel} ==================== */`);
    }
    lines.push(...body);
    codeLines += body.length;
    perFile.push({ path: rel, lines: body.length });
  }

  return { files: perFile, lines, codeLines, docLines: lines.length };
}
