import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group } from '../src/core/model/Group';
import { Rect } from '../src/core/model/Rect';
import { SvgDocument } from '../src/core/model/SvgDocument';
import { TextShape } from '../src/core/model/TextShape';
import { createDefaultShapeTypeRegistry } from '../src/core/registry/createDefaultShapeTypeRegistry';
import { SvgReader } from '../src/io/SvgReader';
import { SvgWriter } from '../src/io/SvgWriter';

const registry = createDefaultShapeTypeRegistry();

test('writer 输出与需求 0.1 示例一致（属性顺序 + 缩进）', () => {
  const doc = new SvgDocument(400, 200);
  const g = new Group('flow');
  doc.appendChild(g);
  const r = new Rect('start');
  for (const [k, v] of [['x', '30'], ['y', '70'], ['width', '120'], ['height', '60'], ['fill', '#4a90d9']]) {
    r.setAttribute(k, v);
  }
  g.appendChild(r);
  const t = new TextShape('t1', 'My Diagram');
  t.setAttribute('x', '20');
  t.setAttribute('y', '40');
  doc.appendChild(t);

  const xml = new SvgWriter().write(doc);
  assert.equal(
    xml,
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">',
      '  <g id="flow">',
      '    <rect id="start" x="30" y="70" width="120" height="60" fill="#4a90d9"/>',
      '  </g>',
      '  <text id="t1" x="20" y="40">My Diagram</text>',
      '</svg>',
      '',
    ].join('\n'),
  );
});

test('round-trip：write → read → write 逐字节稳定', () => {
  const doc = new SvgDocument(400, 200);
  const g = new Group('g1');
  g.setExtraAttribute('transform', 'translate(10,20)');
  doc.appendChild(g);
  const c = doc; // unused placeholder
  void c;
  const inner = new Rect('r1');
  inner.setAttribute('x', '1.5');
  inner.setAttribute('fill', '#3366ff');
  g.appendChild(inner);
  const text = new TextShape('tx', 'a <&> b');
  text.setAttribute('x', '5');
  doc.appendChild(text);

  const first = new SvgWriter().write(doc);
  const readResult = new SvgReader(registry).read(first);
  // 数字会被规范化（1.5 保持），字符串原样往返
  const second = new SvgWriter().write(readResult.document);
  assert.equal(second, first);
  assert.deepEqual(readResult.warnings, []);
  assert.equal(readResult.document.findShape('g1')?.extraAttributePairs().length, 1);

  // 文本实体转义往返
  const textBack = readResult.document.findShape('tx') as TextShape;
  assert.equal(textBack.serializedTextContent(), 'a <&> b');
});

test('reader 自动补 id 与重复 id 改名（需求 2）', () => {
  const source = [
    '<?xml version="1.0"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">',
    '  <rect id="dup" x="0" y="0" width="10" height="10"/>',
    '  <rect id="dup" x="1" y="1" width="10" height="10"/>',
    '  <circle cx="5" cy="5" r="2"/>',
    '</svg>',
  ].join('\n');
  const result = new SvgReader(registry).read(source);
  assert.deepEqual(result.warnings, [
    'duplicate id dup renamed to dup-2',
    'assigned id circle1 to unnamed <circle>',
  ]);
  const ids = result.document.allShapes().map((s) => s.id);
  assert.deepEqual(ids, ['dup', 'dup-2', 'circle1']);
});

test('reader 忽略元数据元素、警告未知元素与 defs', () => {
  const source = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">',
    '  <title>untitled</title>',
    '  <rect id="r1" x="0" y="0" width="1" height="1"/>',
    '  <polygon id="p1" points="0,0 1,0 1,1"/>',
    '  <defs><rect id="defR" x="0" y="0" width="1" height="1"/></defs>',
    '</svg>',
  ].join('\n');
  const result = new SvgReader(registry).read(source);
  assert.deepEqual(result.warnings, [
    'unsupported element <polygon> skipped',
    'skipped <defs>: referenced shapes are not resolved in this phase',
  ]);
  assert.equal(result.document.elementCount(), 1);
  assert.equal(result.document.findShape('p1'), null);
});

test('reader 解析错误带 invalid svg 前缀', () => {
  assert.throws(
    () => new SvgReader(registry).read('<svg width="10" height="10"><rect/></svg>garbage'),
    /invalid svg: unexpected content after the root element/,
  );
  assert.throws(() => new SvgReader(registry).read('<svg><g></svg>'), /invalid svg: mismatched closing tag/);
  assert.throws(() => new SvgReader(registry).read('<svg>'), /invalid svg: unclosed element <svg>/);
  // 根元素不是 svg
  assert.throws(() => new SvgReader(registry).read('<rect/>'), /invalid svg: root element must be <svg>/);
});

test('viewBox 原点被保留（resize 不丢 minX/minY）', () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="-10 -20 400 300"><rect id="r" x="0" y="0" width="1" height="1"/></svg>';
  const result = new SvgReader(registry).read(source);
  const vb = result.document.viewBox;
  assert.deepEqual([vb.minX, vb.minY, vb.width, vb.height], [-10, -20, 400, 300]);
  result.document.resize(500, 400);
  assert.equal(result.document.viewBox.minX, -10);
  assert.equal(result.document.width, 500);
});