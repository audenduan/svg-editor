import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Circle } from '../src/core/model/Circle';
import { Ellipse } from '../src/core/model/Ellipse';
import { Group } from '../src/core/model/Group';
import { Line } from '../src/core/model/Line';
import { Rect } from '../src/core/model/Rect';
import { TextShape } from '../src/core/model/TextShape';
import { formatNumber } from '../src/core/model/numbers';

function rect(x = 10, y = 20, w = 100, h = 50): Rect {
  const shape = new Rect('r1');
  shape.setAttribute('x', String(x));
  shape.setAttribute('y', String(y));
  shape.setAttribute('width', String(w));
  shape.setAttribute('height', String(h));
  return shape;
}

test('move 只平移位置字段，尺寸不变', () => {
  const r = rect();
  r.moveBy(3, -4);
  assert.equal(r.getAttribute('x'), '13');
  assert.equal(r.getAttribute('y'), '16');
  assert.equal(r.getAttribute('width'), '100');
  assert.equal(r.getAttribute('height'), '50');
});

test('scale 等比乘全部几何字段', () => {
  const r = rect();
  r.scaleBy(2);
  assert.equal(r.geometrySummary(), 'x=20 y=40 width=200 height=100');
});

test('circle/ellipse/line 的锚点与 treeSummary', () => {
  const c = new Circle('c1');
  c.setAttribute('cx', '100');
  c.setAttribute('cy', '60');
  c.setAttribute('r', '20');
  assert.deepEqual(c.anchorPoint(), { x: 100, y: 60 });
  assert.equal(c.treeSummary(), 'cx=100 cy=60 r=20');

  const e = new Ellipse('e1');
  e.setAttribute('rx', '3');
  e.setAttribute('ry', '4');
  assert.equal(e.treeSummary(), 'cx=0 cy=0 rx=3 ry=4');

  const l = new Line('l1');
  l.setAttribute('x1', '280');
  l.setAttribute('y1', '130');
  l.setAttribute('x2', '520');
  l.setAttribute('y2', '130');
  l.setAttribute('stroke', 'black');
  assert.equal(l.treeSummary(), '(280,130) -> (520,130) stroke=black');
  assert.deepEqual(l.anchorPoint(), { x: 280, y: 130 });
});

test('text 的内容是元素文本，set text 可改', () => {
  const t = new TextShape('t1', 'My Diagram');
  assert.equal(t.serializedTextContent(), 'My Diagram');
  t.setAttribute('text', 'v2');
  assert.equal(t.getAttribute('text'), 'v2');
  assert.equal(t.treeSummary(), '(0,0) "v2"');
});

test('set 白名单：样式/几何可设，未知属性报错', () => {
  const r = rect();
  r.setAttribute('fill', '#f00');
  r.setAttribute('stroke', 'blue');
  r.setAttribute('stroke-width', '2');
  r.setAttribute('x', '99');
  assert.equal(r.getAttribute('fill'), '#f00');
  assert.equal(r.getAttribute('x'), '99');
  assert.throws(() => r.setAttribute('opacity', '0.5'), /unknown attribute: opacity/);
  assert.throws(() => r.setAttribute('x', 'abc'), /invalid number for x: abc/);
});

test('容器 move/scale 递归到子孙', () => {
  const g = new Group('g1');
  const r = rect();
  const c = new Circle('c1');
  c.setAttribute('cx', '0');
  c.setAttribute('cy', '0');
  c.setAttribute('r', '5');
  g.appendChild(r);
  g.appendChild(c);

  g.moveBy(0, 100);
  assert.equal(r.getAttribute('y'), '120');
  assert.equal(c.getAttribute('cy'), '100');
  g.scaleBy(2);
  assert.equal(r.getAttribute('x'), '20');
  assert.equal(c.getAttribute('r'), '10');
});

test('captureState/restoreState 快照还原（含样式/保留属性/文本）', () => {
  const t = new TextShape('t1', '开始');
  t.setAttribute('x', '155');
  t.setAttribute('y', '135');
  t.setAttribute('fill', 'white');
  t.setExtraAttribute('font-size', '16');
  const state = t.captureState();

  t.moveBy(10, 10);
  t.setAttribute('text', '其他');
  t.setAttribute('fill', 'red');
  t.restoreState(state);
  assert.equal(t.getAttribute('x'), '155');
  assert.equal(t.getAttribute('text'), '开始');
  assert.equal(t.getAttribute('fill'), 'white');
  assert.deepEqual(t.extraAttributePairs(), [['font-size', '16']]);
});

test('formatNumber：整数无小数点、小数最多 6 位、-0 归 0', () => {
  assert.equal(formatNumber(2), '2');
  assert.equal(formatNumber(1.5), '1.5');
  assert.equal(formatNumber(-0), '0');
  assert.equal(formatNumber(33.3333333), '33.333333');
});

test('矩形 treeSummary 用 w/h 别名，样式内联', () => {
  const r = rect();
  r.setAttribute('fill', '#ffffff');
  assert.equal(r.treeSummary(), 'x=10 y=20 w=100 h=50 fill=#ffffff');
});
