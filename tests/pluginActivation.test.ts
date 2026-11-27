import assert from 'node:assert/strict';
import test from 'node:test';
import { ExtensionRegistry } from '../src/core/plugin/ExtensionRegistry';
import { activateChecked, compareContributions } from '../src/core/plugin/PluginActivation';
import type { Plugin } from '../src/core/plugin/PluginContext';
import type { CommandExtension } from '../src/core/plugin/CommandExtension';
import type { TreeDecorator } from '../src/core/plugin/TreeDecorator';

const command = (name: string): CommandExtension => ({
  name,
  usage: name,
  summary: name,
  run: () => [`${name} ran`],
});

const decorator = (name: string): TreeDecorator => ({ name, suffix: () => ` (${name})` });

test('激活成功：暂存注册被提交，四类名字都可查到', () => {
  const extensions = new ExtensionRegistry();
  const plugin: Plugin = {
    name: 'ok',
    activate(context) {
      context.registerCommand(command('ok'));
      context.registerTreeDecorator(decorator('ok-label'));
    },
  };
  const failure = activateChecked(extensions, {
    plugin,
    contributions: { commands: ['ok'], decorators: ['ok-label'] },
  });
  assert.equal(failure, null);
  assert.deepEqual(extensions.registeredNames('commands'), ['ok']);
  assert.deepEqual(extensions.registeredNames('decorators'), ['ok-label']);
});

test('activate 抛错：返回规范文案，且不留任何暂存注册', () => {
  const extensions = new ExtensionRegistry();
  const plugin: Plugin = {
    name: 'boom',
    activate(context) {
      context.registerCommand(command('half'));
      throw new Error('kaboom');
    },
  };
  const failure = activateChecked(extensions, { plugin });
  assert.equal(failure, 'plugin failed to activate: boom (kaboom)');
  assert.deepEqual(extensions.registeredNames('commands'), [], '半套注册必须被丢弃');
  assert.deepEqual(extensions.stagedNames().commands, [], '暂存区也要清空');
});

test('清单不一致：返回逐类比对结果，插件整体不生效', () => {
  const extensions = new ExtensionRegistry();
  const plugin: Plugin = {
    name: 'liar',
    activate(context) {
      context.registerCommand(command('a'));
    },
  };
  const failure = activateChecked(extensions, {
    plugin,
    contributions: { commands: ['a', 'b'] },
  });
  assert.ok(failure !== null);
  assert.match(failure as string, /^plugin manifest mismatch: liar \(declared: /);
  assert.match(failure as string, /declared: shapes=\[\] commands=\[a, b\]/);
  assert.match(failure as string, /registered: shapes=\[\] commands=\[a\]/);
  assert.deepEqual(extensions.registeredNames('commands'), []);
});

test('清单声明为空但注册了东西 → 也算不一致（缺省不是"跳过校验"）', () => {
  const extensions = new ExtensionRegistry();
  const plugin: Plugin = { name: 'p', activate: (context) => context.registerCommand(command('x')) };
  const failure = activateChecked(extensions, { plugin, contributions: {} });
  assert.match(failure as string, /plugin manifest mismatch: p/);
  assert.deepEqual(extensions.registeredNames('commands'), []);
});

test('未提供声明段时不校验清单（方式 A 的自由度），注册照常提交', () => {
  const extensions = new ExtensionRegistry();
  const plugin: Plugin = { name: 'a-mode', activate: (context) => context.registerCommand(command('x')) };
  assert.equal(activateChecked(extensions, { plugin }), null);
  assert.deepEqual(extensions.registeredNames('commands'), ['x']);
});

test('重复注册：返回 duplicate registration，且不覆盖已成功插件的注册', () => {
  const extensions = new ExtensionRegistry();
  const first: Plugin = { name: 'first', activate: (context) => context.registerCommand(command('dup')) };
  assert.equal(activateChecked(extensions, { plugin: first }), null);

  const second: Plugin = {
    name: 'second',
    activate(context) {
      context.registerCommand(command('dup'));
      context.registerTreeDecorator(decorator('extra'));
    },
  };
  const failure = activateChecked(extensions, { plugin: second });
  assert.equal(failure, 'duplicate registration: commands/dup');
  assert.deepEqual(extensions.registeredNames('commands'), ['dup'], '原注册保持不变');
  assert.deepEqual(extensions.registeredNames('decorators'), [], '同一插件的其它注册也被回滚');
});

test('options 原样传给 activate 的第二个参数', () => {
  const extensions = new ExtensionRegistry();
  let received: unknown = 'unset';
  const plugin: Plugin = {
    name: 'opt',
    activate(_context, options) {
      received = options;
    },
  };
  activateChecked(extensions, { plugin, options: { fill: '#f5a623' } });
  assert.deepEqual(received, { fill: '#f5a623' });
});

test('compareContributions：顺序不敏感，重复项敏感', () => {
  const registered = { shapes: [], commands: ['b', 'a'], decorators: [], attributes: [] };
  assert.equal(compareContributions('p', { commands: ['a', 'b'] }, registered), null, '声明顺序无关');
  assert.match(
    compareContributions('p', { commands: ['a', 'b', 'b'] }, registered) as string,
    /declared: shapes=\[\] commands=\[a, b, b\]/,
  );
});