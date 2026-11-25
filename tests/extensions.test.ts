import assert from 'node:assert/strict';
import test from 'node:test';
import type { AttributeHandler } from '../src/core/plugin/AttributeHandler';
import { EditorError } from '../src/core/errors/EditorError';
import type { Plugin } from '../src/core/plugin/PluginContext';
import type { TreeDecorator } from '../src/core/plugin/TreeDecorator';
import type { CommandExtension } from '../src/core/plugin/CommandExtension';
import { activatePlugin } from '../src/host/assemble';
import { createHarness, runLines } from './support/testHarness';

/** 最小命令插件：`ping` 回一行。 */
function pingPlugin(): Plugin {
  const command: CommandExtension = {
    name: 'ping',
    usage: 'ping',
    summary: 'reply pong',
    run: () => ['pong'],
    };
  return { name: 'test/ping', activate: (context) => context.registerCommand(command) };
}

test('命令插件：注册后可用，未加载时报 unknown command', () => {
  const without = createHarness();
  runLines(without.app, ['ping']);
  assert.deepEqual(without.out.lines, ['error: unknown command: ping. type \'help\' for commands']);

  const withPlugin = createHarness([pingPlugin()]);
  runLines(withPlugin.app, ['ping']);
  assert.deepEqual(withPlugin.out.lines, ['pong']);
});

test('命令插件：加载后出现在 help 中', () => {
  const harness = createHarness([pingPlugin()]);
  runLines(harness.app, ['help']);
  const help = harness.out.lines.join('\n');
  assert.ok(help.includes('ping'), 'help 应包含插件命令');
});

test('暂存式注册：整插件冲突时回滚，不留下部分注册', () => {
  const harness = createHarness();
  const conflicting: Plugin = {
    name: 'test/conflict',
    activate: (context) => {
      // 先注册一个合法的新命令，再注册一个与内置冲突的图形类型：
      context.registerCommand(pingCommand());
      context.registerShapeProvider({
        typeName: 'rect',
        elementTag: 'rect',
        parameters: [],
        create: () => {
          throw new Error('unused');
        },
        restore: () => {
          throw new Error('unused');
        },
      });
    },
  };
  assert.throws(
    () => activatePlugin(harness.extensions, conflicting),
    (error: unknown) =>
      error instanceof EditorError && error.message === 'duplicate registration: shapes/rect',
  );
  // 冲突插件里的合法注册也必须被丢弃
  assert.equal(harness.extensions.commandRegistry.find('ping'), null);
  // 内置能力保持完好
  runLines(harness.app, ['init 100 100', 'create rect a 1 2 3 4']);
  assert.deepEqual(harness.out.lines.slice(-1), ['rect#a created']);
});

function pingCommand(): CommandExtension {
  return { name: 'ping', usage: 'ping', summary: 'reply pong', run: () => ['pong'] };
}

test('树标签：无装饰器时输出与基线一致，注册后追加行尾标签', () => {
  const bare = createHarness();
  runLines(bare.app, ['init 800 600', 'create rect a 0 0 10 10', 'tree']);
  const baseline = bare.out.lines.slice(bare.out.lines.findIndex((line) => line.startsWith('svg (')));
  assert.equal(baseline[0], 'svg (800x600)');
  assert.ok(baseline[1].startsWith('└── rect#a '));

  const star: TreeDecorator = {
    name: 'test/star',
    suffix: (context) => (context.shape === null ? '' : ' *'),
  };
  const decorated = createHarness([{ name: 'test/star', activate: (c) => c.registerTreeDecorator(star) }]);
  runLines(decorated.app, ['init 800 600', 'create rect a 0 0 10 10', 'tree']);
  const lines = decorated.out.lines.slice(decorated.out.lines.findIndex((line) => line.startsWith('svg (')));
  assert.equal(lines[0], 'svg (800x600)');
  assert.ok(lines[1].endsWith(' *'));
  // 去掉标签后与基线逐字节相同（根行不带标签：图形为 null）
  assert.equal(lines[1].replace(/ \*$/, ''), baseline[1]);
});

test('属性处理器：首个命中独占、一次 undo 整体回滚', () => {
  const calls: string[] = [];
  const first: AttributeHandler = {
    name: 'test/first',
    handles: (_shape, attr) => attr === 'label',
    apply: (shape, _attr, value) => {
      calls.push('first');
      shape.setAttribute('text', value);
    },
    read: (shape) => shape.getAttribute('text'),
  };
  const second: AttributeHandler = {
    name: 'test/second',
    handles: () => true,
    apply: () => {
      calls.push('second');
    },
  };
  const harness = createHarness([
    { name: 'test/handlers', activate: (c) => {
        c.registerAttributeHandler(first);
        c.registerAttributeHandler(second);
      } },
  ]);
  runLines(harness.app, ['init 100 100', 'create text t1 10 10 "old"', 'set t1 label "new"', 'tree t1']);
  assert.deepEqual(calls, ['first'], '第二个处理器不应被调用');
  assert.ok(harness.out.lines.some((line) => line.includes('"new"')));
  runLines(harness.app, ['undo']);
  assert.ok(harness.out.lines.some((line) => line.includes('"old"')), 'undo 恢复旧值');
});

test('属性处理器：执行中途抛错则文档与历史都不变', () => {
  const failing: AttributeHandler = {
    name: 'test/failing',
    handles: (_shape, attr) => attr === 'label',
    apply: (shape, _attr, value) => {
      // 故意先改一部分再抛错
      shape.setAttribute('text', value);
      throw new EditorError('handler blew up');
    },
  };
  const harness = createHarness([{ name: 'test/failing', activate: (c) => c.registerAttributeHandler(failing) }]);
  runLines(harness.app, ['init 100 100', 'create text t1 10 10 "old"', 'set t1 label "new"']);
  assert.deepEqual(harness.out.lines.slice(-1), ['error: handler blew up']);
  runLines(harness.app, ['show t1']);
  assert.ok(harness.out.lines.slice(-1)[0].includes('"old"'), '文本应回滚为旧值');
  runLines(harness.app, ['undo']);
  assert.deepEqual(
    harness.out.lines.slice(-1),
    ['text#t1 removed'],
    '失败的命令不进历史：undo 退回上一格是 create 而非失败的 set',
  );
});