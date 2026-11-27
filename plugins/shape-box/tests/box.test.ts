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

test('box：set fill 写底板底色 + 标签自动配色，一次 undo 整体回滚', () => {
  const harness = createHarness([boxPlugin]);
  runLines(harness.app, [
    'init 400 200',
    'create box n1 10 20 100 40 "start"',
    'set n1 fill #223344',
    'show n1-rect',
    'show n1-label',
    'undo',
    'show n1-rect',
    'show n1-label',
  ]);
  const lines = harness.out.lines;
  assert.ok(lines.includes('box#n1 updated: fill=#223344'));

  // 按 `show` 的输出分段，逐段断言（show 的样式行带两格缩进）
  const sections: string[][] = [];
  for (const line of lines) {
    if (/^\S+#\S+ {2}parent=/.test(line)) {
      sections.push([line]);
    } else if (sections.length > 0) {
      (sections[sections.length - 1] as string[]).push(line);
    }
  }
  assert.equal(sections.length, 4, '应有 4 段 show 输出');
  const [plateAfterSet, labelAfterSet, plateAfterUndo, labelAfterUndo] = sections as [
    string[],
    string[],
    string[],
    string[],
  ];
  assert.ok(plateAfterSet.some((line) => line.trim() === 'fill=#223344'), '底板应是用户给的颜色');
  assert.ok(
    labelAfterSet.some((line) => line.trim() === 'fill=#ffffff'),
    '深色底上标签自动用白字（否则字与底同色，标签看不见）',
  );
  assert.ok(plateAfterUndo.every((line) => line.trim() !== 'fill=#223344'), '一次 undo 底板回滚');
  assert.ok(labelAfterUndo.every((line) => line.trim() !== 'fill=#ffffff'), '一次 undo 标签也回滚');
});

test('box：浅色底自动配深色标签，标签始终保持可读', () => {
  const harness = createHarness([boxPlugin]);
  runLines(harness.app, ['init 400 200', 'create box n1 0 0 100 40 "x"', 'set n1 fill #eef4ff', 'show n1-label']);
  const label = harness.out.lines.slice(harness.out.lines.findIndex((line) => line.startsWith('text#n1-label')));
  assert.ok(label.some((line) => line.trim() === 'fill=#111111'), '浅色底上标签应为深色');
});

test('box：非十六进制颜色不猜对比色（只动底板）', () => {
  const harness = createHarness([boxPlugin]);
  runLines(harness.app, ['init 400 200', 'create box n1 0 0 100 40 "x"', 'set n1 fill tomato', 'show n1-rect', 'show n1-label']);
  const text = harness.out.lines.join('\n');
  assert.match(text, /fill=tomato/, '底板收到原样颜色值');
  assert.equal(/text#n1-label[\s\S]*fill=/.test(text), false, '无法判定亮度时不该改标签颜色');
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

test('box：不得往里塞新子部件（create … in / addto）', () => {
  const harness = createHarness([boxPlugin]);
  runLines(harness.app, [
    'init 400 200',
    'create box n1 10 20 100 40 "x"',
    'create rect loose 300 10 5 5',
    'create rect extra 0 0 5 5 in n1',
    'create box inner 0 0 10 10 "y" in n1',
    'addto n1 loose',
    'tree',
  ]);
  const lines = harness.out.lines;
  assert.deepEqual(lines.slice(3, 6), [
    'error: cannot add a child to a composite shape: n1',
    'error: cannot add a child to a composite shape: n1',
    'error: cannot add a child to a composite shape: n1',
  ]);
  // 结构未被破坏：box 仍然恰好两个子部件
  const boxLine = lines.findIndex((line) => line.endsWith('box#n1 (box)'));
  const children = lines.slice(boxLine + 1).filter((line) => /^[│ ]+[├└]──/.test(line));
  assert.equal(children.length, 2, 'box 必须仍然只有两个子部件');
});

test('box：子部件顺序不得被打乱（front/back），否则 round-trip 会失败', () => {
  const harness = createHarness([boxPlugin]);
  runLines(harness.app, [
    'init 400 200',
    'create box n1 10 20 100 40 "x"',
    'front n1-rect',
    'back n1-label',
    'save a.svg',
    'read a.svg',
  ]);
  const lines = harness.out.lines;
  assert.ok(lines.includes('error: cannot reorder the parts of a composite shape: n1-rect'));
  assert.ok(lines.includes('error: cannot reorder the parts of a composite shape: n1-label'));
  assert.ok(lines.some((line) => line.startsWith('read a.svg')), '保存后必须还能读回来');
  assert.equal(lines.some((line) => line.startsWith('error: invalid box')), false);
});

test('box：不得被 group 借走必要子部件（group 会摘走成员）', () => {
  const harness = createHarness([boxPlugin]);
  runLines(harness.app, [
    'init 400 200',
    'create box n1 10 20 100 40 "x"',
    'create rect loose 300 10 5 5',
    'group gnew n1-rect',
    'group gnew2 loose',
  ]);
  assert.ok(harness.out.lines.includes('error: cannot remove a required sub-part: n1-rect'));
  assert.ok(harness.out.lines.includes('g#gnew2 created with 1 children'), '正常成员仍可分组');
});

test('box：未装插件时读入 box 文件退化为普通分组，重新保存逐字节不变', () => {
  const withPlugin = createHarness([boxPlugin]);
  runLines(withPlugin.app, ['init 400 200', 'create box n1 10 20 100 40 "start"', 'save a.svg']);
  const original = withPlugin.files.read('a.svg');

  const bare = createHarness();
  bare.files.write('a.svg', original);
  runLines(bare.app, ['read a.svg', 'save b.svg', 'tree']);
  // 退化为 <g>，但 data-kind 作为未知属性被保留下来
  assert.ok(bare.out.lines.some((line) => line.includes('g#n1') && line.includes('data-kind=box')));
  assert.equal(bare.files.read('b.svg'), original, '退化后保存必须与插件在场时的输出逐字节相同');
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