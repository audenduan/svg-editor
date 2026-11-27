import assert from 'node:assert/strict';
import test from 'node:test';
import { HelpText } from '../src/cli/HelpText';
import type { CommandBrief } from '../src/core/plugin/CommandExtension';
import { createHarness, runLines } from './support/testHarness';
import statsPlugin from '../plugins/command-stats/src/index';

const brief = (usage: string, summary: string): CommandBrief => ({ name: usage.split(' ')[0] as string, usage, summary });

/** 取 `commands:` 段落（到空行为止）。 */
function commandLines(lines: readonly string[]): string[] {
  const start = lines.indexOf('commands:');
  const out: string[] = [];
  for (let index = start + 1; index < lines.length && lines[index] !== ''; index += 1) {
    out.push(lines[index] as string);
  }
  return out;
}

test('help：用法列宽随最长用法自适应，说明列不会贴到用法上', () => {
  const longUsage = 'create <type> <id> [params…] [in <containerId>]';
  const text = new HelpText();
  const lines = text.lines(
    [brief('init [w] [h]', 'new empty canvas'), brief(longUsage, 'create a shape')],
    ['rect', 'box'],
  );
  const commands = commandLines(lines);
  const [initLine, createLine] = commands as [string, string];

  // 说明必须与用法之间至少留两个空格（Phase 1 的固定 46 列会在这里贴死）
  assert.match(initLine, /^ {2}init \[w\] \[h\] {2,}new empty canvas$/);
  assert.match(createLine, /^ {2}create <type> <id> \[params…\] \[in <containerId>\] {2,}create a shape$/);

  // 两条命令的说明列必须对齐同一起点
  const initSummaryAt = initLine.indexOf('new empty canvas');
  const createSummaryAt = createLine.indexOf('create a shape');
  assert.equal(initSummaryAt, createSummaryAt, '说明列必须对齐');
  assert.ok(createSummaryAt > longUsage.length, '说明必须排在最长用法之后');
});

test('help：短用法仍保持最小列宽（不因某条命令过短而挤在一起）', () => {
  const lines = new HelpText().lines([brief('a', 'short')], ['rect']);
  assert.match(commandLines(lines)[0] as string, /^ {2}a {45,}short$/);
});

test('help：插件命令与插件图形类型都出现在输出里', () => {
  const harness = createHarness([{ name: 'test/stats', activate: (c) => (statsPlugin.activate(c), undefined) }]);
  runLines(harness.app, ['help']);
  const help = harness.out.lines.join('\n');
  assert.ok(commandLines(harness.out.lines).some((line) => line.trimStart().startsWith('stats')));
  assert.ok(help.includes('shape types'));
});

test('help：任何一行都不出现"说明紧贴用法"的情况（回归守卫）', () => {
  const harness = createHarness();
  runLines(harness.app, ['help']);
  for (const line of commandLines(harness.out.lines)) {
    // 形如 `  usage<padding>summary`：usage 与 summary 之间必须有两个以上空格
    assert.match(line, /^ {2}\S.* {2,}\S/, `列宽不足: ${line}`);
  }
});