// 表单里能从机器和项目文件读出来的六项，自动给一个初值。
//
// 开发环境看的是跑这条命令的这台机器（也就是写代码的机器），
// 运行环境看项目的依赖清单。推断不准的地方宁可写得保守，让人核对一眼就行。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const read = (dir, name) => {
  try { return fs.readFileSync(path.join(dir, name), 'utf8'); } catch { return ''; }
};
const has = (dir, name) => fs.existsSync(path.join(dir, name));

/** Darwin 内核主版本号 → macOS 版本（20→11 … 24→15，25 起跳到 26）。 */
export function macosVersion(darwinRelease) {
  const major = parseInt(darwinRelease, 10);
  if (!major) return '';
  if (major >= 25) return String(major + 1);
  if (major >= 20) return String(major - 9);
  return `10.${major - 4}`;
}

export function osName(platform = os.platform(), release = os.release()) {
  if (platform === 'darwin') return `macOS ${macosVersion(release)}`.trim();
  if (platform === 'win32') {
    const build = parseInt(release.split('.')[2] || '0', 10);
    return build >= 22000 ? 'Windows 11' : 'Windows 10';
  }
  if (platform === 'linux') {
    const m = read('/etc', 'os-release').match(/^PRETTY_NAME="?([^"\n]+)"?/m);
    return m ? m[1] : 'Linux';
  }
  return platform;
}

const gb = (bytes) => {
  const n = bytes / 1024 ** 3;
  // 内存条和硬盘都是 2 的幂或常见档位，就近取整成人会写的数字
  const steps = [4, 8, 16, 18, 24, 32, 36, 48, 64, 96, 128, 256, 512, 1024, 2048, 4096];
  return steps.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
};
const diskText = (g) => (g >= 1024 ? `${g / 1024}TB` : `${g}GB`);

export function cpuText(model = os.cpus()[0]?.model || '', cores = os.cpus().length) {
  const name = model
    .replace(/\(R\)|\(TM\)|\bCPU\b|\bProcessor\b|\b\d+-Core\b|with Radeon.*$|@.*$/gi, '')
    .replace(/\s+/g, ' ').trim();
  // 服务器型号动辄三四十个字符，塞不进 50 字的格子，就只写核数
  return name && name.length <= 28 ? `${name} 处理器` : `${cores} 核处理器`;
}

function diskSize(dir) {
  try {
    const s = fs.statfsSync(dir);
    return gb(s.blocks * s.bsize);
  } catch { return 0; }
}

/** 从项目文件看出用了什么语言、框架、数据库。 */
export function detectStack(dir) {
  const pkg = (() => { try { return JSON.parse(read(dir, 'package.json')); } catch { return null; } })();
  const deps = pkg ? Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }) : [];
  const dep = (re) => deps.some((d) => re.test(d));
  const gomod = read(dir, 'go.mod');
  const py = read(dir, 'requirements.txt') + read(dir, 'pyproject.toml');
  const java = read(dir, 'pom.xml') + read(dir, 'build.gradle') + read(dir, 'build.gradle.kts');
  const all = [deps.join(' '), gomod, py, java].join('\n');

  const s = { langs: [], web: false, desktop: false, mobile: false, db: [], tools: [] };
  if (pkg) s.langs.push('node');
  if (gomod) s.langs.push('go');
  if (py) s.langs.push('python');
  if (java) s.langs.push('java');
  if (has(dir, 'Cargo.toml')) s.langs.push('rust');
  if (has(dir, 'pubspec.yaml')) { s.langs.push('flutter'); s.mobile = true; }
  if (has(dir, 'project.yml') || fs.readdirSync(dir).some((f) => f.endsWith('.xcodeproj'))) { s.langs.push('swift'); s.mobile = true; }

  if (pkg) {
    s.nodeMajor = (pkg.engines?.node || '').match(/\d+/)?.[0];
    s.ts = dep(/^typescript$/) || has(dir, 'tsconfig.json');
    s.web = dep(/^(next|react|react-dom|vue|nuxt|svelte|@sveltejs\/kit|vite|@angular\/core)$/);
    s.desktop = dep(/^(electron|@tauri-apps\/api)$/);
    s.mobile = s.mobile || dep(/^(react-native|expo|@dcloudio\/uni-app)$/);
    s.framework = ['next', 'nuxt', 'vue', 'react', 'svelte', 'electron', 'express', 'koa', 'nestjs']
      .find((f) => dep(new RegExp(`^(@nestjs/core|${f})$`)));
    s.server = ['express', 'koa', 'nestjs'].includes(s.framework);
  }
  if (/gin-gonic|labstack\/echo|gofiber|django|flask|fastapi|spring-boot/.test(all)) s.server = true;
  if (/\b(pg|postgres|pgx|psycopg|prisma|postgresql)\b/i.test(all)) s.db.push('PostgreSQL');
  if (/\b(mysql2?|go-sql-driver\/mysql|pymysql|mysql-connector)\b/i.test(all)) s.db.push('MySQL');
  if (/sqlite/i.test(all)) s.db.push('SQLite');
  if (/\b(mongodb|mongoose|pymongo)\b/i.test(all)) s.db.push('MongoDB');
  if (/\b(redis|ioredis|go-redis)\b/i.test(all)) s.db.push('Redis');
  s.db = [...new Set(s.db)];
  if (has(dir, '.git')) s.tools.push('Git');
  s.goVersion = gomod.match(/^go (\d+\.\d+)/m)?.[1];
  s.javaVersion = java.match(/<(?:java\.version|maven\.compiler\.source)>(\d+)</)?.[1];
  s.pyVersion = py.match(/requires-python\s*=\s*"[^\d]*(\d+\.\d+)/)?.[1];
  return s;
}

