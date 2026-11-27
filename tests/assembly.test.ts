import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..', '..');

/** 启动横幅的首行片段：用来判断"是否真的进入了 REPL"。 */
const BANNER_MARKER = 'svg-editor 0.1';

interface CliRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number;
}

/** 用真实 CLI 进程跑一段脚本：等价性必须按用户可见字节比较。 */
function runCli(entry: string, script: string, extraArgs: readonly string[] = []): CliRun {
  try {
    const stdout = execFileSync(process.execPath, [path.join(repoRoot, 'dist', 'src', entry), ...extraArgs], {
      cwd: repoRoot,
      encoding: 'utf8',
      input: script,
    });
    return { stdout, stderr: '', status: 0 };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? '', status: failure.status ?? 1 };
  }
}

const SCRIPT = [
  'init 400 200',
  'create box n1 10 20 100 40 start',
  'create rect r 0 0 5 5',
  'stats',
  'tree',
  'help',
].join('\n');

test('两种装配方式：方式 A（改代码）与方式 B（改配置）输出逐字节一致', () => {
  const byCode = runCli('main-code.js', SCRIPT);
  const byConfig = runCli('main.js', SCRIPT, ['--config', 'config/plugins.json']);
  assert.equal(byConfig.status, 0);
  assert.equal(byCode.status, 0);
  assert.equal(byConfig.stdout, byCode.stdout, '改代码与改配置必须产出相同字节');
  assert.ok(byCode.stdout.includes('box#n1 created'), '插件确实生效');
  assert.ok(byCode.stdout.includes('box#n1 (box)'), '装饰器确实生效');
  assert.ok(byCode.stdout.includes('(total 3, containers 1)'), 'stats 确实生效');
});

test('两种装配方式：只含纯内置命令的脚本同样逐字节一致', () => {
  const script = ['init 100 100', 'create rect a 0 0 10 10', 'move a 5 5', 'tree', 'show a', 'undo'].join('\n');
  const byCode = runCli('main-code.js', script);
  const byConfig = runCli('main.js', script, ['--config', 'config/plugins.json']);
  assert.equal(byConfig.stdout, byCode.stdout);
  assert.equal(byCode.stdout.includes('(box)'), false, '纯内置场景不应出现插件痕迹');
});

test('方式 B：配置非法时非零退出并指出哪份配置错了', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'svgframe-badcfg-'));
  try {
    const bad = path.join(dir, 'bad.json');
    writeFileSync(bad, '{"version":1}', 'utf8');
    const run = runCli('main.js', 'canvas\n', ['--config', bad]);
    assert.notEqual(run.status, 0, '非法配置应非零退出');
    // CLI 的错误行与普通输出走同一个输出端口（Phase 1 起的约定），因此在 stdout
    const output = run.stdout + run.stderr;
    assert.ok(output.includes('invalid plugin config'), '应指出配置非法');
    assert.ok(output.includes('bad.json'), '应指出是哪份配置');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('方式 B：缺少插件模块时报 cannot load plugin 而不是崩溃', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'svgframe-badplugin-'));
  try {
    const manifest = path.join(dir, 'plugins.json');
    writeFileSync(
      manifest,
      JSON.stringify({ version: 1, plugins: [{ name: 'ghost', entry: 'builtin:does-not-exist' }] }),
      'utf8',
    );
    const run = runCli('main.js', 'canvas\n', ['--config', manifest]);
    assert.notEqual(run.status, 0);
    assert.ok((run.stdout + run.stderr).includes('cannot load plugin ghost'), '应指出是哪个插件加载失败');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('方式 B：配置文件非法时直接退出，不带着半套插件进入 REPL', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'svgframe-badcfg-'));
  try {
    const manifest = path.join(dir, 'plugins.json');
    writeFileSync(manifest, JSON.stringify({ version: 1 }), 'utf8');
    const run = runCli('main.js', 'canvas\n', ['--config', manifest]);
    assert.equal(run.status, 1, '运行期装配失败退出码为 1');
    assert.ok(run.stdout.includes('error: invalid plugin config'), '应打印明确原因');
    assert.equal(run.stdout.includes(BANNER_MARKER), false, '不得进入 REPL（横幅都不该出现）');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('方式 B：--config 缺参数时退出码为 2（用法错与运行期失败区分开）', () => {
  const run = runCli('main.js', 'canvas\n', ['--config']);
  assert.equal(run.status, 2);
  assert.ok(run.stdout.includes('error: --config requires a manifest path'));
});

test('方式 B：被禁用的插件给出 warning，且横幅仍是第一行', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'svgframe-disabled-'));
  try {
    const manifest = path.join(dir, 'plugins.json');
    writeFileSync(
      manifest,
      JSON.stringify({
        version: 1,
        plugins: [{ name: '@svgframe/plugin-command-stats', entry: 'builtin:command-stats', enabled: false }],
      }),
      'utf8',
    );
    const run = runCli('main.js', 'canvas\n', ['--config', manifest]);
    assert.equal(run.status, 0);
    const lines = run.stdout.split(/\r?\n/);
    assert.equal(lines[0], "svg-editor 0.1 — type 'help' for commands", '横幅必须是第一行');
    assert.ok(lines.some((line) => line.startsWith('warning: ') && line.includes('disabled by config')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('方式 B：未指定 --config 时插件全部缺席，且两类名字错误可区分', () => {
  const run = runCli('main.js', ['init 100 100', 'stats', 'create box b 0 0 10 10 x'].join('\n'));
  assert.ok(run.stdout.includes("error: unknown command: stats. type 'help' for commands"));
  assert.ok(run.stdout.includes('error: unknown shape type: box (is the plugin loaded?)'));
  assert.equal(run.stdout.includes('(box)'), false);
});