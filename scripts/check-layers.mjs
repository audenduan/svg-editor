#!/usr/bin/env node
// 分层依赖检查：把"内核不依赖插件、插件不依赖内核内部"变成可执行的约束。
//
// 规则：
//   R1 src/core, src/app, src/render, src/io 之间只允许 core ← app/render/io 的方向；
//   R2 src/core 不得 import src/{app,cli,render,host}；
//   R3 plugins/** 不得 import src/{app,cli,host}（只能用内核公开接口 + 领域模型）；
//   R4 除装配点外，src/** 不得 import plugins/**；装配点只有两个入口文件
//      （src/main-code.ts 是方式 A 的刻意装配处，src/main.ts 走配置装配故不需要）。
// 零依赖，规则用字符串前缀表达，报错给出文件与行号。
import fs from 'node:fs';
import path from 'node:path';

/** 允许 import 具体插件的文件：方式 A 的显式装配入口。 */
const ALLOWED_PLUGIN_IMPORTERS = new Set(['src/main-code.ts']);

const repoRoot = path.resolve(import.meta.dirname, '..');
const violations = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'vscode-svg') continue;
      result.push(...walk(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      result.push(full);
    }
  }
  return result;
}

const files = [...walk(path.join(repoRoot, 'src')), ...walk(path.join(repoRoot, 'plugins'))];

const IMPORT = /(?:^|\n)\s*(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g;

/** 把相对 import 解析成相对仓库根的 POSIX 风格路径。 */
function resolveSpecifier(file, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.dirname(fs.existsSync(file) ? path.join(repoRoot, path.relative(repoRoot, file)) : file);
  return path.relative(repoRoot, path.resolve(base, specifier)).replace(/\\/g, '/');
}

for (const file of files) {
  const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
  const source = fs.readFileSync(file, 'utf8');
  const isPlugin = rel.startsWith('plugins/');
  const isCore = rel.startsWith('src/core/');
  for (const match of source.matchAll(IMPORT)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const target = resolveSpecifier(file, specifier);
    if (target === null) continue;

    // R2：内核不得反向依赖上层
    if (isCore && /^src\/(app|cli|render|host)\//.test(target)) {
      violations.push(`${rel}: 内核反向依赖上层 → ${target}`);
    }
    // R3：插件不得碰装配层
    if (isPlugin && /^src\/(app|cli|host)\//.test(target)) {
      violations.push(`${rel}: 插件依赖装配层 → ${target}`);
    }
    // R4：除装配点外，src 不得 import 具体插件
    if (!isPlugin && target.startsWith('plugins/') && !ALLOWED_PLUGIN_IMPORTERS.has(rel)) {
      violations.push(`${rel}: src 依赖具体插件 → ${target}`);
    }
  }
}

if (violations.length > 0) {
  console.error('check-layers: FAILED');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log(`check-layers: ok (${files.length} files, 0 violations)`);