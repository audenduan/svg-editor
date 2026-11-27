import { EditorError } from '../errors/EditorError';
import type { Plugin } from '../plugin/PluginContext';
import { dirname, isAbsolute, join, normalize } from './posixPath';

/** 四类扩展的清单名称（与 `PluginContext` 的注册类别同名）。 */
export const CONTRIBUTION_CATEGORIES = ['shapes', 'commands', 'decorators', 'attributes'] as const;

export type ContributionCategory = (typeof CONTRIBUTION_CATEGORIES)[number];

/**
 * 插件在清单里**声明**自己提供哪些扩展。
 *
 * 四类缺省均为空数组。加载器会把它与实际注册的名字集合逐类比较，
 * 不一致即判为 `plugin manifest mismatch`（见 `PluginActivation`）。
 */
export type PluginContributions = {
  readonly [category in ContributionCategory]?: readonly string[];
};

/** 规范化后的清单条目（`enabled` 已补默认值，别名已归一）。 */
export interface PluginDeclaration {
  /** 必填：插件名（插件自身导出的 `name` 必须与之一致）。 */
  readonly name: string;
  /** 必填：模块说明符的**原始字符串**（错误文案按规范回显这一串）。 */
  readonly module: string;
  /** 可选：同一模块内要使用哪个变体（多插件同一文件打包时用）。 */
  readonly variant?: string;
  /** 可选：缺省视为启用；显式 `false` 时整条条目被跳过（不加载、不报错）。 */
  readonly enabled: boolean;
  /** 可选：插件作者自用的配置段，内核原样交给插件的 `activate`。 */
  readonly options?: unknown;
  /** 声明段；缺省表示"四类皆空"。 */
  readonly contributions: PluginContributions;
}

export interface PluginManifest {
  readonly version: 1;
  readonly plugins: readonly PluginDeclaration[];
}

/** 成功加载的候选：模块已取到、默认导出已确认是插件。 */
export interface PluginCandidate {
  readonly declaration: PluginDeclaration;
  readonly plugin: Plugin;
}

/**
 * 加载结果。
 *
 * 按规范要求，加载期的失败**不是异常**：它们汇成 `errors`（输出时加 `error: ` 前缀），
 * 主程序继续用已成功的插件 + 内置能力启动。
 */
export interface ManifestLoadResult {
  readonly candidates: readonly PluginCandidate[];
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/** 加载器到运行时的桥梁：把 `module` 字符串变成模块对象。 */
export interface PluginModuleLoader {
  /** `specifier` 已是绝对路径或包名；找不到模块时必须抛 `PluginModuleNotFoundError`。 */
  loadModule(specifier: string): unknown;
  /** 当前工作目录（仅用于诊断信息）。 */
  workingDirectory(): string;
}

/**
 * "模块找不到"的专用错误：由宿主侧适配器抛出，内核据此输出
 * `plugin not found: <module>`，而非把它混同成"插件激活失败"。
 */
export class PluginModuleNotFoundError extends Error {
  public constructor(public readonly specifier: string) {
    super(`module not found: ${specifier}`);
    this.name = 'PluginModuleNotFoundError';
  }
}

/**
 * 内核的 JSON 配置加载器。
 *
 * 它与方式 A 走**完全相同**的激活路径（`assemble.activatePlugin`），差别只在于
 * "谁来实例化插件"：方式 A 是代码里的 `import`，方式 B 是这里的 `loadModule`。
 *
 * 路径解析规则（写进文档的硬约定）：
 * 1. `./` 或 `../` 开头 → 相对**配置文件所在目录**解析；
 * 2. 绝对路径 → 原样使用；
 * 3. 其余写法 → 当作**包名**交给运行环境的模块解析（本仓库因此可以用
 *    `./dist/plugins/…` 这类指向编译产物的相对路径，无需任何名称映射表）。
 */
export class PluginManifestLoader {
  public constructor(private readonly moduleLoader: PluginModuleLoader) {}

  /**
   * 解析 + 逐条加载。
   *
   * 单条的失败只进 `errors`，不影响后续条目；只有"整份配置读不成"才抛
   * `invalid plugin config`（由调用方决定是否继续启动）。
   */
  public load(source: string, manifestPath: string): ManifestLoadResult {
    const manifest = this.parse(source, manifestPath);
    const baseDir = dirname(manifestPath);
    const candidates: PluginCandidate[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const declaration of manifest.plugins) {
      if (!declaration.enabled) {
        warnings.push(`plugin ${declaration.name} disabled by config`);
        continue;
      }
      const loaded = this.loadOne(declaration, baseDir);
      if (typeof loaded === 'string') {
        errors.push(loaded);
      } else {
        candidates.push(loaded);
      }
    }
    return { candidates, errors, warnings };
  }

  /**
   * `module` → 交给 `loadModule` 的说明符。
   * `./`/`../` 相对配置文件所在目录；绝对路径原样；其余当作包名。
   */
  public resolveModule(module: string, manifestDir: string): string {
    if (module.startsWith('./') || module.startsWith('../') || module.startsWith('.\\') || module.startsWith('..\\')) {
      return normalize(join(manifestDir, module));
    }
    if (isAbsolute(module)) {
      return normalize(module);
    }
    return module;
  }

  /** 单条加载；成功返回候选，失败返回规范规定的 `error:` 文案（不含前缀）。 */
  private loadOne(declaration: PluginDeclaration, baseDir: string): PluginCandidate | string {
    const specifier = this.resolveModule(declaration.module, baseDir);
    let module: unknown;
    try {
      module = this.moduleLoader.loadModule(specifier);
    } catch (error) {
      if (error instanceof PluginModuleNotFoundError) {
        return `plugin not found: ${declaration.module}`;
      }
      // 模块存在但求值/依赖失败：属于插件加载失败，不能误报为"找不到模块"。
      return `plugin failed to activate: ${declaration.name} (${reason(error)})`;
    }
    const plugin = this.pickDefaultExport(module, declaration);
    if (typeof plugin === 'string') {
      return plugin;
    }
    return { declaration, plugin };
  }

