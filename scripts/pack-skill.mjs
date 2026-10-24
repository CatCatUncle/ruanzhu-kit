#!/usr/bin/env node
// Package the Word template workflow; keep the legacy PDF renderer and GitHub metadata out.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.argv[2] || path.join(root, '../ruanzhu-kit.skill.zip'));
const resources = [
  'SKILL.md', 'LICENSE', 'templates/source-template.doc', 'templates/manual-template.doc',
  'docs/template-workflow.md', 'scripts/prepare-templates.mjs',
];
const files = [];

function collect(relative) {
  const full = path.join(root, relative);
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) throw new Error(`技能包不支持符号链接：${relative}`);
  if (stat.isDirectory()) {
    if (relative.split('/').length > 1) throw new Error(`目录层级超限：${relative}`);
    for (const name of fs.readdirSync(full).sort()) collect(`${relative}/${name}`);
  } else if (stat.isFile()) {
    if (relative.split('/').length > 2) throw new Error(`目录层级超限：${relative}`);
    if (path.resolve(full) === output) throw new Error('输出 ZIP 不能放进技能资源目录');
    files.push({ name: relative, data: fs.readFileSync(full) });
  } else {
    throw new Error(`技能包不支持此文件类型：${relative}`);
  }
}
for (const resource of resources) collect(resource);

// This importer requires bilingual metadata in addition to name/description.
const skill = files.find((file) => file.name === 'SKILL.md').data.toString('utf8');
const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
if (!frontmatter) throw new Error('SKILL.md 缺少 YAML frontmatter');
const required = ['name', 'description', 'version', 'display_name', 'display_name_en', 'description_zh', 'description_en'];
for (const field of required) {
  const raw = frontmatter.match(new RegExp(`^${field}:[ \\t]*(.*)$`, 'm'))?.[1].trim();
  if (!raw || /^(?:""|''|null|~|\[\]|\{\}|#.*)$/i.test(raw)) {
    throw new Error(`SKILL.md frontmatter 缺少非空字段：${field}`);
  }
}

// Standard ZIP, stored without compression. No npm or system ZIP dependency.
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const local = [], central = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(file.name, 'utf8');
  const checksum = crc32(file.data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6); // UTF-8 filenames
  header.writeUInt16LE(0x21, 12); // 1980-01-01; reproducible archive
  header.writeUInt32LE(checksum, 14);
  header.writeUInt32LE(file.data.length, 18);
  header.writeUInt32LE(file.data.length, 22);
  header.writeUInt16LE(name.length, 26);
  local.push(header, name, file.data);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x800, 8);
  entry.writeUInt16LE(0x21, 14);
  entry.writeUInt32LE(checksum, 16);
  entry.writeUInt32LE(file.data.length, 20);
  entry.writeUInt32LE(file.data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += header.length + name.length + file.data.length;
}
const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.concat([...local, directory, end]));
console.log(`已生成 ${output}（${files.length} 个文件，最多两级目录，SKILL.md 位于 ZIP 根目录）`);
