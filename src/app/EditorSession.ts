import { EditorError } from '../core/errors/EditorError';
import { CommandHistory } from '../core/command/CommandHistory';
import { AddToContainerCommand } from '../core/command/AddToContainerCommand';
import { CreateShapeCommand } from '../core/command/CreateShapeCommand';
import { DeleteShapeCommand } from '../core/command/DeleteShapeCommand';
import { GroupShapesCommand } from '../core/command/GroupShapesCommand';
import { MoveShapeCommand } from '../core/command/MoveShapeCommand';
import { ReorderShapeCommand } from '../core/command/ReorderShapeCommand';
import type { ReorderDirection } from '../core/command/ReorderShapeCommand';
import { ScaleShapeCommand } from '../core/command/ScaleShapeCommand';
import { SetAttributeCommand } from '../core/command/SetAttributeCommand';
import { UngroupShapeCommand } from '../core/command/UngroupShapeCommand';
import { formatNumber } from '../core/model/numbers';
import type { Shape } from '../core/model/Shape';
import type { ShapeContainer } from '../core/model/ShapeContainer';
import { SvgDocument } from '../core/model/SvgDocument';
import type { AttributeApplyContext } from '../core/plugin/AttributeHandler';
import type { ExtensionRegistry } from '../core/plugin/ExtensionRegistry';
import type { FileStore } from '../io/FileStore';
import { SvgReader } from '../io/SvgReader';
import { SvgWriter } from '../io/SvgWriter';
import { ShowRenderer } from '../render/ShowRenderer';
import { TreeRenderer } from '../render/TreeRenderer';

export interface EditorSessionOptions {
  /** 四类扩展的统一存放处（图形类型、命令表之外的装饰器/属性处理器都从这里取）。 */
  readonly extensions: ExtensionRegistry;
  readonly fileStore: FileStore;
}

/**
 * 应用层门面：一条命令 = 一个方法，方法返回**面向用户的输出行**。
 *
 * 它负责三件事：当前文档状态与 IO（文档类命令）、前置校验（需求 4.2 的错误表）、
 * 把编辑命令包进 `CommandHistory`（编辑类命令）。命令实现（CLI 侧）不接触模型。
 *
 * Phase 2 起它只依赖扩展点接口：图形类型走 `ExtensionRegistry.shapeRegistry`，
 * `set` 先问 `AttributeHandlerRegistry`，`tree` 的行尾标签来自 `TreeDecoratorRegistry`。
 */
export class EditorSession {
  private readonly history = new CommandHistory();
  private readonly treeRenderer: TreeRenderer;
  private readonly showRenderer = new ShowRenderer();
  private documentValue: SvgDocument | null = null;

  public constructor(private readonly options: EditorSessionOptions) {
    this.treeRenderer = new TreeRenderer(options.extensions.decoratorRegistry);
  }

  /** 当前文档（命令插件通过 `CommandContext` 读它）。 */
  public get document(): SvgDocument | null {
    return this.documentValue;
  }

  /** 已注册图形类型名（注册顺序），供 `help` 展示。 */
  public get shapeTypeNames(): readonly string[] {
    return this.options.extensions.shapeRegistry
      .listProviders()
      .map((provider) => provider.typeName);
  }

  // ------------------------------------------------------------------
  // 文档类命令：执行后 undo/redo 被禁止（需求 4.3）
  // ------------------------------------------------------------------

  public init(width: number, height: number): string[] {
    if (!(width > 0) || !(height > 0)) {
      throw new EditorError('canvas size must be positive');
    }
    this.documentValue = new SvgDocument(width, height);
    this.history.resetAfterIo();
    this.options.extensions.decoratorRegistry.notifyDocumentReplaced();
    return [`canvas ${formatNumber(width)}x${formatNumber(height)} created`];
  }

  public read(path: string): string[] {
    const text = this.options.fileStore.read(path);
    const result = new SvgReader(this.options.extensions.shapeRegistry).read(text);
    result.document.sourcePath = path;
    this.documentValue = result.document;
    this.history.resetAfterIo();
    this.options.extensions.decoratorRegistry.notifyDocumentReplaced();
    const lines = result.warnings.map((warning) => `warning: ${warning}`);
    lines.push(`read ${path} (${result.document.elementCount()} elements)`);
    return lines;
  }

  public save(path: string | null): string[] {
    const document = this.requireDocument();
    const target = path ?? document.sourcePath;
    if (target === null) {
      throw new EditorError('no file name: use save <file.svg>');
    }
    const xml = new SvgWriter().write(document);
    this.options.fileStore.write(target, xml);
    document.sourcePath = target;
    this.history.lockAfterIo();
    // 保存成功后再通知装饰器：`modified-star` 以此刻的内容为"已保存基线"。
    this.options.extensions.decoratorRegistry.notifySaved();
    return [`saved to ${target} (${document.elementCount()} elements)`];
  }

