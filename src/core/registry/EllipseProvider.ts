import type { Shape } from '../model/Shape';
import { Ellipse } from '../model/Ellipse';
import { BaseShapeProvider } from './BaseShapeProvider';
import type { ShapeParameterSpec } from './ShapeProvider';

/** `ellipse` 类型：`create ellipse <id> <cx> <cy> <rx> <ry> [fill]`。 */
export class EllipseProvider extends BaseShapeProvider {
  public readonly typeName = 'ellipse';
  public readonly elementTag = 'ellipse';
  public readonly parameters: readonly ShapeParameterSpec[] = [
    { name: 'cx', kind: 'number' },
    { name: 'cy', kind: 'number' },
    { name: 'rx', kind: 'number' },
    { name: 'ry', kind: 'number' },
    { name: 'fill', kind: 'color', optional: true },
  ];

  protected instantiate(id: string): Shape {
    return new Ellipse(id);
  }
}
