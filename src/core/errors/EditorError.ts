/**
 * 领域层唯一允许向外抛出的错误类型。
 *
 * CLI 层捕获它并把 `message` 渲染成 `error: <message>`；除此之外的任何异常都视为
 * 程序缺陷（内部错误）。把"可预期的用户错误"和"程序缺陷"分开，是"命令失败不改变
 * 任何状态"之外的另一个可测约定。
 */
export class EditorError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'EditorError';
  }
}
