import assert from 'node:assert/strict';
import test from 'node:test';
import type { Plugin } from '../src/core/plugin/PluginContext';
import { activatePlugin, assembleCli } from '../src/host/assemble';
import { createHarness, runLines } from './support/testHarness';
import boxPlugin from '../plugins/shape-box/src/index';
import statsPlugin from '../plugins/command-stats/src/index';

const allPlugins: Plugin[] = [statsPlugin, boxPlugin];

test('组合：box + stats 同时加载，容器的子部件计入叶子数', () => {
  const harness = createHarness(allPlugins);
  runLines(harness.app, [
    'init 400 200',
    'create rect a 0 0 10 10',
    'create box b 10 20 100 40 "开始"',
    'create g g1',
    'create circle c 5 5 3 in g1',
    'stats',
  ]);
  // rect a + box 的 rect/text 两个子部件 + circle c
  assert.deepEqual(harness.out.lines.slice(-1), ['rect: 2  text: 1  circle: 1  (total 4, containers 2)']);
});

test('组合：卸载插件后错误信息区分 unknown command 与 unknown shape type', () => {
  const bare = createHarness();
  runLines(bare.app, ['init 100 100', 'stats', 'create box b 0 0 10 10 "x"']);
  assert.deepEqual(bare.out.lines.slice(-2), [
    'error: unknown command: stats. type \'help\' for commands',
    'error: unknown shape type: box (is the plugin loaded?)',
  ]);

  const loaded = createHarness(allPlugins);
  runLines(loaded.app, ['init 100 100', 'stats', 'create box b 0 0 10 10 "x"', 'stats']);
  assert.deepEqual(loaded.out.lines.slice(-2), ['box#b created', 'rect: 1  text: 1  (total 2, containers 1)']);
});

test('组合：装饰器卸载后结构树回到基线字节', () => {
  const withBox = createHarness(allPlugins);
  runLines(withBox.app, ['init 400 200', 'create box b 10 20 100 40 start', 'tree']);
  const decorated = treeOf(withBox.out.lines);

  // 用普通 g + rect + text 重建同样结构，作为"无装饰器"的基线
  const bare = createHarness();
  runLines(bare.app, [
    'init 400 200',
    'create g b',
    'create rect b-rect 10 20 100 40 in b',
    'create text b-label 18 44 start in b',
    'tree',
  ]);
  const baseline = treeOf(bare.out.lines);

  assert.ok(decorated.some((line) => line.endsWith('(box)')), 'box 行应带 (box)');
  // 去掉 (box) 标签、并把类型名归一后，缩进与排布必须与基线完全一致
  const strip = (lines: readonly string[]): string[] =>
    lines.map((line) =>
      line.replace(/ \(box\)$/, '').replace(/^(└──|├──) box#/, '$1 g#').replace(/\s{2,}\S.*$/, ''),
    );
  assert.deepEqual(strip(decorated), strip(baseline));
  // 子部件行（去掉 box 与 g 的底色差异后）逐字相同
  assert.equal(decorated[3], baseline[3]);
  assert.equal(decorated[2].replace('fill=#ffffff', '').trim(), baseline[2].trim());
});

test('组合：插件顺序不影响输出', () => {
  const a = createHarness([statsPlugin, boxPlugin]);
  const b = createHarness([boxPlugin, statsPlugin]);
  const script = ['init 400 200', 'create box b 10 20 100 40 start', 'create rect r 0 0 5 5', 'stats', 'tree'];
  runLines(a.app, script);
  runLines(b.app, script);
  assert.deepEqual(a.out.lines, b.out.lines);
});

test('组合：未加载任何插件时一切与 Phase 1 基线一致', () => {
  const bare = createHarness();
  runLines(bare.app, ['init 100 100', 'create rect r 0 0 10 10', 'tree']);
  const tree = treeOf(bare.out.lines);
  assert.equal(tree[0], 'svg (100x100)');
  assert.ok(tree[1].startsWith('└── rect#r '));
  assert.equal(tree[1].includes('(box)'), false);
  assert.equal(tree[1].endsWith(' '), false, '无装饰器时行尾不得有多余空格');
});

/** 取输出里的结构树段落（从 `svg (` 起，去掉空行）。 */
function treeOf(lines: readonly string[]): string[] {
  const start = lines.findIndex((line) => line.startsWith('svg ('));
  return start < 0 ? [] : lines.slice(start).filter((line) => line.trim() !== '');
}

test('组合：activatePlugin 失败时不留部分注册，且可继续加载其他插件', () => {
  const harness = createHarness([statsPlugin]);
  const broken: Plugin = {
    name: 'test/broken',
    activate: (context) => {
      context.registerShapeProvider({
        typeName: 'broken',
        elementTag: 'broken',
        parameters: [],
        create: () => {
          throw new Error('unused');
        },
        restore: () => {
          throw new Error('unused');
        },
      });
      throw new Error('activation failed');
    },
  };
  assert.throws(() => activatePlugin(harness.extensions, broken), /activation failed/);
  assert.equal(harness.extensions.hasRegistration('shapes', 'broken'), false);
  // 后续插件仍能正常加载
  activatePlugin(harness.extensions, boxPlugin);
  runLines(harness.app, ['init 100 100', 'create box b 0 0 10 10 "x"', 'stats']);
  assert.deepEqual(harness.out.lines.slice(-2), ['box#b created', 'rect: 1  text: 1  (total 2, containers 1)']);
});

test('组合：装配入口可重复构建，互不污染', () => {
  const make = (): ReturnType<typeof assembleCli> =>
    assembleCli({ fileStore: harnessFiles(), output: harnessOutput() });
  const first = make();
  const second = make();
  // 两次装配各自独立：一次里加载的插件不影响另一次
  activatePlugin(first.extensions, boxPlugin);
  assert.equal(first.extensions.hasRegistration('shapes', 'box'), true);
  assert.equal(second.extensions.hasRegistration('shapes', 'box'), false);
  assert.equal(first.extensions.commandRegistry.list().length, second.extensions.commandRegistry.list().length);
});

// 仅用于断言装配入口不共享状态的极小替身
function harnessFiles() {
  return { read: () => '', write: () => {}, exists: () => false };
}

function harnessOutput() {
  return { writeLine: () => {} };
}