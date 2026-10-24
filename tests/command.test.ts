import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommandHistory } from '../src/core/command/CommandHistory';
import { AddToContainerCommand } from '../src/core/command/AddToContainerCommand';
import { CreateShapeCommand } from '../src/core/command/CreateShapeCommand';
import { DeleteShapeCommand } from '../src/core/command/DeleteShapeCommand';
import { GroupShapesCommand } from '../src/core/command/GroupShapesCommand';
import { MoveShapeCommand } from '../src/core/command/MoveShapeCommand';
import { ReorderShapeCommand } from '../src/core/command/ReorderShapeCommand';
import { ScaleShapeCommand } from '../src/core/command/ScaleShapeCommand';
import { SetAttributeCommand } from '../src/core/command/SetAttributeCommand';
import { UngroupShapeCommand } from '../src/core/command/UngroupShapeCommand';
import { Circle } from '../src/core/model/Circle';
import { Group } from '../src/core/model/Group';
import { Rect } from '../src/core/model/Rect';
import { SvgDocument } from '../src/core/model/SvgDocument';
import { TextShape } from '../src/core/model/TextShape';

function makeRect(id: string, x: number, y: number): Rect {
  const r = new Rect(id);
  r.setAttribute('x', String(x));
  r.setAttribute('y', String(y));
  r.setAttribute('width', '60');
  r.setAttribute('height', '60');
  return r;
}

const childIds = (parent: SvgDocument | Group): string => parent.children.map((s) => s.id).join(',');

test('create/delete undo 还原原下标', () => {
  const doc = new SvgDocument();
  const history = new CommandHistory();
  const a = makeRect('a', 0, 0);
  const b = makeRect('b', 0, 0);
  history.run(new CreateShapeCommand(a, doc));
  history.run(new CreateShapeCommand(b, doc));
  assert.equal(childIds(doc), 'a,b');

  const deleted = history.run(new DeleteShapeCommand(a));
  assert.equal(deleted, 'rect#a deleted');
  assert.equal(childIds(doc), 'b');
  assert.equal(history.undo(), 'rect#a restored into svg');
  assert.equal(childIds(doc), 'a,b');
  assert.equal(history.redo(), 'rect#a deleted');
  assert.equal(childIds(doc), 'b');
});

test('move 撤销用快照还原（含容器递归）', () => {
  const doc = new SvgDocument();
  const history = new CommandHistory();
  const g = new Group('g1');
  const r = makeRect('r1', 10, 20);
  g.appendChild(r);
  doc.appendChild(g);
  history.run(new MoveShapeCommand(g, 0, 100));
  assert.equal(r.getAttribute('y'), '120');
  assert.equal(history.undo(), 'g#g1 moved back by (0,-100)');
  assert.equal(r.getAttribute('y'), '20');
});

test('scale 撤销避免浮点累积误差', () => {
  const doc = new SvgDocument();
  const history = new CommandHistory();
  const r = makeRect('r1', 3, 4);
  doc.appendChild(r);
  history.run(new ScaleShapeCommand(r, 3));
  assert.equal(r.getAttribute('x'), '9');
  history.undo();
  assert.equal(r.getAttribute('x'), '3');
  assert.equal(r.getAttribute('width'), '60');
});

test('set 撤销还原旧值（text 内容 + 样式）', () => {
  const doc = new SvgDocument();
  const history = new CommandHistory();
  const t = new TextShape('t1', 'My Diagram');
  doc.appendChild(t);
  history.run(new SetAttributeCommand(t, 'text', 'My Diagram v2'));
  assert.equal(t.getAttribute('text'), 'My Diagram v2');
  assert.equal(history.undo(), 'text#t1 updated: text="My Diagram"');
  assert.equal(t.getAttribute('text'), 'My Diagram');
});

test('group 插入到第一个成员原位置，undo 精确还原', () => {
  const doc = new SvgDocument();
  const history = new CommandHistory();
  const g = new Group('outer');
  doc.appendChild(g);
  const a = makeRect('a', 0, 0);
  const b = makeRect('b', 0, 0);
  const c = makeRect('c', 0, 0);
  history.run(new CreateShapeCommand(a, doc));
  history.run(new CreateShapeCommand(b, g));
  history.run(new CreateShapeCommand(c, doc));
  assert.equal(childIds(doc), 'outer,a,c');

  const markers = new Group('markers');
  const message = history.run(new GroupShapesCommand(markers, [c, b]));
  assert.equal(message, 'g#markers created with 2 children');
  // a 在 doc 第 1 位，c 在第 2 位 → 新组落在 c 原位置
  assert.equal(childIds(doc), 'outer,a,markers');
  assert.equal(childIds(markers), 'c,b');

  history.undo();
  assert.equal(childIds(doc), 'outer,a,c');
  assert.equal(childIds(markers), '');
  assert.equal(b.parent?.containerLabel, 'g#outer');
});

