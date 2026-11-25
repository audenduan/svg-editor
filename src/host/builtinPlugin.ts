import { HelpText } from '../cli/HelpText';
import { EditorError } from '../core/errors/EditorError';
import type { ReorderDirection } from '../core/command/ReorderShapeCommand';
import { tryParseNumeric } from '../core/model/numbers';
import type { CommandExtension } from '../core/plugin/CommandExtension';
import type { Plugin } from '../core/plugin/PluginContext';
import { CircleProvider } from '../core/registry/CircleProvider';
import { EllipseProvider } from '../core/registry/EllipseProvider';
import { GroupProvider } from '../core/registry/GroupProvider';
import { LineProvider } from '../core/registry/LineProvider';
import { RectProvider } from '../core/registry/RectProvider';
import { TextProvider } from '../core/registry/TextProvider';
import type { EditorSession } from '../app/EditorSession';

/**
 * 默认内置插件：Phase 1 的六种图形 + 全部内置命令。
 *
 * Phase 2 起内置实现也走"注册机制"装配（`PluginContext`），与插件命令（`stats`/`dir`）
 * 共用同一条注册路径；内核与 `CommandDispatcher` 里看不到任何命令名。
 * 禁用所有可选插件时，仅装配本插件即可得到与 Phase 1 逐字节一致的 `final` 行为。
 */
export function createBuiltinPlugin(session: EditorSession): Plugin {
  return {
    name: '@svgframe/builtin',
    activate(context) {
      context.registerShapeProvider(new RectProvider());
      context.registerShapeProvider(new CircleProvider());
      context.registerShapeProvider(new EllipseProvider());
      context.registerShapeProvider(new LineProvider());
      context.registerShapeProvider(new TextProvider());
      context.registerShapeProvider(new GroupProvider());
      for (const command of createBuiltinCommands(session)) {
        context.registerCommand(command);
      }
    },
  };
}

function requireCount(usage: string, args: readonly string[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    throw new EditorError(`usage: ${usage}`);
  }
}

function toNumber(token: string, name: string): number {
  const value = tryParseNumeric(token);
  if (value === null) {
    throw new EditorError(`invalid number for ${name}: ${token}`);
  }
  return value;
}

/** Phase 1 的全部命令，签名为 `CommandExtension`（参数解析与文案都在这里）。 */
function createBuiltinCommands(session: EditorSession): CommandExtension[] {
  const command = (
    name: string,
    usage: string,
    summary: string,
    run: CommandExtension['run'],
  ): CommandExtension => ({ name, usage, summary, run });

  const reorder = (direction: ReorderDirection): CommandExtension['run'] => (args) => {
    requireCount(`reorder ${direction}`, args, 1);
    return session.reorder(args[0] as string, direction);
  };

  const commands: CommandExtension[] = [
    // 文档类
    command('init', 'init [w] [h]', 'new empty canvas (default 800x600)', (args) => {
      requireCount('init [w] [h]', args, 0, 2);
      const width = args.length >= 1 ? toNumber(args[0] as string, 'w') : 800;
      const height = args.length >= 2 ? toNumber(args[1] as string, 'h') : 600;
      return session.init(width, height);
    }),
    command('read', 'read <file.svg>', 'load an svg file as the current document', (args) => {
      requireCount('read <file.svg>', args, 1);
      return session.read(args[0] as string);
    }),
    command('save', 'save [file.svg]', 'save the current document', (args) => {
      requireCount('save [file.svg]', args, 0, 1);
      return session.save(args[0] ?? null);
    }),
    command('canvas', 'canvas [w] [h]', 'show or resize the canvas', (args) => {
      requireCount('canvas [w] [h]', args, 0, 2);
      if (args.length === 1) {
        throw new EditorError('usage: canvas [w] [h]');
      }
      const width = args.length >= 1 ? toNumber(args[0] as string, 'w') : null;
      const height = args.length >= 2 ? toNumber(args[1] as string, 'h') : null;
      return session.canvas(width, height);
    }),

    // 图形编辑类
    command('create', 'create <type> <id> [params…] [in <containerId>]', 'create a shape', (args) => {
      if (args.length < 2) {
        throw new EditorError('usage: create <type> <id> [params…] [in <containerId>]');
      }
      const typeName = args[0] as string;
      const id = args[1] as string;
      let params: string[] = args.slice(2);
      let containerId: string | null = null;
      if (args.length >= 4 && (args[args.length - 2] as string) === 'in') {
        containerId = args[args.length - 1] as string;
        params = args.slice(2, args.length - 2);
      }
      return session.createShape(typeName, id, params, containerId);
    }),
    command('delete', 'delete <id>', 'delete a shape (containers delete their whole subtree)', (args) => {
      requireCount('delete <id>', args, 1);
      return session.deleteShape(args[0] as string);
    }),
    command('move', 'move <id> <dx> <dy>', 'move a shape by an offset', (args) => {
      requireCount('move <id> <dx> <dy>', args, 3);
      return session.moveShape(
        args[0] as string,
        toNumber(args[1] as string, 'dx'),
        toNumber(args[2] as string, 'dy'),
      );
    }),
    command('scale', 'scale <id> <factor>', 'scale a shape by a positive factor', (args) => {
      requireCount('scale <id> <factor>', args, 2);
      return session.scaleShape(args[0] as string, toNumber(args[1] as string, 'factor'));
    }),
    command('set', 'set <id> <attr> <value>', 'set an attribute of a shape', (args) => {
      if (args.length < 3) {
        throw new EditorError('usage: set <id> <attr> <value>');
      }
      return session.setAttribute(args[0] as string, args[1] as string, args.slice(2).join(' '));
    }),
    command('group', 'group <newGid> <id1> <id2>…', 'group existing shapes into a new container', (args) => {
      if (args.length < 2) {
        throw new EditorError('usage: group <newGid> <id1> <id2>…');
      }
      return session.groupShapes(args[0] as string, args.slice(1));
    }),
    command('ungroup', 'ungroup <gid>', 'dissolve a container, moving its children up', (args) => {
      requireCount('ungroup <gid>', args, 1);
      return session.ungroupShape(args[0] as string);
    }),
    command('addto', 'addto <gid> <id>', 'move an existing shape into a container', (args) => {
      requireCount('addto <gid> <id>', args, 2);
      return session.addTo(args[0] as string, args[1] as string);
    }),
    command('front', 'front <id>', 'move a shape to the front of its siblings', reorder('front')),
    command('back', 'back <id>', 'move a shape to the back of its siblings', reorder('back')),

    // 显示类
    command('tree', 'tree [id]', 'print the document structure tree', (args) => {
      requireCount('tree [id]', args, 0, 1);
      return session.tree(args[0] ?? null);
    }),
    command('show', 'show <id>', 'print a shape attribute detail', (args) => {
      requireCount('show <id>', args, 1);
      return session.show(args[0] as string);
    }),

    // 撤销 / 重做
    command('undo', 'undo', 'undo the last edit command', () => session.undo()),
    command('redo', 'redo', 'redo the last undone edit command', () => session.redo()),
  ];

  // help 最后注册：它读的是"当前已注册命令表"，因此插件命令也会出现在 help 里。
  commands.push(
    command('help', 'help', 'show this help', (_args, context) =>
      new HelpText().lines(context.commands, context.shapeTypes),
    ),
  );
  return commands;
}