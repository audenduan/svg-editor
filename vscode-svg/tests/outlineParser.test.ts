import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSvgOutline } from '../src/outlineParser';
import type { OutlineNode } from '../src/outlineParser';

const FLOWCHART = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <g id="flowchart">
    <g id="node1">
      <rect id="start" x="120" y="100" width="160" height="60" fill="#4a90d9"/>
      <text id="start-label" x="155" y="135">开始</text>
    </g>
    <g id="node2">
      <rect id="process" x="520" y="100" width="160" height="60" fill="#f5a623"/>
      <text id="process-label" x="545" y="135">处理数据 v2</text>
    </g>
    <line id="arrow1" x1="280" y1="130" x2="520" y2="130" stroke="black"/>
  </g>
</svg>`;

test('1) 嵌套分组：svg > g > rect/text 层级与父子关系正确', () => {
  const nodes = parseSvgOutline(FLOWCHART);
  assert.equal(nodes.length, 1, '顶层应只有 svg 根节点');

  const root = nodes[0];
  assert.equal(root.tag, 'svg');
  assert.equal(root.name, 'svg', '<svg> 无 id，名字应为标签名');
  assert.equal(root.children.length, 1);

  const g = root.children[0];
  assert.equal(g.tag, 'g');
  assert.equal(g.name, 'g#flowchart');
  assert.equal(g.children.length, 3, 'flowchart 下有 node1 / node2 / arrow1');

  const node1 = g.children[0];
  assert.equal(node1.name, 'g#node1');
  assert.deepEqual(
    node1.children.map((c) => c.name),
    ['rect#start', 'text#start-label'],
    'node1 的子节点应为 rect#start 与 text#start-label',
  );

  const node2 = g.children[1];
  assert.equal(node2.name, 'g#node2');
  assert.deepEqual(
    node2.children.map((c) => c.name),
    ['rect#process', 'text#process-label'],
  );

  const arrow = g.children[2];
  assert.equal(arrow.name, 'line#arrow1');
  assert.equal(arrow.children.length, 0, 'line 是叶子');

  // 偏移：整段源码切片应精确等于对应元素源码。
  assert.equal(FLOWCHART.slice(node1.startOffset, node1.endOffset), `<g id="node1">
      <rect id="start" x="120" y="100" width="160" height="60" fill="#4a90d9"/>
      <text id="start-label" x="155" y="135">开始</text>
    </g>`);

  const rect = node1.children[0];
  assert.equal(
    FLOWCHART.slice(rect.startOffset, rect.endOffset),
    '<rect id="start" x="120" y="100" width="160" height="60" fill="#4a90d9"/>',
    '自闭合元素的范围应只覆盖它本身',
  );

  // 根节点范围应覆盖整个 <svg>…</svg>。
  assert.ok(root.startOffset < rect.startOffset);
  assert.ok(root.endOffset >= rect.endOffset);
  assert.ok(FLOWCHART.slice(root.startOffset, root.endOffset).endsWith('</svg>'));
});

test('2) 无 id 元素：name 只有标签名，id 为 null', () => {
  const nodes = parseSvgOutline('<svg><text>hi</text><circle cx="1" cy="2" r="3"/></svg>');
  assert.equal(nodes.length, 1);
  const svg = nodes[0];
  assert.equal(svg.name, 'svg');
  assert.equal(svg.id, null);
  assert.deepEqual(
    svg.children.map((c) => ({ name: c.name, id: c.id })),
    [
      { name: 'text', id: null },
      { name: 'circle', id: null },
    ],
  );
});

test('3) 文本变化后再解析：两次解析同一文档的不同版本，结果随之变化', () => {
  const v1 = '<svg><rect id="a"/><text id="t">old</text></svg>';
  const v2 = '<svg><rect id="b"/><circle id="c"/><text id="t">much longer text</text></svg>';

  const outline1 = parseSvgOutline(v1);
  const outline2 = parseSvgOutline(v2);

  assert.deepEqual(
    outline1[0].children.map((c) => c.name),
    ['rect#a', 'text#t'],
  );
  assert.deepEqual(
    outline2[0].children.map((c) => c.name),
    ['rect#b', 'circle#c', 'text#t'],
    '编辑后重新解析应反映最新文本（新增 circle、rect id 改名）',
  );

  // 文本变长后，<text> 的 endOffset 应相应后移，证明解析用的是最新文本。
  const text1 = outline1[0].children[1];
  const text2 = outline2[0].children[2];
  assert.ok(
    text2.endOffset - text2.startOffset > text1.endOffset - text1.startOffset,
    '文本变长后 <text> 的源码区间应更长',
  );
});

test('4) 不完整 XML 不抛异常，返回数组', () => {
  const brokenInputs = [
    '<svg><g><rect id="a"', // 未闭合
    '<svg></svg></g>', // 多余结尾标签越界
    '<svg><g></svg>', // 标签不匹配
    '<svg><g><rect id="a"></g></svg>', // rect 未闭合
    '', // 空文档
    '<svg', // 只有开始
  ];
  for (const input of brokenInputs) {
    assert.doesNotThrow(() => parseSvgOutline(input), `输入不应抛异常: ${input}`);
    const result = parseSvgOutline(input);
    assert.ok(Array.isArray(result), `应返回数组: ${input}`);
  }
});

test('4b) 完整但被截断的文档：根仍可解析时返回空或部分结果', () => {
  // 顶层游离文本不应导致崩溃。
  const result = parseSvgOutline('garbage<svg><rect id="a"/></svg>');
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1);
  assert.equal(result[0].tag, 'svg');
});