test('ungroup 子图形提升到原容器位置，undo 不产生重复子节点', () => {
  const doc = new SvgDocument();
  const history = new CommandHistory();
  const outer = new Group('outer');
  const markers = new Group('markers');
  const a = makeRect('a', 0, 0);
  const b = makeRect('b', 0, 0);
  doc.appendChild(outer);
  doc.appendChild(markers);
  markers.appendChild(a);
  markers.appendChild(b);

  assert.equal(history.run(new UngroupShapeCommand(markers)), 'g#markers dissolved, 2 children moved to svg');
  assert.equal(childIds(doc), 'outer,a,b');
  assert.equal(childIds(markers), '');

  assert.equal(history.undo(), 'g#markers restored with 2 children');
  assert.equal(childIds(doc), 'outer,markers');
  assert.equal(childIds(markers), 'a,b');
});

test('addto 撤销回原父容器与原位置', () => {
  const doc = new SvgDocument();
  const history = new CommandHistory();
  const g = new Group('g1');
  const a = makeRect('a', 0, 0);
  const b = makeRect('b', 0, 0);
  g.appendChild(a);
  doc.appendChild(g);
  doc.appendChild(b);

  assert.equal(history.run(new AddToContainerCommand(b, g)), 'rect#b moved into g#g1');
  assert.equal(childIds(g), 'a,b');
  assert.equal(history.undo(), 'rect#b moved back into svg');
  assert.equal(childIds(doc), 'g1,b');
});

test('front/back 与撤销', () => {
  const doc = new SvgDocument();
  const history = new CommandHistory();
  const a = makeRect('a', 0, 0);
  const b = makeRect('b', 0, 0);
  const c = makeRect('c', 0, 0);
  doc.appendChild(a);
  doc.appendChild(b);
  doc.appendChild(c);
  history.run(new ReorderShapeCommand(a, 'back'));
  assert.equal(childIds(doc), 'a,b,c'); // 已在最前，back 无变化
  history.run(new ReorderShapeCommand(c, 'back'));
  assert.equal(childIds(doc), 'c,a,b');
  assert.equal(history.undo(), 'rect#c order restored');
  assert.equal(childIds(doc), 'a,b,c');
  history.run(new ReorderShapeCommand(a, 'front'));
  assert.equal(childIds(doc), 'b,c,a');
});

test('容器 scale 只统计子孙数量', () => {
  const doc = new SvgDocument();
  const g = new Group('g1');
  const a = makeRect('a', 0, 0);
  const b = makeRect('b', 0, 0);
  const c = new Circle('c1');
  g.appendChild(a);
  g.appendChild(b);
  g.appendChild(c);
  doc.appendChild(g);
  const command = new ScaleShapeCommand(g, 2);
  assert.equal(command.execute(), 'g#g1 scaled by 2 (3 shapes affected)');
  assert.equal(command.undo(), 'g#g1 scaled back (3 shapes restored)');
});

test('历史闸门：io 锁禁 undo/redo，新编辑解禁', () => {
  const history = new CommandHistory();
  const doc = new SvgDocument();
  const r = makeRect('r1', 0, 0);
  history.run(new CreateShapeCommand(r, doc));

  history.lockAfterIo();
  assert.throws(() => history.undo(), /undo not allowed after io command/);
  assert.throws(() => history.redo(), /redo not allowed after io command/);

  history.run(new MoveShapeCommand(r, 1, 0));
  assert.equal(history.undo(), 'rect#r1 moved back to (0,0)');
});

test('resetAfterIo 清空历史', () => {
  const history = new CommandHistory();
  const doc = new SvgDocument();
  const r = makeRect('r1', 0, 0);
  history.run(new CreateShapeCommand(r, doc));
  history.resetAfterIo();
  assert.equal(history.undoDepth, 0);
  assert.equal(history.redoDepth, 0);
  assert.throws(() => history.undo(), /undo not allowed after io command/);
});

test('undo 之后新编辑清空 redo 栈', () => {
  const history = new CommandHistory();
  const doc = new SvgDocument();
  const r = makeRect('r1', 0, 0);
  history.run(new CreateShapeCommand(r, doc));
  history.run(new MoveShapeCommand(r, 1, 0));
  history.undo();
  assert.equal(history.redoDepth, 1);
  history.run(new MoveShapeCommand(r, 5, 5));
  assert.equal(history.redoDepth, 0);
  assert.throws(() => history.redo(), /nothing to redo/);
});
