import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PluginManifestLoader,
  PluginModuleNotFoundError,
  validateManifest,
} from '../src/core/config/PluginManifestLoader';
import type { PluginModuleLoader } from '../src/core/config/PluginManifestLoader';
import type { Plugin } from '../src/core/plugin/PluginContext';

const CONFIG = 'C:\\cfg\\plugins.config.json';

function expectInvalid(source: unknown, fragment: string): void {
  assert.throws(
    () => validateManifest(source),
    (error: unknown) => error instanceof Error && error.message.includes(fragment),
  );
}

const plugin = (name: string, activate: Plugin['activate'] = () => {}): Plugin => ({ name, activate });

// ---------------------------------------------------------------------------
// 清单结构：规范示例只要求 { plugins: [...] }，version 可选
// ---------------------------------------------------------------------------

test('清单：最小的规范示例（只有 plugins 数组）合法，version 可省略', () => {
  const manifest = validateManifest({ plugins: [{ name: 'p', module: './x.js' }] });
  assert.equal(manifest.plugins.length, 1);
  assert.equal(manifest.plugins[0]?.module, './x.js');
  assert.equal(manifest.plugins[0]?.enabled, true);
  assert.deepEqual(manifest.plugins[0]?.contributions, {}, '缺省声明段视为四类皆空');
});

test('清单：version 出现时必须是 1', () => {
  expectInvalid({ version: 2, plugins: [] }, 'version must be 1');
  assert.equal(validateManifest({ version: 1, plugins: [] }).version, 1);
});

test('清单：plugins 必须是数组，条目必须是对象', () => {
  expectInvalid({}, 'plugins must be an array');
  expectInvalid({ plugins: [1] }, 'plugins[0] must be an object');
});

test('清单：module 必填；entry 作为同义旧键被接受', () => {
  expectInvalid({ plugins: [{ name: 'p' }] }, 'plugins[0].module must be a non-empty string');
  expectInvalid({ plugins: [{ name: 'p', module: '' }] }, 'plugins[0].module must be a non-empty string');
  assert.equal(validateManifest({ plugins: [{ name: 'p', entry: './x.js' }] }).plugins[0]?.module, './x.js');
});

test('清单：插件名重复直接拒绝（避免装配歧义）', () => {
  expectInvalid(
    { plugins: [{ name: 'x', module: 'a' }, { name: 'x', module: 'b' }] },
    'duplicate plugin name: x',
  );
});

test('清单：enabled 必须是布尔、variant 必须是字符串', () => {
  expectInvalid({ plugins: [{ name: 'x', module: 'a', enabled: 'yes' }] }, 'enabled must be a boolean');
  expectInvalid({ plugins: [{ name: 'x', module: 'a', variant: 3 }] }, 'variant must be a string');
});

test('清单：options 原样保留；config 作为同义旧键被接受', () => {
  const fromOptions = validateManifest({ plugins: [{ name: 'x', module: 'a', options: { fill: '#f5a623' } }] });
  assert.deepEqual(fromOptions.plugins[0]?.options, { fill: '#f5a623' });
  const fromConfig = validateManifest({ plugins: [{ name: 'x', module: 'a', config: { depth: 3 } }] });
  assert.deepEqual(fromConfig.plugins[0]?.options, { depth: 3 });
});

test('清单：contributes 只允许四类，每类必须是非空字符串数组', () => {
  const ok = validateManifest({
    plugins: [{ name: 'p', module: './x.js', contributes: { shapes: ['box'], commands: ['stats'] } }],
  });
  assert.deepEqual(ok.plugins[0]?.contributions, { shapes: ['box'], commands: ['stats'] });

  expectInvalid(
    { plugins: [{ name: 'p', module: 'a', contributes: { widgets: ['x'] } }] },
    'contributes.widgets is not a known category',
  );
  expectInvalid(
    { plugins: [{ name: 'p', module: 'a', contributes: { shapes: 'box' } }] },
    'contributes.shapes must be a string array',
  );
  expectInvalid(
    { plugins: [{ name: 'p', module: 'a', contributes: { shapes: [''] } }] },
    'contributes.shapes must be a string array',
  );
});

// ---------------------------------------------------------------------------
// 加载阶段：规范规定的四类失败都返回 error 行，不抛异常
// ---------------------------------------------------------------------------

/** 假模块加载器：按说明符查表，未命中时抛"模块找不到"。 */
function fakeLoader(modules: Record<string, unknown>, seen: string[] = []): PluginModuleLoader {
  return {
    loadModule: (spec: string) => {
      seen.push(spec);
      if (!(spec in modules)) {
        throw new PluginModuleNotFoundError(spec);
      }
      return modules[spec];
    },
    workingDirectory: () => 'C:\\work',
  };
}

const manifestOf = (entries: readonly unknown[]): string => JSON.stringify({ plugins: entries });
const plain = manifestOf([{ name: 'p', module: './p.js' }]);

test('加载：默认导出就是插件，原样交出并带上声明段', () => {
  const exported = plugin('p');
  const loader = new PluginManifestLoader(fakeLoader({ 'C:\\cfg\\p.js': { default: exported, __esModule: true } }));
  const result = loader.load(
    manifestOf([{ name: 'p', module: './p.js', contributes: { commands: ['stats'] }, options: { a: 1 } }]),
    CONFIG,
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.plugin, exported, '应把默认导出原样交出来');
  assert.deepEqual(result.candidates[0]?.declaration.contributions, { commands: ['stats'] });
  assert.deepEqual(result.candidates[0]?.declaration.options, { a: 1 });
});

