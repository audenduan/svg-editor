import type { Shape } from '../model/Shape';

/**
 * 扩展点 **`TreeDecorator`**：结构树每行行尾的标签。
 *
 * 渲染器只在行尾拼接各装饰器返回的字符串（按注册顺序），不认识任何具体标签；
 * 新增标签不需要改内核或渲染器。缺省（无任何装饰器）时输出与 Phase 1 逐字节相同。
 */
export interface TreeDecorator {
  /** 稳定的注册名（重复注册检测、清单校验的键）。 */
  readonly name: string;

  /**
   * 该行行尾的标签，返回 `''` 表示不加。
   * 约定返回值自带前导空格（如 `' *'`、`' (box)'`），便于多个标签顺序拼接。
   */
  suffix(context: TreeLineContext): string;

  /** `save` 成功后调用（例如记录"已保存快照"，用于判定未保存变化）。 */
  onSaved?(): void;

  /** `init` / `read` 替换文档之后调用（重置自身状态）。 */
  onDocumentReplaced?(): void;

  /**
   * 一条**修改类命令**成功之后调用，`changedIds` 是它改动过的图形 id
   * （空数组表示"改动范围未知"，例如 `undo` / `redo`）。
   *
   * 这是"发生过编辑命令"式 dirty 语义的钩子：装饰器据此把 id 记进自己的字段，
   * `save` 时由 `onSaved` 清空。内核不知道谁在用这个信号，也不解释它的含义。
   */
  onEdited?(changedIds: readonly string[]): void;
}

/** 一行结构树对应的上下文。 */
export interface TreeLineContext {
  /** 该行对应的图形；根行（`svg (800x600)`）为 `null`。 */
  readonly shape: Shape | null;

  /** 是否为根画布行。 */
  readonly isRoot: boolean;
}