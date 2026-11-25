import assert from 'node:assert/strict';
import test from 'node:test';
import type { TreeDecorator } from '../src/core/plugin/TreeDecorator';
import { createHarness, runLines } from '../tests/support/testHarness';

/**
 * `modified-star` 形态的装饰器：改动过的图形行尾加 ` *`，保存后清除。
 *
 * 它同时演示了两件事：
 * - `suffix` 只是纯函数式拼接，内核不认识 `*` 的含义；
 * - `onSaved` / `onDocumentReplaced` 让有状态的装饰器能自行复位，而不需要内核知道它存在。
 */
function modifiedStar(): { decorator: TreeDecorator; dirty: Set<string> } {
  const dirty = new Set<string>();
  const decorator: TreeDecorator = {
    name: 'test/modified-star',
    suffix: (context) => (context.shape !== null && dirty.has(context.shape.id) ? ' *' : ''),
    onSaved: () => dirty.clear(),
    onDocumentReplaced: () => dirty.clear(),
  };
  return { decorator, dirty };
}

/** 取从第 `from` 行起的最新一段树输出（`tree` 之后没有空行）。 */
function treeSince(lines: readonly string[], from: number): string[] {
  return lines.slice(from).filter((line) => line.startsWith('svg (') || /^[└├│ ]/.test(line));
}

test('modified-star：未标记时不加后缀，标记后行尾加 *，保存后清除', () => {
  const { decorator, dirty } = modifiedStar();
  const harness = createHarness([{ name: 'test/modified-star', activate: (c) => c.registerTreeDecorator(decorator) }]);
  runLines(harness.app, ['init 100 100', 'create rect a 0 0 10 10']);

  let mark = harness.out.lines.length;
  runLines(harness.app, ['tree']);
  assert.equal(treeSince(harness.out.lines, mark)[1]?.endsWith('*'), false, '未修改时不加标记');

  dirty.add('a');
  mark = harness.out.lines.length;
  runLines(harness.app, ['tree']);
  assert.ok(treeSince(harness.out.lines, mark)[1]?.endsWith(' *'), '修改后行尾应有 *');

  mark = harness.out.lines.length;
  runLines(harness.app, ['save a.svg', 'tree']);
  assert.equal(treeSince(harness.out.lines, mark)[1]?.endsWith(' *'), false, '保存后标记应被清除');
});

test('modified-star：onDocumentReplaced 在 init 之后重置状态', () => {
  const { decorator, dirty } = modifiedStar();
  const harness = createHarness([{ name: 'test/modified-star', activate: (c) => c.registerTreeDecorator(decorator) }]);
  runLines(harness.app, ['init 100 100', 'create rect a 0 0 10 10']);
  // init 一开始就通知过 onDocumentReplaced，因此预置标记必须在 init 之后才加
  dirty.add('a');
  let mark = harness.out.lines.length;
  runLines(harness.app, ['tree']);
  assert.ok(treeSince(harness.out.lines, mark)[1]?.endsWith(' *'), '标记中的图形行尾应有 *');

  mark = harness.out.lines.length;
  runLines(harness.app, ['init 50 50', 'create rect b 0 0 1 1', 'tree']);
  assert.deepEqual([...dirty], [], 'init 之后装饰器状态应为空');
  assert.equal(treeSince(harness.out.lines, mark)[1]?.endsWith(' *'), false);
});

test('modified-star：suffix 返回空串时行尾不留空格（基线不变）', () => {
  const harness = createHarness([
    { name: 'test/empty', activate: (c) => c.registerTreeDecorator({ name: 'test/empty', suffix: () => '' }) },
  ]);
  runLines(harness.app, ['init 100 100', 'create rect a 0 0 10 10']);
  const mark = harness.out.lines.length;
  runLines(harness.app, ['tree']);
  const tree = treeSince(harness.out.lines, mark);
  assert.equal(tree[1]?.endsWith(' '), false, '返回空串时不得留多余空格');
  assert.equal(tree[1], '└── rect#a  x=0 y=0 w=10 h=10', '与无装饰器时逐字相同');
});