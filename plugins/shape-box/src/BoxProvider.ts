import { EditorError } from '../../../src/core/errors/EditorError';
import type { Shape } from '../../../src/core/model/Shape';
import type {
  ParameterValues,
  ShapeParameterSpec,
  ShapeProvider,
  ShapeRestoreRequest,
} from '../../../src/core/registry/ShapeProvider';
import { BoxShape } from './BoxShape';

/** 序列化时用于区分 box 与普通 `<g>` 的属性（读写共用同一个常量）。 */
export const KIND_ATTRIBUTE = 'data-kind';
export const KIND_VALUE = 'box';

/**
 * `box` 的 `ShapeProvider`：与 `<g>` 共用元素标签，靠 `data-kind="box"` 区分。
 *
 * 三个内核钩子在这里落地：
 * - `matchesElement`：`read` 时把 `<g data-kind="box">` 认成 box；
 * - `derivedIds`：创建前把 `<id>-rect` / `<id>-label` 一起查重；
 * - `afterRestore`：子元素读入后校验"恰好 rect + text"，不满足则拒绝整个 read。
 */
export class BoxProvider implements ShapeProvider {
  public readonly typeName = 'box';

  public readonly elementTag = 'g';

  public readonly parameters: readonly ShapeParameterSpec[] = [
    { name: 'x', kind: 'number' },
    { name: 'y', kind: 'number' },
    { name: 'width', kind: 'number' },
    { name: 'height', kind: 'number' },
    { name: 'label', kind: 'text' },
  ];

  public matchesElement(attributes: ReadonlyMap<string, string>): boolean {
    return attributes.get(KIND_ATTRIBUTE) === KIND_VALUE;
  }

  public derivedIds(id: string): readonly string[] {
    return [`${id}-rect`, `${id}-label`];
  }

  public create(id: string, values: ParameterValues): Shape {
    const readNumber = (name: string): number => {
      const value = values.get(name);
      return typeof value === 'number' ? value : 0;
    };
    const label = values.get('label');
    return BoxShape.create(
      id,
      readNumber('x'),
      readNumber('y'),
      readNumber('width'),
      readNumber('height'),
      typeof label === 'string' ? label : '',
    );
  }

  /** 只恢复自身属性；子部件由读取器继续解析后挂进来，再经 `afterRestore` 校验。 */
  public restore(request: ShapeRestoreRequest): Shape {
    const box = new BoxShape(request.id);
    for (const [name, value] of request.attributes) {
      if (name === 'id' || name === KIND_ATTRIBUTE) {
        continue;
      }
      box.setExtraAttribute(name, value);
    }
    return box;
  }

  public afterRestore(shape: Shape): void {
    const children = shape.asContainer()?.children ?? [];
    const [plateId, captionId] = this.derivedIds(shape.id) as [string, string];
    const valid =
      children.length === 2 &&
      children[0]?.id === plateId &&
      children[0]?.elementName === 'rect' &&
      children[1]?.id === captionId &&
      children[1]?.elementName === 'text';
    if (!valid) {
      // 需求要求"明确拒绝整个读入"：抛错使 read 失败，原文档保持不变。
      throw new EditorError(
        `invalid box: ${shape.id} (expected <rect id="${plateId}"> and <text id="${captionId}">)`,
      );
    }
  }
}