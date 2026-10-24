import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, runLines } from './support/testHarness';

const OTHER_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect x="0" y="0" width="400" height="300" fill="#ffffff"/>
  <text id="t1" x="10" y="290">imported</text>
  <circle id="c1" cx="50" cy="50" r="10"/>
  <g id="g1">
    <rect id="r2" x="0" y="0" width="10" height="10"/>
    <circle id="c2" cx="5" cy="5" r="2"/>
  </g>
  <ellipse id="e1" cx="1" cy="2" rx="3" ry="4"/>
</svg>`;

test('需求 6 完整会话：逐行输出一致', () => {
  const h = createHarness();
  h.files.write('other.svg', OTHER_SVG);
  runLines(h.app, [
    'init 800 600',
    'create rect bg 0 0 800 600 #ffffff',
    'create text title 20 40 "My Diagram"',
    'create circle c1 100 100 20 red',
    'create rect box 200 80 60 60 #3366ff',
    'group markers c1 box',
    'tree',
    'move c1 30 0',
    'undo',
    'redo',
    'set title text "My Diagram v2"',
    'undo',
    'group bad c1 markers',
    'delete box',
    'undo',
    'save demo.svg',
    'undo',
    'read other.svg',
    'tree',
  ]);
  assert.deepEqual(h.out.lines, [
    'canvas 800x600 created',
    'rect#bg created',
    'text#title created',
    'circle#c1 created',
    'rect#box created',
    'g#markers created with 2 children',
    'svg (800x600)',
    '├── rect#bg     x=0 y=0 w=800 h=600 fill=#ffffff',
    '├── text#title  (20,40) "My Diagram"',
    '└── g#markers',
    '    ├── circle#c1  cx=100 cy=100 r=20 fill=red',
    '    └── rect#box   x=200 y=80 w=60 h=60 fill=#3366ff',
    'circle#c1 moved to (130,100)',
    'circle#c1 moved back to (100,100)',
    'circle#c1 moved to (130,100)',
    'text#title updated: text="My Diagram v2"',
    'text#title updated: text="My Diagram"',
    'error: cannot group a container into its own descendant: markers',
    'rect#box deleted',
    'rect#box restored into g#markers',
    'saved to demo.svg (5 elements)',
    'error: undo not allowed after io command',
    'warning: assigned id rect1 to unnamed <rect>',
    'read other.svg (7 elements)',
    'svg (400x300)',
    '├── rect#rect1  x=0 y=0 w=400 h=300 fill=#ffffff',
    '├── text#t1     (10,290) "imported"',
    '├── circle#c1   cx=50 cy=50 r=10',
    '├── g#g1',
    '│   ├── rect#r2    x=0 y=0 w=10 h=10',
    '│   └── circle#c2  cx=5 cy=5 r=2',
    '└── ellipse#e1  cx=1 cy=2 rx=3 ry=4',
  ]);
});

test('需求 6.1 两节点流程图：in 子句嵌套创建 + 中文文本', () => {
  const h = createHarness();
  runLines(h.app, [
    'init 800 600',
    'create g flowchart',
    'create g node1 in flowchart',
    'create rect start 120 100 160 60 #4a90d9 in node1',
    'create text start-label 155 135 "开始" in node1',
    'create g node2 in flowchart',
    'create rect process 520 100 160 60 #f5a623 in node2',
    'create text process-label 545 135 "处理数据" in node2',
    'create line arrow1 280 130 520 130 black in flowchart',
    'tree',
    'move node2 0 100',
    'undo',
    'set process-label text "处理数据 v2"',
    'save flowchart.svg',
  ]);
  assert.deepEqual(h.out.lines, [
    'canvas 800x600 created',
    'g#flowchart created',
    'g#node1 created in g#flowchart',
    'rect#start created in g#node1',
    'text#start-label created in g#node1',
    'g#node2 created in g#flowchart',
    'rect#process created in g#node2',
    'text#process-label created in g#node2',
    'line#arrow1 created in g#flowchart',
    'svg (800x600)',
    '└── g#flowchart',
    '    ├── g#node1',
    '    │   ├── rect#start        x=120 y=100 w=160 h=60 fill=#4a90d9',
    '    │   └── text#start-label  (155,135) "开始"',
    '    ├── g#node2',
    '    │   ├── rect#process        x=520 y=100 w=160 h=60 fill=#f5a623',
    '    │   └── text#process-label  (545,135) "处理数据"',
    '    └── line#arrow1  (280,130) -> (520,130) stroke=black',
    'g#node2 moved by (0,100)',
    'g#node2 moved back by (0,-100)',
    'text#process-label updated: text="处理数据 v2"',
    'saved to flowchart.svg (8 elements)',
  ]);
});

test('save 后 undo 被 io 闸门拒绝（需求 4.3）', () => {
  const h = createHarness();
  runLines(h.app, ['init 100 100', 'create rect r1 0 0 10 10', 'save a.svg', 'undo', 'move r1 1 1', 'undo']);
  assert.deepEqual(h.out.lines, [
    'canvas 100x100 created',
    'rect#r1 created',
    'saved to a.svg (1 elements)',
    'error: undo not allowed after io command',
    'rect#r1 moved to (1,1)',
    'rect#r1 moved back to (0,0)',
  ]);
});

test('canvas 改尺寸后 undo 被禁止，undo/redo 清空历史', () => {
  const h = createHarness();
  runLines(h.app, ['init 100 100', 'create rect r1 0 0 10 10', 'canvas 50 50', 'undo', 'canvas']);
  assert.deepEqual(h.out.lines, [
    'canvas 100x100 created',
    'rect#r1 created',
    'canvas resized to 50x50',
    'error: undo not allowed after io command',
    'canvas 50x50',
  ]);
});

test('tree 指定 id 打印子树', () => {
  const h = createHarness();
  runLines(h.app, [
    'init 100 100',
    'create g g1',
    'create rect r1 0 0 10 10 in g1',
    'create rect r2 0 0 10 10',
    'tree g1',
  ]);
  assert.deepEqual(h.out.lines.slice(-2), [
    'g#g1',
    '└── rect#r1  x=0 y=0 w=10 h=10',
  ]);
});

test('up/down 复合图元（line/text）保存后 round-trip 不清空 dep 标记', () => {
  const h = createHarness();
  runLines(h.app, [
    'init 100 100',
    'create line l1 0 0 10 10 black',
    'create text t1 1 1 hello',
    'save a.svg',
    'read a.svg',
    'show l1',
    'show t1',
  ]);
  assert.deepEqual(h.out.lines, [
    'canvas 100x100 created',
    'line#l1 created',
    'text#t1 created',
    'saved to a.svg (2 elements)',
    'read a.svg (2 elements)',
    'line#l1  parent=svg',
    '  x1=0 y1=0 x2=10 y2=10',
    '  stroke=black',
    'text#t1  parent=svg',
    '  x=1 y=1',
    '  text="hello"',
  ]);
});