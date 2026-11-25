import type { TreeDecorator, TreeLineContext } from '../../../src/core/plugin/TreeDecorator';

/**
 * 树标签 `box-type-label`：`box` 的行尾加 `(box)`。
 *
 * 内核与渲染器都不知道这个标签的存在——它们只把各装饰器返回的字符串拼在行尾。
 * 卸载本装饰器后，结构树输出立即回到"无标签"的基线字节。
 */
export class BoxTypeLabel implements TreeDecorator {
  public readonly name = 'box-type-label';

  public suffix(context: TreeLineContext): string {
    return context.shape?.typeName === 'box' ? ' (box)' : '';
  }
}