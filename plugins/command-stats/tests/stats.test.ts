import assert from 'node:assert/strict';
import test from 'node:test';
import { createHarness, runLines } from '../../../tests/support/testHarness';
import type { Plugin } from '../../../src/core/plugin/PluginContext';
import { createStatsCommand } from '../src/index';

const statsPlugin: Plugin = {
  name: 'test/stats',
  activate: (context) => context.registerCommand(createStatsCommand()),
};

test('stats：空文档输出 (total 0, containers 0)', () => {
  const harness = createHarness([statsPlugin]);
  runLines(harness.app, ['init 800 600', 'stats']);
  assert.deepEqual(harness.out.lines.slice(-1), ['(total 0, containers 0)']);
});

test('stats：按首次出现顺序统计叶子，容器单独计数', () => {
  const harness = createHarness([statsPlugin]);
  runLines(harness.app, [
    'init 800 600',
    'create rect a 0 0 10 10',
    'create text t 0 0 "hi"',
    'group g a t',
    'create rect b 5 5 10 10',
    'create g g2',
    'create rect c 0 0 1 1 in g2',
    'stats',
  ]);
  assert.deepEqual(harness.out.lines.slice(-1), ['rect: 3  text: 1  (total 4, containers 2)']);
});

test('stats：不进入 undo 栈', () => {
  const harness = createHarness([statsPlugin]);
  runLines(harness.app, ['init 800 600', 'create rect a 0 0 10 10', 'stats', 'undo']);
  assert.deepEqual(harness.out.lines.slice(-1), ['rect#a removed']);
});

test('stats：未初始化文档时报错，加载后出现在 help 中', () => {
  const harness = createHarness([statsPlugin]);
  runLines(harness.app, ['stats']);
  assert.deepEqual(harness.out.lines.slice(-1), ['error: no document. use \'init\' or \'read\' first']);
  runLines(harness.app, ['help']);
  assert.ok(harness.out.lines.some((line) => line.trimStart().startsWith('stats')));
});

test('stats：未加载时执行报 unknown command', () => {
  const harness = createHarness();
  runLines(harness.app, ['stats']);
  assert.deepEqual(harness.out.lines.slice(-1), ['error: unknown command: stats. type \'help\' for commands']);
});