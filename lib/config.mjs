// 配置加载与校验。
//
// 一份 ruanzhu.config.json 同时喂给三处产物（源程序 PDF、说明书 PDF、表单清单），
// 软件名称、著作权人、版本号、源程序量在三处保持一致，靠的就是这里只有一个来源。

import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_NAME = 'ruanzhu.config.json';

export const DEFAULTS = {
  softwareName: '',
  shortName: '',
  version: 'V1.0',
  copyrightOwner: '',
  applicantType: 'company', // company | individual
  completedAt: '',
  publishedAt: '',
  sourceDir: '.',
  extensions: null,        // null = 用内置的常见源码后缀
  exclude: [],
  excludeFiles: [],
  order: [],
  fileHeaders: true,
  linesPerPage: 50,
  manual: 'ruanzhu/说明书.md',
  outDir: 'ruanzhu/out',
  form: {},
};

/** 50 字上限的表单项，超一个字就提交不了。 */
export const SHORT_FIELDS = [
  ['devHardware', '开发的硬件环境', 50],
  ['runHardware', '运行的硬件环境', 50],
  ['devOS', '开发该软件的操作系统', 50],
  ['devTools', '软件开发环境/开发工具', 50],
  ['runPlatform', '该软件的运行平台/操作系统', 50],
  ['runtimeSupport', '软件运行支撑环境/支持软件', 50],
  ['purpose', '开发目的', 50],
  ['industries', '面向领域/行业', 50],
];

export const LONG_FIELDS = [
  ['mainFunctions', '软件的主要功能', 500, 1300],
  ['techFeatures', '软件的技术特点', 0, 100],
];

export function charCount(s) {
  return Array.from((s || '').replace(/\s+/g, ' ').trim()).length;
}

export function loadConfig(dir) {
  const file = path.resolve(dir, CONFIG_NAME);
  if (!fs.existsSync(file)) {
    throw new Error(`没找到 ${CONFIG_NAME}（在 ${dir}）。先跑一次 \`ruanzhu init\` 生成模板。`);
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const config = { ...DEFAULTS, ...raw, form: { ...DEFAULTS.form, ...(raw.form || {}) } };
  config.projectDir = path.resolve(dir);
  config.shortName = config.shortName || config.softwareName;

  const missing = ['softwareName', 'copyrightOwner', 'completedAt'].filter((k) => !config[k]);
  if (missing.length) throw new Error(`${CONFIG_NAME} 缺少必填项：${missing.join('、')}`);
  if (config.applicantType === 'company' && /^(公司|集团)$/.test(config.copyrightOwner)) {
    throw new Error('著作权人要写营业执照上的全称，含行政区划和「有限公司」后缀。');
  }
  return config;
}

export function saveConfig(dir, config) {
  const file = path.resolve(dir, CONFIG_NAME);
  const { projectDir, ...rest } = config;
  fs.writeFileSync(file, JSON.stringify(rest, null, 2) + '\n', 'utf8');
  return file;
}
