#!/usr/bin/env node
// Create editable working copies. Filling and PDF export happen in WPS/Word.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opts = {};
try {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      console.log('用法：node prepare-templates.mjs --name 软件全称 --version V1.0 --out /输出目录\n仅复制 Word 模板，不填写正文、不生成 PDF，不覆盖已有文件。');
      process.exit(0);
    }
    const key = args[i];
    if (!['--name', '--version', '--out'].includes(key) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error(`无效或缺少值的选项：${key}`);
    }
    opts[key.slice(2)] = args[++i].trim();
  }
  if (!opts.name || !opts.version || !opts.out) throw new Error('必须提供 --name、--version 和 --out');
  for (const key of ['name', 'version']) {
    if (/[<>:"/\\|?*\x00-\x1f]/.test(opts[key]) || /[. ]$/.test(opts[key])) {
      throw new Error(`${key} 含有文件名不支持的字符，请使用正常的软件名称或版本号`);
    }
  }
  const templates = fileURLToPath(new URL('../templates/', import.meta.url));
  const output = path.resolve(opts.out);
  if (output === path.resolve(templates)) throw new Error('输出目录不能是原模板目录');
  const label = opts.name.endsWith(opts.version) ? opts.name : opts.name + opts.version;
  const jobs = [
    ['source-template.doc', `${label}_源程序.doc`],
    ['manual-template.doc', `${label}_使用说明书.doc`],
  ].map(([input, name]) => ({ input: path.join(templates, input), output: path.join(output, name) }));
  for (const job of jobs) {
    if (!fs.statSync(job.input).isFile()) throw new Error(`缺少模板：${job.input}`);
    if (fs.existsSync(job.output)) throw new Error(`文件已存在，不会覆盖：${job.output}`);
  }
  fs.mkdirSync(output, { recursive: true });
  for (const job of jobs) {
    fs.copyFileSync(job.input, job.output, fs.constants.COPYFILE_EXCL);
    console.log(`已复制模板：${job.output}`);
  }
  console.log('当前仅为模板工作副本。请在 WPS／Word 中填写真实资料、替换示例代码与截图，核对后再导出 PDF。');
} catch (error) {
  console.error(`出错：${error.message}`);
  process.exitCode = 1;
}
