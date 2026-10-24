import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = path.join(root, 'scripts/prepare-templates.mjs');
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('工作副本逐字节保留两份原模板，且不导出 PDF', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ruanzhu-template-'));
  try {
    const result = run('--name', '门店管理软件', '--version', 'V2.1', '--out', out);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fs.readdirSync(out).sort(), ['门店管理软件V2.1_使用说明书.doc', '门店管理软件V2.1_源程序.doc']);
    for (const [template, suffix] of [['source-template.doc', '源程序'], ['manual-template.doc', '使用说明书']]) {
      assert.deepEqual(fs.readFileSync(path.join(out, `门店管理软件V2.1_${suffix}.doc`)), fs.readFileSync(path.join(root, 'templates', template)));
    }
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('重跑不覆盖已填写文件，也不创建另一份半成品', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ruanzhu-template-'));
  try {
    const existing = path.join(out, '测试V1.0_使用说明书.doc');
    fs.writeFileSync(existing, '用户已经填写的内容');
    const result = run('--name', '测试', '--version', 'V1.0', '--out', out);
    assert.notEqual(result.status, 0);
    assert.equal(fs.readFileSync(existing, 'utf8'), '用户已经填写的内容');
    assert.equal(fs.readdirSync(out).length, 1);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('名称已带版本时不重复添加版本', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ruanzhu-template-'));
  try {
    assert.equal(run('--name', '测试V1.0', '--version', 'V1.0', '--out', out).status, 0);
    assert.ok(fs.existsSync(path.join(out, '测试V1.0_源程序.doc')));
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('缺少必要信息或名称含路径时拒绝写入', () => {
  assert.notEqual(run('--name', '测试').status, 0);
  const out = path.join(os.tmpdir(), `ruanzhu-rejected-${process.pid}`);
  assert.notEqual(run('--name', '../错误名称', '--version', 'V1.0', '--out', out).status, 0);
  assert.ok(!fs.existsSync(out));
});
