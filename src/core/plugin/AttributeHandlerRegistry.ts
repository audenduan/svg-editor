import { EditorError } from '../errors/EditorError';
import type { Shape } from '../model/Shape';
import type { AttributeHandler } from './AttributeHandler';

/**
 * 属性处理器注册表（内核侧）：`AttributeHandler` 扩展点的存放处。
 *
 * 冲突规则（ADR-1）：按注册顺序取**第一个命中的处理器**独占执行；
 * 不做多处理器组合，也不允许后注册者覆盖前者的结果。
 */
export class AttributeHandlerRegistry {
  private readonly handlers: AttributeHandler[] = [];

  public register(handler: AttributeHandler): void {
    if (this.handlers.some((existing) => existing.name === handler.name)) {
      throw new EditorError(`duplicate attribute handler: ${handler.name}`);
    }
    this.handlers.push(handler);
  }

  public has(name: string): boolean {
    return this.handlers.some((handler) => handler.name === name);
  }

  public list(): readonly AttributeHandler[] {
    return [...this.handlers];
  }

  /** 第一个声明负责该图形+属性的处理器；没有则 `null`（由内核走 Phase 1 默认规则）。 */
  public findHandler(shape: Shape, attr: string): AttributeHandler | null {
    for (const handler of this.handlers) {
      if (handler.handles(shape, attr)) {
        return handler;
      }
    }
    return null;
  }
}