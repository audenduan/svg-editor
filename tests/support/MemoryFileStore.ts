import { EditorError } from '../../src/core/errors/EditorError';
import type { FileStore } from '../../src/io/FileStore';

/**
 * 测试用 FileStore：真实 IO 的最小替代，让 IO 失败的边界（文件不存在、写不进去）
 * 也能被稳定测试，而不用依赖临时目录。
 */
export class MemoryFileStore implements FileStore {
  private readonly files = new Map<string, string>();
  /** 置 true 后 write 一律抛错，用于测试写失败路径。 */
  public failWrites = false;

  public read(path: string): string {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new EditorError(`cannot read file: ${path}`);
    }
    return content;
  }

  public write(path: string, content: string): void {
    if (this.failWrites) {
      throw new EditorError(`cannot write file: ${path}`);
    }
    this.files.set(path, content);
  }

  public get(path: string): string | undefined {
    return this.files.get(path);
  }

  public has(path: string): boolean {
    return this.files.has(path);
  }
}