import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CircleProvider } from '../src/core/registry/CircleProvider';
import { ShapeTypeRegistry } from '../src/core/registry/ShapeTypeRegistry';
import { createDefaultShapeTypeRegistry } from '../src/core/registry/createDefaultShapeTypeRegistry';

test('内置类型注册表：类型名与元素名双索引', () => {
  const registry = createDefaultShapeTypeRegistry();
  assert.deepEqual(
    registry.listProviders().map((p) => p.typeName),
    ['rect', 'circle', 'ellipse', 'line', 'text', 'g'],
  );
  assert.equal(registry.findByTag('text')?.typeName, 'text');
  assert.equal(registry.findByTag('polygon'), null);
  assert.equal(registry.findProvider('hexagon'), null);
});

test('重复注册抛错（程序缺陷，非用户错误）', () => {
  const registry = new ShapeTypeRegistry();
  registry.register(new CircleProvider());
  assert.throws(() => registry.register(new CircleProvider()), /duplicate shape provider: circle/);
});

test('createShape：按 schema 绑定可选参数', () => {
  const registry = createDefaultShapeTypeRegistry();
  const withFill = registry.createShape('rect', 'r1', ['10', '20', '100', '50', '#eee']);
  assert.equal(withFill.getAttribute('fill'), '#eee');
  assert.equal(withFill.geometrySummary(), 'x=10 y=20 width=100 height=50');

  const noFill = registry.createShape('rect', 'r2', ['0', '0', '1', '2']);
  assert.equal(noFill.styleAttributes().length, 0);

  const text = registry.createShape('text', 't1', ['20', '40', 'My Diagram']);
  assert.equal(text.serializedTextContent(), 'My Diagram');
});

test('createShape：参数数量错误与非法数值', () => {
  const registry = createDefaultShapeTypeRegistry();
  assert.throws(
    () => registry.createShape('rect', 'r3', ['1', '2', '3']),
    /wrong number of arguments for rect: expected 4 to 5, got 3/,
  );
  assert.throws(
    () => registry.createShape('rect', 'r3', ['1', '2', '3', '4', 'red', 'extra']),
    /wrong number of arguments for rect: expected 4 to 5, got 6/,
  );
  assert.throws(
    () => registry.createShape('rect', 'r3', ['x', '2', '3', '4']),
    /invalid number for x: x/,
  );
});

test('createShape：未知类型（带插件提示原文）', () => {
  const registry = createDefaultShapeTypeRegistry();
  assert.throws(
    () => registry.createShape('hexagon', 'h1', []),
    /unknown shape type: hexagon \(is the plugin loaded\?\)/,
  );
});

test('restore：未知属性进 extra，非法数值退化 0，text 内容回填', () => {
  const registry = createDefaultShapeTypeRegistry();
  const attrs = new Map<string, string>([
    ['id', 'fromFile'],
    ['x', '1.5'],
    ['y', '2'],
    ['width', '300px'],
    ['height', '4'],
    ['fill', 'blue'],
    ['font-size', '16'],
  ]);
  const restored = registry.findByTag('rect')!.restore({ id: 'fromFile', attributes: attrs, textContent: '' });
  assert.equal(restored.getAttribute('x'), '1.5');
  // 带单位无法表达为数字 → 0（doc：round-trip 已知限制）
  assert.equal(restored.getAttribute('width'), '0');
  assert.deepEqual(restored.extraAttributePairs(), [
    ['font-size', '16'],
  ]);

  const text = registry
    .findByTag('text')!
    .restore({ id: 't2', attributes: new Map([['x', '5'], ['y', '6']]), textContent: 'hello' });
  assert.equal(text.serializedTextContent(), 'hello');
});

test('g 类型创建的是容器', () => {
  const registry = createDefaultShapeTypeRegistry();
  const group = registry.createShape('g', 'g1', []);
  assert.notEqual(group.asContainer(), null);
});