import assert from 'node:assert/strict';
import test from 'node:test';
import type { Plugin } from '../../../src/core/plugin/PluginContext';
import type { ShapeProvider } from '../../../src/core/registry/ShapeProvider';
import { createHarness, runLines } from '../../../tests/support/testHarness';
import boxPlugin from '../src/index';

test('box：创建后结构树带 (box) 标签，子部件为 rect + text', () => {
  const harness = createHarness([boxPlugin]);
  runLines(harness.app, ['init 400 200', 'create box n1 10 20 100 40 "start"', 'tree']);
  assert.deepEqual(harness.out.lines[1], 'box#n1 created');
  const tree = harness.out.lines.slice(2);
  assert.equal(tree[0], 'svg (400x200)');
  assert.ok(tree.some((line) => line.endsWith('box#n1 (box)')), 'box 行应有 (box) 标签');
  assert.ok(tree.some((line) => line.includes('rect#n1-rect')), '底板子部件应出现在树中');
  assert.ok(tree.some((line) => line.includes('text#n1-label')), '标签子部件应出现在树中');
});

test('box：保存/读回 round-trip 逐字节一致', () => {
  const first = createHarness([boxPlugin]);
  runLines(first.app, ['init 400 200', 'create box n1 10 20 100 40 "start"', 'save a.svg']);
  const saved = first.files.read('a.svg');
  assert.ok(saved.includes('data-kind="box"'), 'box 必须以 data-kind 标识');
  assert.ok(saved.includes('id="n1-rect"'));
  assert.ok(saved.includes('id="n1-label"'));
  assert.ok(saved.includes('>start</text>'), '标签文字应写入 text 元素内容');

  const second = createHarness([boxPlugin]);
  second.files.write('a.svg', saved);
  runLines(second.app, ['read a.svg', 'save b.svg']);
  assert.equal(second.files.read('b.svg'), saved, 'round-trip 必须逐字节稳定');
});

test('box：set fill 传播到两个子部件，一次 undo 整体回滚', () => {
  const harness = createHarness([boxPlugin]);
  runLines(harness.app, [
    'init 400 200',
    'create box n1 10 20 100 40 "start"',
    'set n1 fill red',
    'show n1-rect',
    'show n1-label',
    'undo',
    'show n1-rect',
  ]);
  const lines = harness.out.lines;
  assert.ok(lines.includes('box#n1 updated: fill=red'));

  // 按 `show` 的输出分段，逐段断言（show 的样式行带两格缩进）
  const sections: string[][] = [];
  for (const line of lines) {
    if (/^\S+#\S+ {2}parent=/.test(line)) {
      sections.push([line]);
    } else if (sections.length > 0) {
      (sections[sections.length - 1] as string[]).push(line);
    }
  }
  assert.equal(sections.length, 3, '应有 3 段 show 输出');
  const [rectAfterSet, labelAfterSet, rectAfterUndo] = sections as [string[], string[], string[]];
  assert.ok(rectAfterSet.some((line) => line.trim() === 'fill=red'), '底板 fill 应变为 red');
  assert.ok(labelAfterSet.some((line) => line.trim() === 'fill=red'), '标签文字 fill 也应是 red');
  assert.ok(
    rectAfterUndo.every((line) => line.trim() !== 'fill=red'),
    'undo 后底板不再有 red（回到创建时的 fill）',
  );
});

test('box：set label 改写内部文字，undo 恢复', () => {
  const harness = createHarness([boxPlugin]);
  runLines(harness.app, [
    'init 400 200',
    'create box n1 10 20 100 40 "start"',
    'set n1 label "done"',
    'tree n1',
    'undo',
    'tree n1',
  ]);
  const lines = harness.out.lines;
  assert.ok(lines.includes('box#n1 updated: label="done"'));
  const firstTree = lines.findIndex((line) => line.endsWith('box#n1 (box)'));
  assert.ok(firstTree >= 0);
  assert.ok(
    lines.slice(firstTree, firstTree + 3).some((line) => line.includes('"done"')),
    '标签文字应更新为 done',
  );
  const lastTree = lines.lastIndexOf('box#n1 (box)');
  assert.ok(
    lines.slice(lastTree, lastTree + 3).some((line) => line.includes('"start"')),
    'undo 后文字恢复为 start',
  );
});

