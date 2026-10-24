import { readFileSync, writeFileSync } from 'node:fs';
import { EditorError } from '../core/errors/EditorError';
import type { FileStore } from './FileStore';

/** 基于 Node `fs` 的 FileStore 适配器（IO 细节只出现在这一层）。 */
export class NodeFileStore implements FileStore {
  public read(path: string): string {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      throw new EditorError(`cannot read file: ${path}`);
    }
  }

  public write(path: string, content: string): void {
    try {
      writeFileSync(path, content, 'utf8');
    } catch {
      throw new EditorError(`cannot write file: ${path}`);
    }
  }
}
