#!/usr/bin/env node
// 由 git 历史生成指标（不接受手填）：行数与圈复杂度增量，按「内核 / 装配处 / 插件」拆分。
// 用法：node scripts/metrics.mjs [--base final] [--head WORKTREE]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
};
const baseRev = argOf('--base', 'final');
const headRev = argOf('--head', 'WORKTREE');

const git = (gitArgs) =>
  execFileSync('git', gitArgs, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** 路径分类：CLI 范围按三类拆分；VSCode 扩展单独列出，不混入。 */
function classify(file) {
  if (file.startsWith('vscode-svg/')) return 'vscode';
  if (file.startsWith('plugins/')) return 'plugin';
  if (/^(src\/core|src\/app|src\/io|src\/render)\//.test(file)) return 'kernel';
  if (/^(src\/cli|src\/host)\//.test(file) || file === 'src/main.ts' || file.startsWith('scripts/')) {
    return 'assembly';
  }
  return 'other';
}

const isSource = (file) => file.endsWith('.ts') && !file.endsWith('.d.ts') && !file.includes('/dist/');

function listFiles(rev) {
  if (rev === 'WORKTREE') {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return out.split('\n').filter(Boolean);
  }
  return git(['ls-tree', '-r', '--name-only', rev]).split('\n').filter(Boolean);
}

function readFile(rev, file) {
  if (rev === 'WORKTREE') return fs.readFileSync(path.join(repoRoot, file), 'utf8');
  return git(['show', `${rev}:${file}`]);
}

/** 简化的圈复杂度：统计每个判断/循环分支点。用于增量对比，绝对值不作质量指标。 */
function decisionPoints(source) {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/`[^`]*`/g, '""');
  const patterns = [/\bif\b/g, /\belse\s+if\b/g, /\bfor\b/g, /\bwhile\b/g, /\bcase\b/g, /\bcatch\b/g, /\?\?/g, /&&/g, /\|\|/g];
  return patterns.reduce((sum, pattern) => sum + (stripped.match(pattern)?.length ?? 0), 0);
}

function measure(rev) {
  const files = listFiles(rev).filter(isSource);
  const buckets = {};
  const detail = [];
  for (const file of files) {
    const source = readFile(rev, file);
    const lines = source.split('\n').length;
    const category = classify(file);
    buckets[category] = buckets[category] ?? { files: 0, lines: 0, decisions: 0 };
    buckets[category].files += 1;
    buckets[category].lines += lines;
    buckets[category].decisions += decisionPoints(source);
    detail.push({ file, category, lines, decisions: decisionPoints(source) });
  }
  return { buckets, detail };
}

const base = measure(baseRev);
const head = measure(headRev);

const categories = ['kernel', 'assembly', 'plugin', 'vscode', 'other'];
const label = { kernel: '内核', assembly: '装配处', plugin: '插件', vscode: 'VSCode 扩展', other: '其他' };
const delta = (a, b) => (b === undefined ? '-' : `${b - a >= 0 ? '+' : ''}${b - a}`);

const lines = [];
lines.push('# 代码指标（由 scripts/metrics.mjs 生成，勿手改）');
lines.push('');
lines.push(`- 基线（base）：\`${baseRev}\``);
lines.push(`- 对比（head）：\`${headRev}\``);
lines.push(`- 生成命令：\`node scripts/metrics.mjs --base ${baseRev} --head ${headRev}\``);
lines.push('');
lines.push('## 按类别：行数');
lines.push('');
lines.push('| 类别 | 基线行数 | 当前行数 | 增量 |');
lines.push('|---|---|---|---|');
for (const category of categories) {
  const b = base.buckets[category];
  const h = head.buckets[category];
  if (b === undefined && h === undefined) continue;
  lines.push(`| ${label[category]} | ${b?.lines ?? 0} | ${h?.lines ?? 0} | ${delta(b?.lines ?? 0, h?.lines ?? 0)} |`);
}
lines.push('');
lines.push('## 按类别：文件数');
lines.push('');
lines.push('| 类别 | 基线 | 当前 | 增量 |');
lines.push('|---|---|---|---|');
for (const category of categories) {
  const b = base.buckets[category];
  const h = head.buckets[category];
  if (b === undefined && h === undefined) continue;
  lines.push(`| ${label[category]} | ${b?.files ?? 0} | ${h?.files ?? 0} | ${delta(b?.files ?? 0, h?.files ?? 0)} |`);
}
lines.push('');
lines.push('## 按类别：圈复杂度增量（判断点计数）');
lines.push('');
lines.push('| 类别 | 基线 | 当前 | 增量 |');
lines.push('|---|---|---|---|');
for (const category of categories) {
  const b = base.buckets[category];
  const h = head.buckets[category];
  if (b === undefined && h === undefined) continue;
  lines.push(`| ${label[category]} | ${b?.decisions ?? 0} | ${h?.decisions ?? 0} | ${delta(b?.decisions ?? 0, h?.decisions ?? 0)} |`);
}
lines.push('');
lines.push('## 文件清单与职责（当前）');
lines.push('');
lines.push('| 文件 | 类别 | 行数 | 判断点 |');
lines.push('|---|---|---|---|');
for (const item of head.detail.sort((a, b) => (a.category === b.category ? a.file.localeCompare(b.file) : a.category.localeCompare(b.category)))) {
  lines.push(`| \`${item.file}\` | ${label[item.category]} | ${item.lines} | ${item.decisions} |`);
}
lines.push('');

const outDir = path.join(repoRoot, 'docs', 'metrics');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'metrics.md'), `${lines.join('\n')}\n`, 'utf8');
fs.writeFileSync(
  path.join(outDir, 'metrics.json'),
  `${JSON.stringify({ base: baseRev, head: headRev, baseBuckets: base.buckets, headBuckets: head.buckets }, null, 2)}\n`,
  'utf8',
);
console.log(`metrics written: docs/metrics/metrics.md (base=${baseRev}, head=${headRev})`);
for (const category of categories) {
  const b = base.buckets[category]?.lines ?? 0;
  const h = head.buckets[category]?.lines ?? 0;
  if (b !== 0 || h !== 0) console.log(`  ${label[category]}: ${b} -> ${h}`);
}