import { EditorSession } from '../app/EditorSession';
import type { ReorderDirection } from '../core/command/ReorderShapeCommand';
import { tryParseNumeric } from '../core/model/numbers';
import { EditorError } from '../core/errors/EditorError';
import type { ShapeTypeRegistry } from '../core/registry/ShapeTypeRegistry';
import { HelpText } from './HelpText';

/** 一条命令的注册项：usage/summary 供 help；run 接收已分词的参数并返回输出行。 */
export interface CommandEntry {
  readonly name: string;
  readonly usage: string;
  readonly summary: string;
  run(tokens: readonly string[]): readonly string[];
}

/**
 * 命令分发：命令名 → 实现。这是架构方案标注的**两处按名分派点之一**（另一处是
 * `ShapeTypeRegistry.createShape`）。每个 handler 只做参数解析与校验，随后调用
 * `EditorSession`（参数个数错误抛 `usage:` 错误，由 CLI 统一加 `error:` 前缀）。
 */
export class CommandDispatcher {
  private readonly entries = new Map<string, CommandEntry>();

  public constructor(
    private readonly session: EditorSession,
    private readonly registry: ShapeTypeRegistry,
  ) {
    this.registerBuiltins();
  }

  public find(name: string): CommandEntry | null {
    return this.entries.get(name) ?? null;
  }

  public list(): readonly CommandEntry[] {
    return [...this.entries.values()];
  }

  public listShapeTypeNames(): readonly string[] {
    // 保持注册顺序（需求 3 表格顺序）：rect circle ellipse line text g
    return this.registry.listProviders().map((provider) => provider.typeName);
  }

  private register(
    name: string,
    usage: string,
    summary: string,
    run: (tokens: readonly string[]) => readonly string[],
  ): void {
    this.entries.set(name, { name, usage, summary, run });
  }

  private requireCount(usage: string, tokens: readonly string[], min: number, max = min): void {
    if (tokens.length < min || tokens.length > max) {
      throw new EditorError(`usage: ${usage}`);
    }
  }

  private toNumber(token: string, name: string): number {
    const value = tryParseNumeric(token);
    if (value === null) {
      throw new EditorError(`invalid number for ${name}: ${token}`);
    }
    return value;
  }

