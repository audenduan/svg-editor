import { formatNumber, tryParseNumeric } from '../model/numbers';
import { STYLE_ATTRIBUTE_NAMES } from '../model/Shape';
import type { Shape } from '../model/Shape';
import type {
  ParameterValues,
  ShapeParameterSpec,
  ShapeProvider,
  ShapeRestoreRequest,
} from './ShapeProvider';

/**
 * 内置类型 Provider 的公共实现。
 *
 * 子类只声明三件事：类型名、元素名、参数 schema，以及怎样实例化一个"零值"图形。
 * `create`（命令行参数）与 `restore`（SVG 属性）都复用图形自己的 `setAttribute` 白名单，
 * 所以"白名单只有一处定义"，不会出现 CLI 能设、读回却设不了的偏差。
 */
export abstract class BaseShapeProvider implements ShapeProvider {
  public abstract readonly typeName: string;
  public abstract readonly elementTag: string;
  public abstract readonly parameters: readonly ShapeParameterSpec[];

  /** 创建一个各几何属性为 0 / 文本为空的图形实例。 */
  protected abstract instantiate(id: string): Shape;

  public create(id: string, values: ParameterValues): Shape {
    const shape = this.instantiate(id);
    for (const [name, value] of values) {
      shape.setAttribute(name, typeof value === 'number' ? formatNumber(value) : value);
    }
    return shape;
  }

  public restore(request: ShapeRestoreRequest): Shape {
    const shape = this.instantiate(request.id);
    for (const [name, rawValue] of request.attributes) {
      if (name === 'id') {
        continue;
      }
      if ((STYLE_ATTRIBUTE_NAMES as readonly string[]).includes(name)) {
        shape.setStyle(name, rawValue);
        continue;
      }
      if (shape.hasNumericAttribute(name)) {
        // 外部 SVG 里的百分比/带单位长度无法用数字表达，退化为 0；
        // 这在文档"一致性自查"里记为已知的 round-trip 限制。
        shape.setAttribute(name, formatNumber(tryParseNumeric(rawValue) ?? 0));
        continue;
      }
      shape.setExtraAttribute(name, rawValue);
    }
    if (shape.interpretsTextContent() && request.textContent !== '') {
      shape.setAttribute('text', request.textContent);
    }
    return shape;
  }

  public treeAnnotation(_shape: Shape): string {
    return '';
  }
}
