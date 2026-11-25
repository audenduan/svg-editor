import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EditorError } from '../../../src/core/errors/EditorError';
import type { Plugin } from '../../../src/core/plugin/PluginContext';
import { createHarness, runLines } from '../../../tests/support/testHarness';
import type { DirectoryAccess, DirectoryEntry } from '../src/directoryAccess';
import { NodeDirectoryAccess } from '../src/directoryAccess';
import { createDirCommand } from '../src/index';

/** 测试替身：按固定内容回答，可指定某个路径读取失败。 */
function fakeAccess(entries: readonly DirectoryEntry[], failPath: string | null = null): DirectoryAccess {
  return {
    list: (target) => {
      if (failPath !== null && target === failPath) {
        throw new EditorError(`cannot read directory: ${target}`);
      }
      return entries;
    },
  };
}

function dirPlugin(access: DirectoryAccess, cwd: string): Plugin {
  return {
    name: 'test/dir',
    activate: (context) =>
      context.registerCommand(createDirCommand({ directoryAccess: access, workingDirectory: () => cwd })),
  };
}

test('dir：目录在前、文件在后，各自按名称升序，隐藏项包含', () => {
  const harness = createHarness([
    dirPlugin(
      fakeAccess([
        { name: 'plugins', kind: 'dir' },
        { name: 'package.json', kind: 'file' },
        { name: 'docs', kind: 'dir' },
        { name: 'demo.svg', kind: 'file' },
        { name: '.gitkeep', kind: 'file' },
      ]),
      'C:\\work',
    ),
  ]);
  runLines(harness.app, ['dir']);
  assert.deepEqual(harness.out.lines, [
    '[DIR]  docs',
    '[DIR]  plugins',
    '[FILE] .gitkeep',
    '[FILE] demo.svg',
    '[FILE] package.json',
  ]);
});

test('dir：空目录输出 (empty directory)', () => {
  const harness = createHarness([dirPlugin(fakeAccess([]), 'C:\\empty')]);
  runLines(harness.app, ['dir']);
  assert.deepEqual(harness.out.lines, ['(empty directory)']);
});

test('dir：读取失败报 cannot read directory 并继续可用', () => {
  const harness = createHarness([dirPlugin(fakeAccess([], 'C:\\nope'), 'C:\\nope')]);
  runLines(harness.app, ['dir', 'init 100 100', 'canvas']);
  assert.deepEqual(harness.out.lines, [
    'error: cannot read directory: C:\\nope',
    'canvas 100x100 created',
    'canvas 100x100',
  ]);
});

test('dir：未初始化文档时可用，且不改变文档与 undo 历史', () => {
  const harness = createHarness([dirPlugin(fakeAccess([{ name: 'x.svg', kind: 'file' }]), 'C:\\work')]);
  runLines(harness.app, ['dir', 'init 100 100', 'create rect a 0 0 1 1', 'dir', 'undo']);
  assert.deepEqual(harness.out.lines, [
    '[FILE] x.svg',
    'canvas 100x100 created',
    'rect#a created',
    '[FILE] x.svg',
    'rect#a removed',
  ]);
});

test('dir：真实文件系统适配器与替身输出逐字节一致', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'svgframe-dir-'));
  try {
    mkdirSync(path.join(base, 'sub'));
    writeFileSync(path.join(base, 'a.svg'), '<svg/>');
    writeFileSync(path.join(base, '.hidden'), '');

    const expected = createHarness([dirPlugin(fakeAccess([
      { name: 'sub', kind: 'dir' },
      { name: '.hidden', kind: 'file' },
      { name: 'a.svg', kind: 'file' },
    ]), base)]);
    runLines(expected.app, ['dir']);

    const real = createHarness([
      dirPlugin(new NodeDirectoryAccess(), base),
    ]);
    runLines(real.app, ['dir']);

    assert.deepEqual(real.out.lines, expected.out.lines);
    assert.deepEqual(real.out.lines, ['[DIR]  sub', '[FILE] .hidden', '[FILE] a.svg']);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});