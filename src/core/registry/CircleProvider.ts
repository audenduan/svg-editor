import type { Shape } from '../model/Shape';
import { Circle } from '../model/Circle';
import { BaseShapeProvider } from './BaseShapeProvider';
import type { ShapeParameterSpec } from './ShapeProvider';

/** `circle` 类型：`create circle <id> <cx> <cy> <r> [fill]`。 */
export class CircleProvider extends BaseShapeProvider {
  public readonly typeName = 'circle';
  public readonly elementTag = 'circle';
  public readonly parameters: readonly ShapeParameterSpec[] = [
    { name: 'cx', kind: 'number' },
    { name: 'cy', kind: 'number' },
    { name: 'r', kind: 'number' },
    { name: 'fill', kind: 'color', optional: true },
  ];

  protected instantiate(id: string): Shape {
    return new Circle(id);
  }
}
