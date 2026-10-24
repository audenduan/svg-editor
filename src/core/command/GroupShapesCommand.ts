import type { ContainerShape } from '../model/ContainerShape';
import type { Shape } from '../model/Shape';
import type { ShapeContainer } from '../model/ShapeContainer';
import type { Command } from './Command';

interface MemberOrigin {
  readonly shape: Shape;
  readonly parent: ShapeContainer;
  readonly index: number;
}

/**
 * `group`：新建一个 `<g>` 并把若干已有图形收编进去。
 *
 * 位置规则（实现时定的）：新 `<g>` 插到第一个被收编图形原来的位置；
 * 其余成员从各自原父容器摘出，保持相互顺序。undo 时按原下标升序放回各父容器。
 * 同一成员既包含容器又包含其子孙的情况由调用方（EditorSession）提前拦截。
 */
export class GroupShapesCommand implements Command {
  private origins: MemberOrigin[] = [];

  public constructor(
    private readonly group: ContainerShape,
    private readonly members: readonly Shape[],
  ) {}

  public execute(): string {
    const origins: MemberOrigin[] = this.members.map((shape) => {
      const parent = shape.requireParent();
      return { shape, parent, index: parent.indexOfChild(shape) };
    });
    const anchor = origins[0];
    // 摘除过程中，位于锚点之前的同父成员会让锚点下标左移。
    let insertIndex = anchor.index;
    for (const origin of origins) {
      if (origin.parent === anchor.parent && origin.index < anchor.index) {
        insertIndex -= 1;
      }
    }
    for (const origin of origins) {
      origin.parent.removeChild(origin.shape);
    }
    anchor.parent.insertChildAt(insertIndex, this.group);
    for (const origin of origins) {
      this.group.appendChild(origin.shape);
    }
    this.origins = origins;
    return `${this.group.label} created with ${this.members.length} children`;
  }

  public undo(): string {
    const host = this.group.requireParent();
    host.removeChild(this.group);
    for (const member of this.members) {
      this.group.removeChild(member);
    }
    const sorted = [...this.origins].sort((a, b) => a.index - b.index);
    for (const origin of sorted) {
      origin.parent.insertChildAt(origin.index, origin.shape);
    }
    return `${this.group.label} dissolved, ${this.members.length} children restored`;
  }
}