  public canvas(width: number | null, height: number | null): string[] {
    const document = this.requireDocument();
    if (width === null && height === null) {
      return [`canvas ${formatNumber(document.width)}x${formatNumber(document.height)}`];
    }
    if (width === null || height === null) {
      throw new EditorError('usage: canvas [w] [h]');
    }
    if (!(width > 0) || !(height > 0)) {
      throw new EditorError('canvas size must be positive');
    }
    document.resize(width, height);
    this.history.lockAfterIo();
    return [`canvas resized to ${formatNumber(width)}x${formatNumber(height)}`];
  }

  // ------------------------------------------------------------------
  // 编辑类命令：全部经过 CommandHistory（一条命令 = 一个 undo 单元）
  // ------------------------------------------------------------------

  public createShape(
    typeName: string,
    id: string,
    params: readonly string[],
    containerId: string | null,
  ): string[] {
    const document = this.requireDocument();
    if (document.findShape(id) !== null) {
      throw new EditorError(`id already exists: ${id}`);
    }
    // 插件复合图形会一并生成子部件 id（如 `<id>-rect`）：整棵新子树的 id 都要先查重，
    // 冲突则整条命令失败，不留半个容器或孤儿子部件。
    const provider = this.options.extensions.shapeRegistry.findProvider(typeName);
    for (const derivedId of provider?.derivedIds?.(id) ?? []) {
      if (document.findShape(derivedId) !== null) {
        throw new EditorError(`id already exists: ${derivedId}`);
      }
    }
    const parent = this.resolveContainer(document, containerId);
    this.requireAcceptsChildren(parent, containerId);
    const shape = this.options.extensions.shapeRegistry.createShape(typeName, id, params);
    return [this.history.run(new CreateShapeCommand(shape, parent))];
  }

  public deleteShape(id: string): string[] {
    const shape = this.requireShape(id);
    this.requireRemovable(shape);
    return [this.history.run(new DeleteShapeCommand(shape))];
  }

  public moveShape(id: string, dx: number, dy: number): string[] {
    const shape = this.requireShape(id);
    return [this.history.run(new MoveShapeCommand(shape, dx, dy))];
  }

  public scaleShape(id: string, factor: number): string[] {
    if (!(factor > 0)) {
      throw new EditorError('scale factor must be positive');
    }
    const shape = this.requireShape(id);
    return [this.history.run(new ScaleShapeCommand(shape, factor))];
  }

  /**
   * `set` 的属性设置流程（phase_cli_2 §3.2）：
   * 先询问已注册的 `AttributeHandler`（按注册顺序，首个命中独占），
   * 没有命中才走 Phase 1 的默认白名单规则。
   */
  public setAttribute(id: string, attributeName: string, value: string): string[] {
    const document = this.requireDocument();
    const shape = this.requireShape(id);
    const handler = this.options.extensions.attributeHandlerRegistry.findHandler(shape, attributeName);
    const touched: Shape[] = [];
    const context: AttributeApplyContext = {
      findShape: (shapeId) => document.findShape(shapeId),
      touch: (target) => {
        if (!touched.includes(target)) {
          touched.push(target);
        }
      },
    };
    return [this.history.run(new SetAttributeCommand(shape, attributeName, value, handler, context))];
  }

  public groupShapes(newGroupId: string, memberIds: readonly string[]): string[] {
    const document = this.requireDocument();
    if (document.findShape(newGroupId) !== null) {
      throw new EditorError(`id already exists: ${newGroupId}`);
    }
    if (memberIds.length === 0) {
      throw new EditorError('usage: group <newGid> <id1> <id2>…');
    }
    const members = memberIds.map((memberId) => this.requireShape(memberId));
    for (const member of members) {
      // group 会把成员从原父级摘走：复合图形的必要子部件不能这样被"借走"。
      this.requireRemovable(member);
    }
    const seen = new Set<string>();
    for (const memberId of memberIds) {
      if (seen.has(memberId)) {
        throw new EditorError(`duplicate id in group: ${memberId}`);
      }
      seen.add(memberId);
    }
    // 收编"容器 + 它的子孙"会让新容器落在自己的子孙里，需求 4.2 明确拒绝。
    for (const member of members) {
      const container = member.asContainer();
      if (container === null) {
        continue;
      }
      for (const other of members) {
        if (other !== member && container.isAncestorOf(other)) {
          throw new EditorError(`cannot group a container into its own descendant: ${member.id}`);
        }
      }
    }
    const group = this.options.extensions.shapeRegistry.createShape('g', newGroupId, []).asContainer();
    if (group === null) {
      throw new Error('g provider must produce a container');
    }
    return [this.history.run(new GroupShapesCommand(group, members))];
  }

