/**
 * 最小 `vscode` 类型声明（手写，仅声明本扩展实际用到的 API）。
 *
 * 背景：本机没有安装 `@types/vscode`，扩展又需要导入 `vscode` 模块才能通过 `tsc`。
 * 这里用 `declare module 'vscode'` 提供一份“刚好够编译”的替身声明；运行时真正的
 * `vscode` 模块由 VSCode Extension Host 注入，与本文件无关（本文件只在编译期生效）。
 */
declare module 'vscode' {
  /** 文档内一个位置（行号 / 列号，均从 0 开始）。 */
  export class Position {
    readonly line: number;
    readonly character: number;
    constructor(line: number, character: number);
  }

  /** 文档内的一段区间。 */
  export class Range {
    readonly start: Position;
    readonly end: Position;
    constructor(start: Position, end: Position);
    constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  }

  /** 资源标识（文件 / 文件夹等）。 */
  export class Uri {
    readonly scheme: string;
    readonly path: string;
    readonly fsPath: string;
    static file(path: string): Uri;
    static parse(value: string): Uri;
    toString(): string;
  }

  /** 文件系统条目类型。 */
  export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64,
  }

  /** `workspace.fs.stat` 的返回结构。 */
  export interface FileStat {
    readonly type: FileType;
    readonly ctime: number;
    readonly mtime: number;
    readonly size: number;
  }

  /** 主题颜色（本扩展未直接使用，但 `FileDecoration.color` 需要）。 */
  export class ThemeColor {
    constructor(id: string);
    readonly id: string;
  }

  /**
   * 附加在资源管理器条目上的显示信息。
   * `badge` 是文件名右侧的两字符徽标；`tooltip` 是悬停提示。
   */
  export interface FileDecoration {
    badge?: string;
    color?: ThemeColor;
    tooltip?: string;
    propagate?: boolean;
  }

  /** 可释放资源（注册返回值等）。 */
  export interface Disposable {
    dispose(): void;
  }

  /** 取消令牌（provider 回调会收到，本扩展不使用）。 */
  export interface CancellationToken {
    readonly isCancellationRequested: boolean;
  }

  /** 事件订阅函数类型。 */
  export type Event<T> = (
    listener: (e: T) => unknown,
    thisArgs?: unknown,
    disposables?: Disposable[],
  ) => Disposable;

  /** 事件发射器。 */
  export class EventEmitter<T> {
    readonly event: Event<T>;
    fire(data: T): void;
    dispose(): void;
  }

  /** `Thenable`（VSCode 对 PromiseLike 的别名）。 */
  export interface Thenable<T> extends PromiseLike<T> {}

  /** provider 返回值可以是同步值，也可以是 Promise。 */
  export type ProviderResult<T> = T | undefined | null | Thenable<T | undefined | null>;

  /** 文件装饰提供者：把“文件系统条目”适配成“带徽标/提示的显示条目”。 */
  export interface FileDecorationProvider {
    provideFileDecoration(
      uri: Uri,
      token: CancellationToken,
    ): ProviderResult<FileDecoration | undefined>;
    /** 当装饰需要刷新时触发；`undefined` 表示全部刷新（VSCode 约定）。 */
    onDidChangeFileDecorations?: Event<Uri | Uri[] | undefined>;
  }

  /** 文本文档（只读视图）。 */
  export interface TextDocument {
    readonly uri: Uri;
    readonly fileName: string;
    readonly languageId: string;
    readonly version: number;
    readonly lineCount: number;
    getText(range?: Range): string;
    positionAt(offset: number): Position;
    offsetAt(position: Position): number;
  }

  export interface FileCreateEvent {
    readonly files: readonly Uri[];
  }

  export interface FileDeleteEvent {
    readonly files: readonly Uri[];
  }

  /** 文档选择器（用于按语言 / scheme / 文件名匹配文档）。 */
  export interface DocumentFilter {
    language?: string;
    scheme?: string;
    pattern?: string;
  }

  export type DocumentSelector = string | DocumentFilter | ReadonlyArray<string | DocumentFilter>;

  /** 大纲节点的语义类型。 */
  export enum SymbolKind {
    File = 0,
    Module = 1,
    Namespace = 2,
    Package = 3,
    Class = 4,
    Method = 5,
    Property = 6,
    Field = 7,
    Constructor = 8,
    Enum = 9,
    Interface = 10,
    Function = 11,
    Variable = 12,
    Constant = 13,
    String = 14,
    Number = 15,
    Boolean = 16,
    Array = 17,
    Object = 19,
    Key = 20,
    Null = 21,
    EnumMember = 22,
    Struct = 23,
    Event = 24,
    Operator = 25,
    TypeParameter = 26,
  }

  /** 大纲中的一个符号节点。 */
  export class DocumentSymbol {
    name: string;
    detail: string;
    kind: SymbolKind;
    range: Range;
    selectionRange: Range;
    children: DocumentSymbol[];
    constructor(
      name: string,
      detail: string,
      kind: SymbolKind,
      range: Range,
      selectionRange: Range,
    );
  }

  /** 文档符号提供者（原生大纲视图的数据源）。 */
  export interface DocumentSymbolProvider {
    provideDocumentSymbols(
      document: TextDocument,
      token: CancellationToken,
    ): ProviderResult<DocumentSymbol[]>;
  }

  /** 扩展激活上下文。 */
  export interface ExtensionContext {
    subscriptions: Disposable[];
  }

  export namespace window {
    function registerFileDecorationProvider(provider: FileDecorationProvider): Disposable;
  }

  export namespace workspace {
    const onDidSaveTextDocument: Event<TextDocument>;
    const onDidCreateFiles: Event<FileCreateEvent>;
    const onDidDeleteFiles: Event<FileDeleteEvent>;
    const fs: {
      stat(uri: Uri): Thenable<FileStat>;
    };
  }

  export namespace languages {
    function registerDocumentSymbolProvider(
      selector: DocumentSelector,
      provider: DocumentSymbolProvider,
      metaData?: unknown,
    ): Disposable;
  }

  export namespace commands {
    function registerCommand(
      command: string,
      callback: (...args: unknown[]) => unknown,
    ): Disposable;
  }
}
