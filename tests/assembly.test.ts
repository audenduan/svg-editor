import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..', '..');

/** 启动横幅首行：用来判断"是否真的进入了 REPL"（规范要求加载失败后仍继续启动）。 */
const BANNER_LINE = "svg-editor 0.1 — type 'help' for commands";
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

/** 在临时目录里搭一份配置 + 需要的插件模块，回调结束后清理。 */
function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(path.join(tmpdir(), 'svgframe-cfg-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 写一份配置并跑一次 `main.js`。 */
function runWithConfig(dir: string, manifest: unknown, script: string): CliRun {
  const file = path.join(dir, 'plugins.config.json');
  writeFileSync(file, JSON.stringify(manifest), 'utf8');
  return runCli('main.js', script, ['--config', file]);
}

const SCRIPT = [
  'init 400 200',
  'create box n1 10 20 100 40 start',
  'create rect r 0 0 5 5',
  'stats',
  'tree',
  'help',
].join('\n');

test('两种装配方式：方式 A（改代码）与方式 B（根配置）输出逐字节一致', () => {
  const byCode = runCli('main-code.js', SCRIPT);
  const byConfig = runCli('main.js', SCRIPT, ['--config', 'plugins.config.json']);
  assert.equal(byConfig.status, 0);
  assert.equal(byCode.status, 0);
  assert.deepEqual(byConfig.stdout, byCode.stdout, '改代码与改配置必须产出相同字节');
  assert.ok(byCode.stdout.includes('box#n1 created'), '插件确实生效');
  assert.ok(byCode.stdout.includes('box#n1 (box)'), '装饰器确实生效');
  assert.ok(byCode.stdout.includes('(total 3, containers 1)'), 'stats 确实生效');
});

test('两种装配方式：只含纯内置命令的脚本同样逐字节一致', () => {
  const script = ['init 100 100', 'create rect a 0 0 10 10', 'move a 5 5', 'tree', 'show a', 'undo'].join('\n');
  const byCode = runCli('main-code.js', script);
  const byConfig = runCli('main.js', script, ['--config', 'plugins.config.json']);
  assert.equal(byConfig.stdout, byCode.stdout);
  assert.equal(byCode.stdout.includes('(box)'), false, '纯内置场景不应出现插件痕迹');
});

// ---------------------------------------------------------------------------
// 加载契约：四类失败都打印 error 行并继续启动（规范 §6）
// ---------------------------------------------------------------------------

test('配置非法：打印 error: invalid plugin config，仍用内置能力启动', () => {
  withTempDir((dir) => {
    const run = runWithConfig(dir, { version: 1 }, 'init 10 10\n');
    assert.equal(run.status, 0, '配置非法不得让主程序退出');
    const lines = run.stdout.split(/\r?\n/);
    assert.equal(lines[0], BANNER_LINE, '横幅仍是第一行');
    assert.ok(lines.some((line) => line.startsWith('error: invalid plugin config')), '应指出配置非法');
    assert.ok(run.stdout.includes('canvas 10x10 created'), 'REPL 仍可用（内置能力）');
  });
});

test('配置语法错误同样只报错不退出', () => {
  withTempDir((dir) => {
    const file = path.join(dir, 'plugins.config.json');
    writeFileSync(file, '{ not json', 'utf8');
    const run = runCli('main.js', 'init 10 10\n', ['--config', file]);
    assert.equal(run.status, 0);
    assert.ok(run.stdout.includes('error: invalid plugin config'));
    assert.ok(run.stdout.includes('canvas 10x10 created'));
  });
});

test('模块找不到：error: plugin not found: <module>，其余插件仍可用', () => {
  withTempDir((dir) => {
    const run = runWithConfig(
      dir,
      {
        plugins: [
          { name: 'ghost', module: './does-not-exist.js' },
          { name: '@svgframe/plugin-command-stats', module: path.join(repoRoot, 'dist/plugins/command-stats/src/index.js'), contributes: { commands: ['stats'] } },
        ],
      },
      ['init 10 10', 'stats'].join('\n'),
    );
    assert.equal(run.status, 0);
    assert.ok(run.stdout.includes('error: plugin not found: ./does-not-exist.js'));
    assert.equal(run.stdout.includes('unknown command: stats'), false, '后面的插件应照常加载');
  });
});

test('没有默认导出：error: plugin has no default export: <module>', () => {
  withTempDir((dir) => {
    const moduleFile = path.join(dir, 'no-default.js');
    writeFileSync(moduleFile, 'exports.activate = () => {};\n', 'utf8');
    const run = runWithConfig(dir, { plugins: [{ name: 'p', module: './no-default.js' }] }, 'init 10 10\n');
    assert.equal(run.status, 0);
    assert.ok(run.stdout.includes('error: plugin has no default export: ./no-default.js'));
  });
});

test('activate 抛错：error: plugin failed to activate: <name> (<reason>)，进程不退出', () => {
  withTempDir((dir) => {
    const moduleFile = path.join(dir, 'boom.js');
    writeFileSync(
      moduleFile,
      "module.exports = { default: { name: 'boom', activate() { throw new Error('kaboom'); } } };\n",
      'utf8',
    );
    const run = runWithConfig(dir, { plugins: [{ name: 'boom', module: './boom.js' }] }, 'init 10 10\n');
    assert.equal(run.status, 0, '规范要求主程序不得退出');
    assert.ok(run.stdout.includes('error: plugin failed to activate: boom (kaboom)'));
    assert.ok(run.stdout.includes('canvas 10x10 created'), '仍可继续交互');
  });
});

test('清单声明与实际注册不一致：error: plugin manifest mismatch，插件整体不生效', () => {
  withTempDir((dir) => {
    const moduleFile = path.join(dir, 'stats.js');
    writeFileSync(
      moduleFile,
      `module.exports = { default: { name: 'liar', activate(ctx) {
         ctx.registerCommand({ name: 'stats', usage: 'stats', summary: 'x', run: () => ['ok'] });
       } } };\n`,
      'utf8',
    );
    const run = runWithConfig(
      dir,
      { plugins: [{ name: 'liar', module: './stats.js', contributes: { commands: ['stats', 'extra'] } }] },
      ['init 10 10', 'stats'].join('\n'),
    );
    assert.equal(run.status, 0);
    assert.ok(run.stdout.includes('error: plugin manifest mismatch: liar'));
    assert.match(run.stdout, /declared: shapes=\[\] commands=\[extra, stats\]/, '应逐类列出声明');
    assert.match(run.stdout, /registered: shapes=\[\] commands=\[stats\]/, '应逐类列出实际注册');
    assert.ok(run.stdout.includes('unknown command: stats'), '清单不符的插件必须被整体撤销');
  });
});

test('重复注册：error: duplicate registration: <category>/<name>，冲突插件被整体撤销', () => {
  withTempDir((dir) => {
    for (const pluginName of ['first', 'second']) {
      writeFileSync(
        path.join(dir, `${pluginName}.js`),
        `module.exports = { default: { name: '${pluginName}', activate(ctx) {
         ctx.registerCommand({ name: 'stats', usage: 'stats', summary: 'x', run: () => ['${pluginName}'] });
       } } };\n`,
        'utf8',
      );
    }
    const run = runWithConfig(
      dir,
      {
        plugins: [
          { name: 'first', module: './first.js', contributes: { commands: ['stats'] } },
          { name: 'second', module: './second.js', contributes: { commands: ['stats'] } },
        ],
      },
      ['init 10 10', 'stats'].join('\n'),
    );
    assert.equal(run.status, 0);
    assert.ok(run.stdout.includes('error: duplicate registration: commands/stats'));
    assert.ok(run.stdout.includes('first'), '第一个插件应保留生效');
  });
});

test('相对模块路径以配置文件所在目录为基准（不在 cwd 下也能加载）', () => {
  withTempDir((dir) => {
    writeFileSync(
      path.join(dir, 'local.js'),
      "module.exports = { default: { name: 'local', activate(ctx) { ctx.registerCommand({ name: 'local', usage: 'local', summary: 'local cmd', run: () => ['local!'] }); } } };\n",
      'utf8',
    );
    const run = runWithConfig(dir, { plugins: [{ name: 'local', module: './local.js', contributes: { commands: ['local'] } }] }, 'local\n');
    assert.equal(run.status, 0);
    assert.ok(run.stdout.includes('local!'), '相对配置文件解析成功');
  });
});

test('options 段原样传给插件 activate', () => {
  withTempDir((dir) => {
    writeFileSync(
      path.join(dir, 'opt.js'),
      `module.exports = { default: { name: 'opt', activate(ctx, options) {
         ctx.registerCommand({ name: 'opt', usage: 'opt', summary: 'echo options', run: () => [JSON.stringify(options)] });
       } } };\n`,
      'utf8',
    );
    const run = runWithConfig(
      dir,
      { plugins: [{ name: 'opt', module: './opt.js', options: { fill: '#f5a623' }, contributes: { commands: ['opt'] } }] },
      'opt\n',
    );
    assert.equal(run.status, 0);
    assert.ok(run.stdout.includes('{"fill":"#f5a623"}'), 'options 应原样到达插件');
  });
});

test('方式 B：--config 缺参数时退出码为 2（用法错与加载失败区分开）', () => {
  const run = runCli('main.js', 'init 10 10\n', ['--config']);
  assert.equal(run.status, 2);
  assert.ok(run.stdout.includes('error: --config requires a manifest path'));
});

test('方式 B：被禁用的插件给出 warning，且横幅仍是第一行', () => {
  withTempDir((dir) => {
    const run = runWithConfig(
      dir,
      {
        plugins: [
          {
            name: '@svgframe/plugin-command-stats',
            module: path.join(repoRoot, 'dist/plugins/command-stats/src/index.js'),
            enabled: false,
            contributes: { commands: ['stats'] },
          },
        ],
      },
      'init 10 10\n',
    );
    assert.equal(run.status, 0);
    const lines = run.stdout.split(/\r?\n/);
    assert.equal(lines[0], BANNER_LINE, '横幅必须是第一行');
    assert.ok(lines.some((line) => line.startsWith('warning: ') && line.includes('disabled by config')));
  });
});

test('方式 B：未指定 --config 时插件全部缺席，且两类名字错误可区分', () => {
  const run = runCli('main.js', ['init 100 100', 'stats', 'create box b 0 0 10 10 x'].join('\n'));
  assert.ok(run.stdout.includes("error: unknown command: stats. type 'help' for commands"));
  assert.ok(run.stdout.includes('error: unknown shape type: box (is the plugin loaded?)'));
  assert.equal(run.stdout.includes('(box)'), false);
  assert.equal(run.stdout.includes(BANNER_MARKER), true);
});