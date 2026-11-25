import { readdirSync } from 'node:fs';
import { EditorError } from '../../../src/core/errors/EditorError';

/** 目录项：插件需要的全部信息（名称 + 是目录还是文件）。 */
export interface DirectoryEntry {
  readonly name: string;
  readonly kind: 'dir' | 'file';
}

/**
 * 适配器模式的 **Target**：`dir` 命令依赖的目录访问接口。
 *
 * 插件只针对这个接口编程，因此 `dir` 可以用测试替身独立测试，
 * 也可以在真实文件系统上跑——两种情况下命令逻辑一行都不用改。
 */
export interface DirectoryAccess {
  /** 列出目录的直接子项（不含 `.` 与 `..`，包含 `.` 开头的隐藏项）。失败抛 `EditorError`。 */
  list(path: string): readonly DirectoryEntry[];
}

/**
 * 适配器模式中的 **Adapter**：把 Node 的 `fs.readdirSync`（Adaptee）
 * 适配成上面的 `DirectoryAccess`（Target）。
 *
 * 用 `withFileTypes` 的 `dirent` 判断类型：符号链接等特殊项**不跟随目标**，
 * 按"非目录即文件"显示为 `[FILE]`（文档中已注明）。
 */
export class NodeDirectoryAccess implements DirectoryAccess {
  public list(path: string): readonly DirectoryEntry[] {
    let entries;
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch {
      // 需求规定的原文错误信息；CLI 统一加 `error: ` 前缀。
      throw new EditorError(`cannot read directory: ${path}`);
    }
    const result: DirectoryEntry[] = [];
    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..') {
        continue;
      }
      result.push({ name: entry.name, kind: entry.isDirectory() ? 'dir' : 'file' });
    }
    return result;
  }
}