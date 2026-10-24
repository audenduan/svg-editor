import { CircleProvider } from './CircleProvider';
import { EllipseProvider } from './EllipseProvider';
import { GroupProvider } from './GroupProvider';
import { LineProvider } from './LineProvider';
import { RectProvider } from './RectProvider';
import { ShapeTypeRegistry } from './ShapeTypeRegistry';
import { TextProvider } from './TextProvider';

/**
 * 组装内核内置的六种图形类型（rect / circle / ellipse / line / text / g）。
 *
 * 这是 Composition Root 的一部分：插件化阶段往这里多注册一个 Provider 即可，
 * 内核命令与 CLI 都不需要改。
 */
export function createDefaultShapeTypeRegistry(): ShapeTypeRegistry {
  const registry = new ShapeTypeRegistry();
  registry.register(new RectProvider());
  registry.register(new CircleProvider());
  registry.register(new EllipseProvider());
  registry.register(new LineProvider());
  registry.register(new TextProvider());
  registry.register(new GroupProvider());
  return registry;
}
