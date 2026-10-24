import type { Shape } from '../model/Shape';
import { Line } from '../model/Line';
import { BaseShapeProvider } from './BaseShapeProvider';
import type { ShapeParameterSpec } from './ShapeProvider';

/** `line` 类型：`create line <id> <x1> <y1> <x2> <y2> [stroke]`。 */
export class LineProvider extends BaseShapeProvider {
  public readonly typeName = 'line';
  public readonly elementTag = 'line';
  public readonly parameters: readonly ShapeParameterSpec[] = [
    { name: 'x1', kind: 'number' },
    { name: 'y1', kind: 'number' },
    { name: 'x2', kind: 'number' },
    { name: 'y2', kind: 'number' },
    { name: 'stroke', kind: 'color', optional: true },
  ];

  protected instantiate(id: string): Shape {
    return new Line(id);
  }
}
