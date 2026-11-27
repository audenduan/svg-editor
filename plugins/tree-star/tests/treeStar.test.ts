import assert from 'node:assert/strict';
import test from 'node:test';
import { ModifiedStarDecorator } from '../src/ModifiedStarDecorator';
import { createHarness, runLines } from '../../../tests/support/testHarness';
import boxPlugin from '../../shape-box/src/index';
import starPlugin from '../src/index';

const STAR = { name: 'test/tree-star', activate: starPlugin.activate };
const PLUGIN = [STAR];

/** 取最近一次 `tree` 输出的各行（从最后一行 `svg (` 开始）。 */
function lastTree(lines: readonly string[]): string[] {
  const flags = lines.map((line) => line.startsWith('svg ('));
  const start = flags.lastIndexOf(true);
  assert.notEqual(start, -1, '输出里应有 tree 的根行');
  return lines.slice(start);
}

/** 跑一段脚本，返回最后一段 tree 行。 */
function treeAfter(script: readonly string[], plugins = PLUGIN): string[] {
  const harness = createHarness(plugins);
  runLines(harness.app, script);
  return lastTree(harness.out.lines);
}

test('modified-star：没有任何编辑时根行不带后缀（Phase 1 的 tree 基线逐字节不变）', () => {
  const tree = treeAfter(['init 100 100', 'tree']);
  assert.deepEqual(tree, ['svg (100x100)'], '空树与 Phase 1 输出相同');
});

test('modified-star：编辑后该行与祖先容器都带 *', () => {
  const tree = treeAfter([
    'init 100 100',
    'create g grp',
    'create rect a 0 0 10 10 in grp',
    'move a 5 5',
    'tree',
  ]);
  assert.equal(tree[0], 'svg (100x100) *', '根行应标 *');
  assert.ok(tree[1]?.endsWith(' *'), '祖先容器行应标 *');
  assert.ok(tree[2]?.endsWith(' *'), '被直接改动的叶子行应标 *');
});

test('modified-star：save 之后标记清空；再编辑又重新出现', () => {
  const first = treeAfter(['init 100 100', 'create rect a 0 0 10 10', 'save a.svg', 'tree']);
  assert.equal(first[0], 'svg (100x100)', '保存后根行不应标 *');
  assert.equal(first[1], '└── rect#a  x=0 y=0 w=10 h=10', '保存后叶子不应标 *');

  const second = treeAfter(['init 100 100', 'create rect a 0 0 10 10', 'save a.svg', 'move a 1 1', 'tree']);
  assert.equal(second[0], 'svg (100x100) *', '再编辑后根行重新标 *');
  assert.ok(second[1]?.endsWith(' *'));
});

test('modified-star：undo 回到保存点后仍保留 *（"发生过编辑命令"语义）', () => {
  const tree = treeAfter([
    'init 100 100',
    'create rect a 0 0 10 10',
    'save a.svg',
    'move a 5 5',
    'undo',
    'tree',
  ]);
  assert.equal(tree[0], 'svg (100x100) *', 'undo 不撤销"发生过编辑"的事实');
  assert.ok(tree[1]?.endsWith(' *'));
});

test('modified-star：read 替换文档后状态清空', () => {
  const harness = createHarness(PLUGIN);
  runLines(harness.app, ['init 100 100', 'create rect a 0 0 10 10', 'tree']);
  assert.equal(lastTree(harness.out.lines)[0], 'svg (100x100) *', '保存前应带 *');

  runLines(harness.app, ['save a.svg', 'read a.svg', 'tree']);
  assert.equal(lastTree(harness.out.lines)[0], 'svg (100x100)', 'read 之后不应残留 *');
});

test('modified-star：状态封装在实例字段里，两个实例互不干扰', () => {
  const a = new ModifiedStarDecorator();
  const b = new ModifiedStarDecorator();
  a.onEdited(['x']);
  assert.deepEqual(a.dirtyIds(), ['x']);
  assert.deepEqual(b.dirtyIds(), [], '另一实例不应看到别人的状态');
  a.onSaved();
  assert.deepEqual(a.dirtyIds(), []);
});

test('modified-star 与 (box) 并存：两个标签互不感知，按注册顺序拼接', () => {
  // 生产配置里的顺序就是 box 在前、tree-star 在后（见 plugins.config.json），
  // 因此同一行上是「(box) *」。
  const harness = createHarness([{ name: 'test/box', activate: boxPlugin.activate }, STAR]);
  runLines(harness.app, ['init 400 200', 'create box n1 10 20 100 40 开始', 'tree']);
  const tree = lastTree(harness.out.lines);
  const boxLine = tree.find((line) => line.includes('box#n1'));
  assert.ok(boxLine !== undefined, 'box 行应存在');
  assert.ok(boxLine.endsWith(' (box) *'), '先注册的 (box) 在前，后注册的 modified-star 在后');
  assert.ok(tree.some((line) => line.includes('rect#n1-rect')), 'box 的子部件照常出现在树里');
});