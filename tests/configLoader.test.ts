import assert from 'node:assert/strict';
import test from 'node:test';
import { PluginManifestLoader, validateManifest } from '../src/core/config/PluginManifestLoader';
import type { Plugin } from '../src/core/plugin/PluginContext';
import type { PluginModuleLoader } from '../src/core/config/PluginManifestLoader';

const BAD = 'C:\\plugins\\bad.json';

function expectError(source: unknown, fragment: string): void {
  assert.throws(
    () => validateManifest(source, BAD),
    (error: unknown) =>
      error instanceof Error && error.message.startsWith(`invalid plugin config: ${BAD}:`) && error.message.includes(fragment),
  );
}

test('manifest：最小合法配置通过校验', () => {
  const manifest = validateManifest({ version: 1, plugins: [{ name: 'a', entry: 'builtin:a' }] }, BAD);
  assert.deepEqual(manifest, { version: 1, plugins: [{ name: 'a', entry: 'builtin:a' }] });
});

test('manifest：版本号必须为 1', () => {
  expectError({ version: 2, plugins: [] }, 'version must be 1');
});

test('manifest：plugins 必须是数组', () => {
  expectError({ version: 1 }, 'plugins must be an array');
});

test('manifest：条目必须是对象，name/entry 必填', () => {
  expectError({ version: 1, plugins: [1] }, 'plugins[0] must be an object');
  expectError({ version: 1, plugins: [{ entry: 'x' }] }, 'plugins[0].name must be a non-empty string');
  expectError({ version: 1, plugins: [{ name: 'x' }] }, 'plugins[0].entry must be a non-empty string');
});

test('manifest：插件名重复直接拒绝（避免装配歧义）', () => {
  expectError(
    { version: 1, plugins: [{ name: 'x', entry: 'a' }, { name: 'x', entry: 'b' }] },
    'duplicate plugin name: x',
  );
});

test('manifest：enabled 必须是布尔、variant 必须是字符串', () => {
  expectError({ version: 1, plugins: [{ name: 'x', entry: 'a', enabled: 'yes' }] }, 'enabled must be a boolean');
  expectError({ version: 1, plugins: [{ name: 'x', entry: 'a', variant: 3 }] }, 'variant must be a string');
});

test('manifest：config 段落原样保留，供插件自己解释', () => {
  const manifest = validateManifest(
    { version: 1, plugins: [{ name: 'x', entry: 'a', config: { depth: 3 } }] },
    BAD,
  );
  assert.deepEqual(manifest.plugins[0]?.config, { depth: 3 });
});

// ---------------------------------------------------------------------------
// 加载阶段：entry 解析、variant 选择、enabled 跳过、模块形状校验
// ---------------------------------------------------------------------------

const plugin = (name: string): Plugin => ({ name, activate: () => {} });

/** 用假模块加载器测"从清单到插件对象"的过程，不触碰真实文件系统。 */
function loaderWith(modules: Record<string, unknown>): PluginManifestLoader {
  const fake: PluginModuleLoader = {
    loadModule: (spec: string) => {
      if (!(spec in modules)) {
        throw new Error(`cannot load plugin: ${spec}`);
      }
      return modules[spec];
    },
    workingDirectory: () => 'C:\\work',
  };
  return new PluginManifestLoader(fake);
}

const PLAIN = JSON.stringify({ version: 1, plugins: [{ name: 'p', entry: 'p.js' }] });

test('加载：模块导出的默认值就是插件', () => {
  const exports = { default: plugin('p'), __esModule: true };
  const loader = loaderWith({ 'C:\\work\\p.js': exports });
  const loaded = loader.load(PLAIN, 'C:\\cfg\\m.json').plugins;
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0], exports.default, '应把模块导出的那个对象原样交出来');
});

test('加载：variant 选中同模块里的另一个插件', () => {
  const loader = loaderWith({
    'C:\\work\\p.js': { default: plugin('p'), variants: { alt: plugin('p-alt') } },
  });
  const manifest = JSON.stringify({ version: 1, plugins: [{ name: 'p-alt', entry: 'p.js', variant: 'alt' }] });
  assert.equal(loader.load(manifest, 'C:\\cfg\\m.json').plugins[0]?.name, 'p-alt');
});

test('加载：variant 不存在时明确报错，而不是静默用默认插件', () => {
  const loader = loaderWith({ 'C:\\work\\p.js': { default: plugin('p'), variants: {} } });
  const manifest = JSON.stringify({ version: 1, plugins: [{ name: 'p', entry: 'p.js', variant: 'nope' }] });
  assert.throws(() => loader.load(manifest, 'C:\\cfg\\m.json'), /plugin p: unknown variant: nope/);
});

test('加载：清单里的 name 必须与模块自报的名字一致', () => {
  const loader = loaderWith({ 'C:\\work\\p.js': { default: plugin('actual') } });
  assert.throws(() => loader.load(PLAIN, 'C:\\cfg\\m.json'), /plugin p: name mismatch \(module exports actual\)/);
});

test('加载：模块没有 activate 时被拒绝（不是插件）', () => {
  const loader = loaderWith({ 'C:\\work\\p.js': { default: { name: 'p' } } });
  assert.throws(() => loader.load(PLAIN, 'C:\\cfg\\m.json'), /plugin p: not a plugin \(missing activate\)/);
});

test('加载：enabled:false 的插件被跳过，并以 warning 形式告知', () => {
  const loader = loaderWith({ 'C:\\work\\p.js': { default: plugin('p') } });
  const manifest = JSON.stringify({ version: 1, plugins: [{ name: 'p', entry: 'p.js', enabled: false }] });
  const result = loader.load(manifest, 'C:\\cfg\\m.json');
  assert.deepEqual(result.plugins, []);
  assert.deepEqual(result.warnings, ['plugin p disabled by config']);
});

test('加载：./ 开头相对"配置文件所在目录"，裸相对路径相对"工作目录"', () => {
  const seen: string[] = [];
  const fake: PluginModuleLoader = {
    loadModule: (spec: string) => {
      seen.push(spec);
      return { default: plugin('p') };
    },
    workingDirectory: () => 'C:\\work',
  };
  const loader = new PluginManifestLoader(fake);
  loader.load(JSON.stringify({ version: 1, plugins: [{ name: 'p', entry: './sib.js' }] }), 'C:\\cfg\\m.json');
  loader.load(JSON.stringify({ version: 1, plugins: [{ name: 'p', entry: 'lib/p.js' }] }), 'C:\\cfg\\m.json');
  assert.deepEqual(seen, ['C:\\cfg\\sib.js', 'C:\\work\\lib\\p.js'], '两种相对路径的基准目录不同');
});

test('加载：模块加载失败时保留插件名，便于定位', () => {
  const loader = loaderWith({});
  assert.throws(() => loader.load(PLAIN, 'C:\\cfg\\m.json'), /cannot load plugin p: C:\\work\\p\.js/);
});

test('加载：带 UTF-8 BOM 的配置文件也能解析（Windows 编辑器常见）', () => {
  const loader = loaderWith({ 'C:\\work\\p.js': { default: plugin('p') } });
  assert.equal(loader.load(`\uFEFF${PLAIN}`, 'C:\\cfg\\m.json').plugins.length, 1);
});

test('加载：JSON 语法错误报 cannot parse，且带上文件路径', () => {
  const loader = loaderWith({});
  assert.throws(() => loader.load('{ not json', 'C:\\cfg\\m.json'), /cannot parse plugin config: C:\\cfg\\m\.json/);
});