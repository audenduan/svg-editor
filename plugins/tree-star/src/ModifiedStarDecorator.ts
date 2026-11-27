import type { Shape } from '../../../src/core/model/Shape';
import type { TreeDecorator, TreeLineContext } from '../../../src/core/plugin/TreeDecorator';

/**
 * `modified-star`：把"自上次保存以来被编辑过"的行尾标上 ` *`。
 *
 * dirty 语义（ADR-10 记录）：**按"发生过编辑命令"判定**。
 * - 一条修改类命令成功后，内核通过 `onEdited` 告诉它改动过哪些 id；
 * - 该行本身、它的**祖先容器**（`svg` 根行、外层 `g`、`box`）都会带 `*`；
 * - `save` 成功或文档被 `init` / `read` 替换时清空；
 * - `undo` 不撤销标记：`undo` 之后仍处于"自上次保存以来被编辑过"的状态，
 *   这本身就是这个语义的定义（另一套"内容比对"语义的取舍见 ADR-10）。
 *
 * 状态全部封装在实例字段里（规范要求），没有模块级变量，因此两个实例互不干扰。
 */
export class ModifiedStarDecorator implements TreeDecorator {
  public readonly name = 'modified-star';

  /** 自上次保存以来被直接改动过的图形 id。 */
  private readonly dirty = new Set<string>();

  /** 根行（`svg (w x h)`）是否标 `*`：任何一次编辑都会让根行进入未保存状态。 */
  private rootDirty = false;

  public suffix(context: TreeLineContext): string {
    if (context.isRoot) {
      return this.rootDirty ? ' *' : '';
    }
    const shape = context.shape;
    if (shape === null) {
      return '';
    }
    // 自己改过，或**子孙里有人改过** → 这一行都要标（祖先传播）。
    return this.dirty.has(shape.id) || hasDirtyDescendant(shape, this.dirty) ? ' *' : '';
  }

  public onEdited(changedIds: readonly string[]): void {
    this.rootDirty = true;
    for (const id of changedIds) {
      this.dirty.add(id);
    }
  }

  public onSaved(): void {
    this.dirty.clear();
    this.rootDirty = false;
  }

  public onDocumentReplaced(): void {
    this.dirty.clear();
    this.rootDirty = false;
  }

  /** 供测试与排错读状态（返回拷贝，外部改不动内部字段）。 */
  public dirtyIds(): readonly string[] {
    return [...this.dirty].sort();
  }
}

/** 子树里是否有被标记过的图形（只看数据，不看渲染）。 */
function hasDirtyDescendant(shape: Shape, dirty: ReadonlySet<string>): boolean {
  const container = shape.asContainer();
  if (container === null) {
    return false;
  }
  for (const child of container.children) {
    if (dirty.has(child.id) || hasDirtyDescendant(child, dirty)) {
      return true;
    }
  }
  return false;
}