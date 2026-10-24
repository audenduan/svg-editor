import type { Shape } from '../model/Shape';
import { Rect } from '../model/Rect';
import { BaseShapeProvider } from './BaseShapeProvider';
import type { ShapeParameterSpec } from './ShapeProvider';

/** `rect` 类型：`create rect <id> <x> <y> <w> <h> [fill]`。 */
export class RectProvider extends BaseShapeProvider {
  public readonly typeName = 'rect';
  public readonly elementTag = 'rect';
  public readonly parameters: readonly ShapeParameterSpec[] = [
    { name: 'x', kind: 'number' },
    { name: 'y', kind: 'number' },
    { name: 'width', kind: 'number' },
    { name: 'height', kind: 'number' },
    { name: 'fill', kind: 'color', optional: true },
  ];

  protected instantiate(id: string): Shape {
    return new Rect(id);
  }
}
