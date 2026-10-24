import type { Shape } from '../model/Shape';
import { TextShape } from '../model/TextShape';
import { BaseShapeProvider } from './BaseShapeProvider';
import type { ShapeParameterSpec } from './ShapeProvider';

/** `text` 类型：`create text <id> <x> <y> "content"`（内容为元素文本，不是属性）。 */
export class TextProvider extends BaseShapeProvider {
  public readonly typeName = 'text';
  public readonly elementTag = 'text';
  public readonly parameters: readonly ShapeParameterSpec[] = [
    { name: 'x', kind: 'number' },
    { name: 'y', kind: 'number' },
    { name: 'text', kind: 'text' },
  ];

  protected instantiate(id: string): Shape {
    return new TextShape(id);
  }
}
