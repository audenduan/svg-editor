import assert from 'node:assert/strict';
import test from 'node:test';
import { validateManifest } from '../src/core/config/PluginManifestLoader';

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