test('加载：模块找不到 → plugin not found: <module>（回显配置里的原始字符串）', () => {
  const loader = new PluginManifestLoader(fakeLoader({}));
  const result = loader.load(manifestOf([{ name: 'p', module: './missing.js' }]), CONFIG);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.errors, ['plugin not found: ./missing.js']);
});

test('加载：没有默认导出 → plugin has no default export: <module>', () => {
  const loader = new PluginManifestLoader(fakeLoader({ 'C:\\cfg\\p.js': { activate: () => {} } }));
  const result = loader.load(plain, CONFIG);
  assert.deepEqual(result.errors, ['plugin has no default export: ./p.js']);
});

test('加载：默认导出不是插件 → 按激活失败上报，不误报为找不到模块', () => {
  const loader = new PluginManifestLoader(fakeLoader({ 'C:\\cfg\\p.js': { default: { name: 'p' } } }));
  const result = loader.load(plain, CONFIG);
  assert.deepEqual(result.errors, ['plugin failed to activate: p (default export is not a plugin)']);
});

test('加载：模块求值/依赖失败归入 plugin failed to activate，而不是 plugin not found', () => {
  const fake: PluginModuleLoader = {
    loadModule: (spec: string) => {
      const error = new Error(`Cannot find module 'chalk'`);
      (error as { code?: string }).code = 'MODULE_NOT_FOUND';
      void spec;
      throw error;
    },
    workingDirectory: () => 'C:\\work',
  };
  const result = new PluginManifestLoader(fake).load(plain, CONFIG);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0] as string, /^plugin failed to activate: p \(Cannot find module 'chalk'\)$/);
});

test('加载：variant 选中同模块里的另一个插件；不存在的 variant 明确报错', () => {
  const modules = { 'C:\\cfg\\p.js': { default: plugin('p'), variants: { alt: plugin('p-alt') } } };
  const ok = new PluginManifestLoader(fakeLoader(modules)).load(
    manifestOf([{ name: 'p-alt', module: './p.js', variant: 'alt' }]),
    CONFIG,
  );
  assert.equal(ok.candidates[0]?.plugin.name, 'p-alt');

  const bad = new PluginManifestLoader(fakeLoader(modules)).load(
    manifestOf([{ name: 'p', module: './p.js', variant: 'nope' }]),
    CONFIG,
  );
  assert.deepEqual(bad.errors, ['plugin not found: ./p.js#nope']);
});

test('加载：清单 name 与模块自报的 name 不一致 → manifest mismatch', () => {
  const loader = new PluginManifestLoader(fakeLoader({ 'C:\\cfg\\p.js': { default: plugin('actual') } }));
  const result = loader.load(plain, CONFIG);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0] as string, /^plugin manifest mismatch: p \(declared: name=p; registered: name=actual\)$/);
});

test('加载：enabled:false 条目被完全跳过，只留一行 warning', () => {
  const seen: string[] = [];
  const loader = new PluginManifestLoader(fakeLoader({}, seen));
  const result = loader.load(manifestOf([{ name: 'p', module: './p.js', enabled: false }]), CONFIG);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, ['plugin p disabled by config']);
  assert.deepEqual(seen, [], '被禁用的条目不得去加载模块');
});

test('加载：单条失败不影响后续条目（继续加载并保留已成功的插件）', () => {
  const good = plugin('ok');
  const loader = new PluginManifestLoader(
    fakeLoader({ 'C:\\cfg\\ok.js': { default: good } }),
  );
  const result = loader.load(
    manifestOf([{ name: 'missing', module: './nope.js' }, { name: 'ok', module: './ok.js' }]),
    CONFIG,
  );
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.plugin, good);
  assert.deepEqual(result.errors, ['plugin not found: ./nope.js']);
});

test('加载：./ 与 ../ 相对"配置文件所在目录"；包名原样交给模块解析', () => {
  const seen: string[] = [];
  const loader = new PluginManifestLoader(fakeLoader({}, seen));
  loader.load(manifestOf([{ name: 'a', module: './sib.js' }]), CONFIG);
  loader.load(manifestOf([{ name: 'b', module: '../up.js' }]), CONFIG);
  loader.load(manifestOf([{ name: 'c', module: '@scope/plugin-x' }]), CONFIG);
  assert.deepEqual(seen, ['C:\\cfg\\sib.js', 'C:\\up.js', '@scope/plugin-x']);
});

test('加载：带 UTF-8 BOM 的配置文件也能解析（Windows 编辑器常见）', () => {
  const loader = new PluginManifestLoader(fakeLoader({ 'C:\\cfg\\p.js': { default: plugin('p') } }));
  const result = loader.load(`\uFEFF${plain}`, CONFIG);
  assert.equal(result.candidates.length, 1);
});

test('加载：语法错误与结构错误都报 invalid plugin config，并带上文件路径', () => {
  const loader = new PluginManifestLoader(fakeLoader({}));
  assert.throws(() => loader.load('{ not json', CONFIG), /invalid plugin config: C:\\cfg\\plugins\.config\.json: not valid JSON/);
  assert.throws(
    () => loader.load(JSON.stringify({ plugins: [{ name: 'p' }] }), CONFIG),
    /invalid plugin config: C:\\cfg\\plugins\.config\.json: plugins\[0\]\.module must be a non-empty string/,
  );
});