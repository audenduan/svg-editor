/**
 * 文件访问抽象的端口（Port）。
 *
 * 领域/应用层只依赖这个接口；真实 IO 在 `NodeFileStore`，测试用内存实现注入。
 * 实现必须在失败时抛 `EditorError('cannot read file: …')` /
 * `EditorError('cannot write file: …')`，这条约定由需求 4.2 固定。
 */
export interface FileStore {
  read(path: string): string;

  write(path: string, content: string): void;
}