function ide(dir, s) {
  if (has(dir, '.vscode')) return 'Visual Studio Code';
  if (s.langs.includes('swift')) return 'Xcode';
  if (s.langs.includes('go')) return 'GoLand';
  if (s.langs.includes('java')) return 'IntelliJ IDEA';
  if (s.langs.includes('python') && !s.langs.includes('node')) return 'PyCharm';
  if (s.langs.includes('flutter')) return 'Android Studio';
  if (has(dir, '.idea')) return 'WebStorm';
  return 'Visual Studio Code';
}

/**
 * 给能推断的字段一个初值。只填这六项；开发目的、面向行业、主要功能、技术特点
 * 得读懂软件本身才写得出来，留给人（或调这个工具的 Agent）写。
 */
export function inferForm(dir) {
  const s = detectStack(dir);
  const mem = gb(os.totalmem());
  const disk = diskSize(dir);
  const out = {};

  out.devHardware = [cpuText(), `${mem}GB 内存`, disk ? `${diskText(disk)} 硬盘` : ''].filter(Boolean).join('，');
  if (Array.from(out.devHardware).length > 50) out.devHardware = `${os.cpus().length} 核处理器，${mem}GB 内存`;
  out.devOS = osName();

  const toolchain = [];
  if (s.langs.includes('node')) toolchain.push(`Node.js ${process.versions.node.split('.')[0]}`);
  if (s.ts) toolchain.push('TypeScript');
  if (s.langs.includes('go')) toolchain.push(`Go ${s.goVersion || ''}`.trim());
  if (s.langs.includes('java')) toolchain.push(`JDK ${s.javaVersion || ''}`.trim());
  if (s.langs.includes('python')) toolchain.push(`Python ${s.pyVersion || '3'}`);
  if (s.langs.includes('rust')) toolchain.push('Rust');
  if (s.langs.includes('flutter')) toolchain.push('Flutter');
  out.devTools = [...toolchain, ide(dir, s), ...s.tools].join('、');

  // 运行环境要比开发机低一档，写最低配置
  const runMem = Math.max(2, Math.min(8, mem / 4));
  if (s.mobile) out.runHardware = `手机内存 ${Math.min(runMem, 4)}GB 及以上，可用存储空间 500MB 以上`;
  else if ((s.web || s.server) && !s.desktop) out.runHardware = `服务器 2 核 CPU、${runMem}GB 内存、20GB 硬盘；客户端普通电脑或手机`;
  else out.runHardware = `双核处理器，${runMem}GB 内存，1GB 以上可用硬盘空间`;

  if (s.mobile) out.runPlatform = s.langs.includes('swift') ? 'iOS 16 及以上' : 'Android 8.0 及以上、iOS 14 及以上';
  else if (s.desktop) out.runPlatform = 'Windows 10 及以上、macOS 12 及以上';
  else if (s.web || s.server) out.runPlatform = '服务端 Linux；客户端用浏览器访问，电脑和手机均可';
  else out.runPlatform = 'Windows 10 及以上、macOS 12 及以上、Linux';

  const support = [];
  if (s.langs.includes('node') && !s.desktop) support.push(`Node.js ${s.nodeMajor || 18} 及以上`);
  if (s.langs.includes('python')) support.push(`Python ${s.pyVersion || '3.9'} 及以上`);
  if (s.langs.includes('java')) support.push(`JRE ${s.javaVersion || 11} 及以上`);
  support.push(...s.db);
  if (s.web || s.server) support.push('Chrome、Edge 等浏览器');
  out.runtimeSupport = support.length ? support.join('，') : '无需额外支撑软件';

  return out;
}

export const INFERRED_FIELDS = ['devHardware', 'runHardware', 'devOS', 'devTools', 'runPlatform', 'runtimeSupport'];
