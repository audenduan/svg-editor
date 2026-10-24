#!/usr/bin/env node
/**
 * 依赖纪律检查（PJ1 需求：「简单问题，不要引入依赖」）。
 *
 * 两条规则：
 * 1. package.json 的 dependencies/devDependencies 只允许类型检查所需的两个包
 *    （@types/node、typescript），运行期零第三方依赖；
 * 2. 源码与测试的 import/export 只允许相对路径、`node:` 前缀或 Node 内置模块。
 *
 * 任何违规以非 0 退出，让 `npm test` 和 CI 守住这条纪律。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_PACKAGES = new Set(['@types/node', 'typescript']);
const violations = [];

// ---- 规则 1：package.json 依赖白名单 ----
const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const declared = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
};
for (const name of Object.keys(declared)) {
  if (!ALLOWED_PACKAGES.has(name)) {
    violations.push(`forbidden dependency in package.json: ${name}`);
  }
}

// ---- 规则 2：import 只允许相对路径 / node: / 内置模块 ----
const builtin = new Set(builtinModules);
const importPattern = /\b(?:import|export)\s+(?:type\s+)?.*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function walk(dir, list = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, list);
    } else if (entry.name.endsWith('.ts')) {
      list.push(full);
    }
  }
  return list;
}

for (const file of [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'tests'))]) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    if (
      specifier.startsWith('.') ||
      specifier.startsWith('node:') ||
      builtin.has(specifier)
    ) {
      continue;
    }
    violations.push(`${path.relative(ROOT, file).replaceAll('\\', '/')}: forbidden import "${specifier}"`);
  }
}

if (violations.length > 0) {
  console.error('check-dependencies: dependency discipline violated');
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}
console.log('check-dependencies: ok (zero runtime dependencies)');