  /** 默认导出 → 插件；`variant` 存在时优先从 `.variants` 里取。 */
  private pickDefaultExport(module: unknown, declaration: PluginDeclaration): Plugin | string {
    const variants = (module as { variants?: Record<string, unknown> } | null)?.variants;
    let candidate: unknown;
    if (declaration.variant !== undefined) {
      if (variants === undefined || variants === null || !(declaration.variant in variants)) {
        return `plugin not found: ${declaration.module}#${declaration.variant}`;
      }
      candidate = variants[declaration.variant];
    } else {
      const exported = (module as { default?: unknown } | null)?.default;
      if (exported === undefined) {
        return `plugin has no default export: ${declaration.module}`;
      }
      candidate = exported;
    }
    if (!isPlugin(candidate)) {
      return `plugin failed to activate: ${declaration.name} (default export is not a plugin)`;
    }
    if (candidate.name !== declaration.name) {
      return `plugin manifest mismatch: ${declaration.name} (declared: name=${declaration.name}; registered: name=${candidate.name})`;
    }
    return candidate;
  }

  private parse(source: string, manifestPath: string): PluginManifest {
    let raw: unknown;
    try {
      // 去掉 UTF-8 BOM：Windows 编辑器（记事本、PowerShell 重定向）常会写进去，
      // 这不是配置写错了，不应该让用户看到一个莫名其妙的解析错误。
      raw = JSON.parse(stripBom(source));
    } catch {
      throw new EditorError(`invalid plugin config: ${manifestPath}: not valid JSON`);
    }
    try {
      return validateManifest(raw);
    } catch (error) {
      throw new EditorError(`invalid plugin config: ${manifestPath}: ${reason(error)}`);
    }
  }
}

/** 去掉文件开头的 UTF-8 BOM（U+FEFF）。 */
function stripBom(source: string): string {
  return source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 配置结构校验。
 *
 * 规范给出的示例只有 `{ "plugins": [ … ] }`，因此 `version` **可选**；
 * 出现时必须为 `1`。条目接受 `module`（规范键名）与 `entry`（本仓库早期写法）为同义键，
 * 同理 `options` 与 `config`。
 */
export function validateManifest(raw: unknown): PluginManifest {
  const fail = (detail: string): never => {
    throw new EditorError(detail);
  };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail('expected a JSON object');
  }
  const object = raw as Record<string, unknown>;
  if (object.version !== undefined && object.version !== 1) {
    return fail('version must be 1');
  }
  const plugins = object.plugins;
  if (!Array.isArray(plugins)) {
    return fail('plugins must be an array');
  }
  const seen = new Set<string>();
  const declarations: PluginDeclaration[] = [];
  plugins.forEach((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      fail(`plugins[${index}] must be an object`);
    }
    const entry = item as Record<string, unknown>;
    const name = entry.name;
    if (typeof name !== 'string' || name === '') {
      fail(`plugins[${index}].name must be a non-empty string`);
    }
    const module = pickString(entry, 'module', 'entry');
    if (module === null) {
      fail(`plugins[${index}].module must be a non-empty string`);
    }
    if (seen.has(name as string)) {
      fail(`duplicate plugin name: ${name as string}`);
    }
    seen.add(name as string);
    if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') {
      fail(`plugins[${index}].enabled must be a boolean`);
    }
    if (entry.variant !== undefined && typeof entry.variant !== 'string') {
      fail(`plugins[${index}].variant must be a string`);
    }
    declarations.push({
      name: name as string,
      module: module as string,
      ...(entry.variant === undefined ? {} : { variant: entry.variant as string }),
      enabled: entry.enabled !== false,
      ...(pickKey(entry, 'options', 'config') === undefined
        ? {}
        : { options: pickKey(entry, 'options', 'config') }),
      contributions: validateContributions(entry.contributes, index),
    });
  });
  return { version: 1, plugins: declarations };
}

/** 取两个同义键中先出现的那个（未出现返回 `undefined`）。 */
function pickKey(entry: Record<string, unknown>, primary: string, alias: string): unknown {
  return entry[primary] !== undefined ? entry[primary] : entry[alias];
}

/** 取两个同义字符串键；都缺省或类型错误时返回 `null`。 */
function pickString(entry: Record<string, unknown>, primary: string, alias: string): string | null {
  const value = pickKey(entry, primary, alias);
  return typeof value === 'string' && value !== '' ? value : null;
}

/** `contributes` 只允许四个类别，每类必须是非空字符串数组。 */
function validateContributions(raw: unknown, index: number): PluginContributions {
  if (raw === undefined) {
    return {};
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new EditorError(`plugins[${index}].contributes must be an object`);
  }
  const object = raw as Record<string, unknown>;
  const contributions: Record<string, readonly string[]> = {};
  for (const [key, value] of Object.entries(object)) {
    if (!(CONTRIBUTION_CATEGORIES as readonly string[]).includes(key)) {
      throw new EditorError(`plugins[${index}].contributes.${key} is not a known category`);
    }
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item === '')) {
      throw new EditorError(`plugins[${index}].contributes.${key} must be a string array`);
    }
    contributions[key] = [...(value as string[])];
  }
  return contributions as PluginContributions;
}

function isPlugin(value: unknown): value is Plugin {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { name?: unknown }).name === 'string' &&
    typeof (value as { activate?: unknown }).activate === 'function'
  );
}