  private registerBuiltins(): void {
    // 文档类
    this.register(
      'init',
      'init [w] [h]',
      'new empty canvas (default 800x600)',
      (tokens) => {
        this.requireCount('init [w] [h]', tokens, 0, 2);
        const width = tokens.length >= 1 ? this.toNumber(tokens[0] as string, 'w') : 800;
        const height = tokens.length >= 2 ? this.toNumber(tokens[1] as string, 'h') : 600;
        return this.session.init(width, height);
      },
    );
    this.register(
      'read',
      'read <file.svg>',
      'load an svg file as the current document',
      (tokens) => {
        this.requireCount('read <file.svg>', tokens, 1);
        return this.session.read(tokens[0] as string);
      },
    );
    this.register(
      'save',
      'save [file.svg]',
      'save the current document',
      (tokens) => {
        this.requireCount('save [file.svg]', tokens, 0, 1);
        return this.session.save(tokens[0] ?? null);
      },
    );
    this.register(
      'canvas',
      'canvas [w] [h]',
      'show or resize the canvas',
      (tokens) => {
        this.requireCount('canvas [w] [h]', tokens, 0, 2);
        if (tokens.length === 1) {
          throw new EditorError('usage: canvas [w] [h]');
        }
        const width = tokens.length >= 1 ? this.toNumber(tokens[0] as string, 'w') : null;
        const height = tokens.length >= 2 ? this.toNumber(tokens[1] as string, 'h') : null;
        return this.session.canvas(width, height);
      },
    );

    // 图形编辑类
    this.register(
      'create',
      'create <type> <id> [params…] [in <containerId>]',
      'create a shape',
      (tokens) => {
        if (tokens.length < 2) {
          throw new EditorError('usage: create <type> <id> [params…] [in <containerId>]');
        }
        const typeName = tokens[0] as string;
        const id = tokens[1] as string;
        let params: string[] = tokens.slice(2);
        let containerId: string | null = null;
        if (tokens.length >= 4 && (tokens[tokens.length - 2] as string) === 'in') {
          containerId = tokens[tokens.length - 1] as string;
          params = tokens.slice(2, tokens.length - 2);
        }
        return this.session.createShape(typeName, id, params, containerId);
      },
    );
    this.register(
      'delete',
      'delete <id>',
      'delete a shape (containers delete their whole subtree)',
      (tokens) => {
        this.requireCount('delete <id>', tokens, 1);
        return this.session.deleteShape(tokens[0] as string);
      },
    );
    this.register(
      'move',
      'move <id> <dx> <dy>',
      'move a shape by an offset',
      (tokens) => {
        this.requireCount('move <id> <dx> <dy>', tokens, 3);
        return this.session.moveShape(
          tokens[0] as string,
          this.toNumber(tokens[1] as string, 'dx'),
          this.toNumber(tokens[2] as string, 'dy'),
        );
      },
    );
    this.register(
      'scale',
      'scale <id> <factor>',
      'scale a shape by a positive factor',
      (tokens) => {
        this.requireCount('scale <id> <factor>', tokens, 2);
        return this.session.scaleShape(tokens[0] as string, this.toNumber(tokens[1] as string, 'factor'));
      },
    );
    this.register(
      'set',
      'set <id> <attr> <value>',
      'set an attribute of a shape',
      (tokens) => {
        if (tokens.length < 3) {
          throw new EditorError('usage: set <id> <attr> <value>');
        }
        return this.session.setAttribute(tokens[0] as string, tokens[1] as string, tokens.slice(2).join(' '));
      },
    );
    this.register(
      'group',
      'group <newGid> <id1> <id2>…',
      'group existing shapes into a new container',
      (tokens) => {
        if (tokens.length < 2) {
          throw new EditorError('usage: group <newGid> <id1> <id2>…');
        }
        return this.session.groupShapes(tokens[0] as string, tokens.slice(1));
      },
    );
    this.register(
      'ungroup',
      'ungroup <gid>',
      'dissolve a container, moving its children up',
      (tokens) => {
        this.requireCount('ungroup <gid>', tokens, 1);
        return this.session.ungroupShape(tokens[0] as string);
      },
    );
    this.register(
      'addto',
      'addto <gid> <id>',
      'move an existing shape into a container',
      (tokens) => {
        this.requireCount('addto <gid> <id>', tokens, 2);
        return this.session.addTo(tokens[0] as string, tokens[1] as string);
      },
    );
    const reorder = (direction: ReorderDirection) => (tokens: readonly string[]) => {
      this.requireCount(`reorder ${direction}`, tokens, 1);
      return this.session.reorder(tokens[0] as string, direction);
    };
    this.register('front', 'front <id>', 'move a shape to the front of its siblings', reorder('front'));
    this.register('back', 'back <id>', 'move a shape to the back of its siblings', reorder('back'));

    // 显示类
    this.register(
      'tree',
      'tree [id]',
      'print the document structure tree',
      (tokens) => {
        this.requireCount('tree [id]', tokens, 0, 1);
        return this.session.tree(tokens[0] ?? null);
      },
    );
    this.register(
      'show',
      'show <id>',
      'print a shape attribute detail',
      (tokens) => {
        this.requireCount('show <id>', tokens, 1);
        return this.session.show(tokens[0] as string);
      },
    );

    // 撤销 / 重做
    this.register('undo', 'undo', 'undo the last edit command', () => this.session.undo());
    this.register('redo', 'redo', 'redo the last undone edit command', () => this.session.redo());

    // help 放在最后注册，它的实现引用完整命令表
    this.register('help', 'help', 'show this help', () =>
      new HelpText().lines(this.list(), this.listShapeTypeNames()),
    );
  }
}