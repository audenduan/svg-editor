import { EditorError } from '../errors/EditorError';
import type { TreeDecorator } from './TreeDecorator';

/**
 * 树标签注册表（内核侧）：`TreeDecorator` 扩展点的存放处。
 *
 * 顺序 = 注册顺序 = 同一行多个标签的拼接顺序（ADR-3）。
 */
export class TreeDecoratorRegistry {
  private readonly decorators: TreeDecorator[] = [];

  public register(decorator: TreeDecorator): void {
    if (this.decorators.some((existing) => existing.name === decorator.name)) {
      throw new EditorError(`duplicate tree decorator: ${decorator.name}`);
    }
    this.decorators.push(decorator);
  }

  public has(name: string): boolean {
    return this.decorators.some((decorator) => decorator.name === name);
  }

  public list(): readonly TreeDecorator[] {
    return [...this.decorators];
  }

  /** 行尾标签：按注册顺序拼接，全部返回空串时结果为空串。 */
  public suffixFor(context: Parameters<TreeDecorator['suffix']>[0]): string {
    let suffix = '';
    for (const decorator of this.decorators) {
      suffix += decorator.suffix(context);
    }
    return suffix;
  }

  public notifySaved(): void {
    for (const decorator of this.decorators) {
      decorator.onSaved?.();
    }
  }

  public notifyDocumentReplaced(): void {
    for (const decorator of this.decorators) {
      decorator.onDocumentReplaced?.();
    }
  }
}