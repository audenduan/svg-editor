#!/usr/bin/env node
// 双装配一致性判据：方式 A（改代码）与方式 B（改配置）跑同一份会话输入，逐字节比较输出。
//
// 用法：
//   npm run build
//   node scripts/compare-assembly.mjs                 # 跑 doc/transcript/*.txt 全部会话
//   node scripts/compare-assembly.mjs cli-3.txt       # 只跑指定会话
//
// 判据（任一不满足即退出码 1）：
//   1. 两种方式的 stdout 逐字节相同；
//   2. 退出码相同；
//   3. 输出非空（防止"两边都启动失败"也算相等）。
// 会话输入文件只含命令与 # 注释，不含 svg> 提示符或示例输出。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const transcriptDir = path.join(repoRoot, 'doc', 'transcript');
const only = process.argv[2];

/** 方式 A：代码里 import 插件的装配入口。 */
const MODE_A = ['dist/src/main-code.js'];
/** 方式 B：读根 plugins.config.json 的装配入口。 */
const MODE_B = ['dist/src/main.js', '--config', 'plugins.config.json'];

function run(mode, input) {
  const result = spawnSync(process.execPath, mode, {
    cwd: repoRoot,
    input,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function firstDifference(a, b) {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    if (a[i] !== b[i]) {
      return i;
    }
  }
  return a.length === b.length ? -1 : length;
}

const files = fs
  .readdirSync(transcriptDir)
  .filter((name) => name.endsWith('.txt'))
  .filter((name) => only === undefined || name === only)
  .sort();

if (files.length === 0) {
  console.error(`compare-assembly: 没有找到会话输入（${path.relative(repoRoot, transcriptDir)}）`);
  process.exit(1);
}

let failed = 0;
const tempArtifact = path.join(repoRoot, '.compare-tmp.svg');

for (const name of files) {
  const input = fs.readFileSync(path.join(transcriptDir, name));
  const a = run(MODE_A, input);
  const b = run(MODE_B, input);
  const trimmed = a.stdout.toString('utf8').trim();
  const diffAt = firstDifference(a.stdout, b.stdout);

  const problems = [];
  if (diffAt !== -1) {
    problems.push(`stdout 在第 ${diffAt} 字节起不同`);
  }
  if (a.status !== b.status) {
    problems.push(`退出码不同：A=${a.status} B=${b.status}`);
  }
  if (trimmed.length === 0) {
    problems.push('输出为空（可能是装配失败）');
  }

  if (problems.length === 0) {
    const lines = trimmed.split('\n').length;
    console.log(`ok   ${name}：${lines} 行输出逐字节相同（退出码 ${a.status}）`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}：${problems.join('；')}`);
    if (diffAt !== -1) {
      const from = Math.max(0, diffAt - 40);
      console.error(`  A: ${JSON.stringify(a.stdout.toString('utf8').slice(from, diffAt + 80))}`);
      console.error(`  B: ${JSON.stringify(b.stdout.toString('utf8').slice(from, diffAt + 80))}`);
    }
  }
  fs.rmSync(tempArtifact, { force: true });
}

if (failed > 0) {
  console.error(`compare-assembly: FAILED（${failed}/${files.length} 个会话不一致）`);
  process.exit(1);
}
console.log(`compare-assembly: ok（${files.length} 个会话，两种装配方式逐字节相同）`);