test('box：必要子部件不得删除或挪走', () => {
  const harness = createHarness([boxPlugin]);
  runLines(harness.app, [
    'init 400 200',
    'create box n1 10 20 100 40 "x"',
    'create g g1',
    'delete n1-rect',
    'addto g1 n1-label',
  ]);
  assert.deepEqual(harness.out.lines.slice(-2), [
    'error: cannot remove a required sub-part: n1-rect',
    'error: cannot remove a required sub-part: n1-label',
  ]);
});

test('box：派生 id 冲突时整条命令失败，不留残余', () => {
  const harness = createHarness([boxPlugin]);
  runLines(harness.app, ['init 400 200', 'create text n1-label 0 0 "x"', 'create box n1 10 20 30 30 "y"', 'tree']);
  assert.ok(harness.out.lines.includes('error: id already exists: n1-label'));
  assert.equal(harness.out.lines.some((line) => line.includes('box#n1')), false, '不应生成半个 box');
});

test('box：读入缺少必要子部件的 box 被明确拒绝，原文档保持不变', () => {
  const harness = createHarness([boxPlugin]);
  harness.files.write('bad.svg', '<svg width="100" height="100"><g id="b1" data-kind="box"/></svg>');
  runLines(harness.app, ['init 100 100', 'create rect keep 0 0 5 5', 'read bad.svg', 'show keep']);
  const lines = harness.out.lines;
  assert.ok(
    lines.some((line) => line.startsWith('error: invalid box: b1')),
    '应明确拒绝整个读入',
  );
  assert.ok(
    lines.some((line) => line.startsWith('rect#keep  parent=')),
    '读入失败后原文档仍可用',
  );
});

test('box：未加载插件时 create box 报 unknown shape type', () => {
  const harness = createHarness();
  runLines(harness.app, ['init 100 100', 'create box n1 0 0 10 10 "x"']);
  assert.deepEqual(harness.out.lines.slice(-1), [
    'error: unknown shape type: box (is the plugin loaded?)',
  ]);
});

test('box：move 移动整盒（含子部件）', () => {
  const harness = createHarness([boxPlugin]);
  runLines(harness.app, ['init 400 200', 'create box n1 10 20 100 40 "x"', 'move n1 5 5', 'show n1-rect']);
  assert.ok(harness.out.lines.includes('box#n1 moved by (5,5)'));
  assert.ok(
    harness.out.lines.some((line) => line.trim() === 'x=15 y=25 width=100 height=40'),
    '底板随盒平移 (+5,+5)',
  );
});

test('box：重复注册被拒绝并给出 duplicate registration 文案', () => {
  const harness = createHarness([boxPlugin]);
  const duplicate: Plugin = {
    name: 'test/duplicate-box',
    activate: (context) => {
      context.registerShapeProvider(stubBoxProvider());
    },
  };
  let thrown: unknown = null;
  try {
    activateInto(harness, duplicate);
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof Error);
  assert.equal((thrown as Error).message, 'duplicate registration: shapes/box');

  // 冲突时不得留下任何部分注册：注册表里 box 仍只有一份（另有内置的 6 种类型）
  const shapeNames = harness.extensions.registeredNames('shapes');
  assert.deepEqual(shapeNames.filter((name) => name === 'box'), ['box']);
  runLines(harness.app, ['init 100 100', 'create box ok 0 0 10 10 "x"']);
  assert.deepEqual(harness.out.lines.slice(-1), ['box#ok created']);
});

// ---- 小工具 -------------------------------------------------------------

function activateInto(harness: ReturnType<typeof createHarness>, plugin: Plugin): void {
  harness.extensions.beginRegistration();
  try {
    plugin.activate(harness.extensions);
    harness.extensions.commitRegistration();
  } catch (error) {
    harness.extensions.discardRegistration();
    throw error;
  }
}

function stubBoxProvider(): ShapeProvider {
  return {
    typeName: 'box',
    elementTag: 'g',
    parameters: [],
    create: () => {
      throw new Error('unused');
    },
    restore: () => {
      throw new Error('unused');
    },
    matchesElement: () => false,
  };
}