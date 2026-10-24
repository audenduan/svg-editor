import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, runLines } from './support/testHarness';

/**
 * 需求 4.2 的错误表验收：每条错误信息必须逐字一致。
 * 每条用例都开一个新会话（错误路径不改任何状态，多行脚本保证这一点）。
 */
function errorLinesOf(script: readonly string[]): string[] {
  const h = createHarness();
  runLines(h.app, ['init 200 200', 'create rect r1 0 0 10 10', 'create circle c1 5 5 2', 'create g g1', ...script]);
  const errors = h.out.lines.filter((line) => line.startsWith('error:'));
  assert.equal(errors.length, 1, `expected exactly one error, got ${JSON.stringify(h.out.lines)}`);
  return errors;
}

test('id 已存在', () => {
  assert.deepEqual(errorLinesOf(['create rect r1 0 0 1 1']), ['error: id already exists: r1']);
});

test('无此图形', () => {
  assert.deepEqual(errorLinesOf(['move zzz 1 1']), ['error: no such shape: zzz']);
  assert.deepEqual(errorLinesOf(['show zzz']), ['error: no such shape: zzz']);
  assert.deepEqual(errorLinesOf(['delete zzz']), ['error: no such shape: zzz']);
});

test('无此容器 / 不是容器', () => {
  assert.deepEqual(errorLinesOf(['create rect x 0 0 1 1 in nope']), ['error: no such container: nope']);
  assert.deepEqual(errorLinesOf(['create rect x 0 0 1 1 in c1']), ['error: not a container: c1']);
  assert.deepEqual(errorLinesOf(['addto zzz r1']), ['error: no such container: zzz']);
  assert.deepEqual(errorLinesOf(['addto c1 r1']), ['error: not a container: c1']);
  assert.deepEqual(errorLinesOf(['ungroup c1']), ['error: not a container: c1']);
});

test('组内祖先冲突', () => {
  // 把容器 g1 和它内部的 c2 收进同一组 = 把容器放进自己的子孙 → 拒绝
  assert.deepEqual(
    errorLinesOf(['create circle c2 1 1 1 in g1', 'group bad c2 g1']),
    ['error: cannot group a container into its own descendant: g1'],
  );
});

test('ungroup 根级容器被拒；叶子由 not-a-container 覆盖', () => {
  assert.deepEqual(
    errorLinesOf(['ungroup g1']),
    ['error: cannot ungroup top-level container: g1'],
  );
});

test('scale 非正值', () => {
  assert.deepEqual(errorLinesOf(['scale r1 0']), ['error: scale factor must be positive']);
  assert.deepEqual(errorLinesOf(['scale r1 -2']), ['error: scale factor must be positive']);
});

test('未初始化直接操作 → no document', () => {
  const h = createHarness();
  h.app.executeLine('tree');
  assert.deepEqual(h.out.lines, ["error: no document. use 'init' or 'read' first"]);
});

test('未知图形类型（含插件提示原文）', () => {
  assert.deepEqual(
    errorLinesOf(['create hexagon h1']),
    ['error: unknown shape type: hexagon (is the plugin loaded?)'],
  );
});

test('未知属性被拒', () => {
  assert.deepEqual(errorLinesOf(['set r1 opacity 0.5']), ['error: unknown attribute: opacity']);
});

test('usage 错误（参数个数）', () => {
  assert.deepEqual(errorLinesOf(['move c1 1']), ['error: usage: move <id> <dx> <dy>']);
  assert.deepEqual(errorLinesOf(['canvas 100']), ['error: usage: canvas [w] [h]']);
  assert.deepEqual(errorLinesOf(['group g2']), ['error: usage: group <newGid> <id1> <id2>…']);
  assert.deepEqual(errorLinesOf(['create rect']), ['error: usage: create <type> <id> [params…] [in <containerId>]']);
  assert.deepEqual(errorLinesOf(['init 0']), ['error: canvas size must be positive']);
  assert.deepEqual(errorLinesOf(['move r1 x 1']), ['error: invalid number for dx: x']);
});

test('IO 错误：文件不存在 / 写失败 / 未命名保存', () => {
  const h = createHarness();
  h.app.executeLine('init 10 10');
  h.app.executeLine('read missing.svg');
  h.app.executeLine('create rect r1 0 0 1 1');
  h.app.executeLine('save');
  h.files.failWrites = true;
  h.app.executeLine('save z:/no/such/dir/x.svg');
  assert.deepEqual(h.out.lines.slice(1), [
    'error: cannot read file: missing.svg',
    'rect#r1 created',
    'error: no file name: use save <file.svg>',
    'error: cannot write file: z:/no/such/dir/x.svg',
  ]);
});

test('未知命令与未闭合引号', () => {
  const h = createHarness();
  h.app.executeLine('bogus');
  h.app.executeLine('init 10 10');
  h.app.executeLine('create text t1 1 1 "unterminated');
  assert.deepEqual(h.out.lines, [
    "error: unknown command: bogus. type 'help' for commands",
    'canvas 10x10 created',
    'error: unterminated quoted argument',
  ]);
});

test('read 解析错误带 invalid svg 前缀', () => {
  const h = createHarness();
  h.files.write('bad.svg', '<svg><g></svg>');
  h.app.executeLine('init 10 10');
  h.app.executeLine('read bad.svg');
  assert.deepEqual(h.out.lines.slice(1), ['error: invalid svg: mismatched closing tag </svg>, expected </g> (offset 13)']);
});

test('错误不改变任何状态（编辑类命令失败后结构不变）', () => {
  const h = createHarness();
  runLines(h.app, [
    'init 100 100',
    'create rect r1 0 0 10 10',
    'create rect r2 20 20 10 10',
    'move zzz 5 5',
    'scale r1 -1',
    'set r1 opacity 1',
    'tree',
  ]);
  assert.deepEqual(h.out.lines.slice(-3), [
    'svg (100x100)',
    '├── rect#r1  x=0 y=0 w=10 h=10',
    '└── rect#r2  x=20 y=20 w=10 h=10',
  ]);
});