  public ungroupShape(id: string): string[] {
    const shape = this.requireShape(id);
    const container = shape.asContainer();
    if (container === null) {
      throw new EditorError(`not a container: ${id}`);
    }
    if (shape.isComposite()) {
      throw new EditorError(`cannot ungroup composite shape: ${id}`);
    }
    if (shape.parent === this.requireDocument()) {
      throw new EditorError(`cannot ungroup top-level container: ${id}`);
    }
    return [this.history.run(new UngroupShapeCommand(container))];
  }

  public addTo(containerId: string, shapeId: string): string[] {
    const document = this.requireDocument();
    const target = document.findShape(containerId);
    if (target === null) {
      throw new EditorError(`no such container: ${containerId}`);
    }
    const container = target.asContainer();
    if (container === null) {
      throw new EditorError(`not a container: ${containerId}`);
    }
    const shape = this.requireShape(shapeId);
    this.requireRemovable(shape);
    this.requireAcceptsChildren(container, containerId);
    if (shape === target) {
      throw new EditorError(`cannot move a container into itself: ${shapeId}`);
    }
    const sourceContainer = shape.asContainer();
    if (sourceContainer !== null && sourceContainer.isAncestorOf(target)) {
      throw new EditorError(`cannot move a container into its own descendant: ${shapeId}`);
    }
    return [this.history.run(new AddToContainerCommand(shape, container))];
  }

  public reorder(id: string, direction: ReorderDirection): string[] {
    const shape = this.requireShape(id);
    // 子部件顺序是复合图形不变量的一部分（如 box 的「底板 → 标签」）：不得通过 front/back 打乱。
    const parent = shape.parent;
    if (parent !== null && parent.protectsChildren?.() === true) {
      throw new EditorError(`cannot reorder the parts of a composite shape: ${shape.id}`);
    }
    return [this.history.run(new ReorderShapeCommand(shape, direction))];
  }

  // ------------------------------------------------------------------
  // 显示类命令：不进入 undo 栈
  // ------------------------------------------------------------------

  public tree(rootId: string | null): string[] {
    const document = this.requireDocument();
    if (rootId === null) {
      return this.treeRenderer.renderDocument(document);
    }
    return this.treeRenderer.renderSubtree(this.requireShape(rootId));
  }

  public show(id: string): string[] {
    return this.showRenderer.render(this.requireShape(id));
  }

  // ------------------------------------------------------------------
  // 撤销 / 重做
  // ------------------------------------------------------------------

  public undo(): string[] {
    this.requireDocument();
    return [this.history.undo()];
  }

  public redo(): string[] {
    this.requireDocument();
    return [this.history.redo()];
  }

  // ------------------------------------------------------------------
  // 内部辅助
  // ------------------------------------------------------------------

  private requireDocument(): SvgDocument {
    if (this.documentValue === null) {
      throw new EditorError("no document. use 'init' or 'read' first");
    }
    return this.documentValue;
  }

  private requireShape(id: string): Shape {
    const shape = this.requireDocument().findShape(id);
    if (shape === null) {
      throw new EditorError(`no such shape: ${id}`);
    }
    return shape;
  }

  /** 复合图形保护契约：其父容器声明 `protectsChildren()` 时，子部件不得删除或挪走。 */
  private requireRemovable(shape: Shape): void {
    const parent = shape.parent;
    if (parent !== null && parent.protectsChildren?.() === true) {
      throw new EditorError(`cannot remove a required sub-part: ${shape.id}`);
    }
  }

  /**
   * 复合图形的另一半契约：目标容器保护子部件时，**也不许**往里加新子部件。
   * 否则 `create … in <box>` / `addto <box> <x>` 会让"恰好两个子部件"的图形变成三个。
   */
  private requireAcceptsChildren(container: ShapeContainer, containerId: string | null): void {
    if (container.protectsChildren?.() === true) {
      throw new EditorError(`cannot add a child to a composite shape: ${containerId ?? '<svg>'}`);
    }
  }

  /** `create … in <containerId>`：目标必须存在且是容器，两个错误分开报。 */
  private resolveContainer(document: SvgDocument, containerId: string | null): ShapeContainer {
    if (containerId === null) {
      return document;
    }
    const target = document.findShape(containerId);
    if (target === null) {
      throw new EditorError(`no such container: ${containerId}`);
    }
    const container = target.asContainer();
    if (container === null) {
      throw new EditorError(`not a container: ${containerId}`);
    }
    return container;
  }
}