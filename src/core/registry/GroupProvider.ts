import type { Shape } from '../model/Shape';
import { Group } from '../model/Group';
import { BaseShapeProvider } from './BaseShapeProvider';
import type { ShapeParameterSpec } from './ShapeProvider';

/** `g` 类型：`create g <id>`，空容器，之后用 `create … in` / `addto` 填充。 */
export class GroupProvider extends BaseShapeProvider {
  public readonly typeName = 'g';
  public readonly elementTag = 'g';
  public readonly parameters: readonly ShapeParameterSpec[] = [];

  protected instantiate(id: string): Shape {
    return new Group(id);
  }
}
