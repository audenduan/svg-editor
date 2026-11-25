import { EditorError } from '../errors/EditorError';
import type { Plugin } from '../plugin/PluginContext';
import { dirname, isAbsolute, join, normalize } from './posixPath';

/**
 * 插件清单（方式 B：改配置，不改代码）在 JSON 里的**唯一**形状。
 *
 * 声明式部分（`name` / `entry` / `enabled` / `config`）由内核的加载器解析；
 * 每个插件自己的 `contributes` 段落属于插件作者，内核不解释其字段含义。
 */
export interface PluginManifest {
  readonly version: 1;
  readonly plugins: readonly PluginManifestEntry[];
}

export interface PluginManifestEntry {
  /** 必填：插件名（与插件导出的 `name` 一致，便于日志与排错）。 */
  readonly name: string;
  /** 必填（除内建模块名）：模块的加载路径或内建模块名，见 `resolveEntry`。 */
  readonly entry: string;
  /**
   * 可选：同一模块内要使用哪个变体（多插件同一文件打包时用），
   * 对应源码里的 `.variants[name]`；缺省时依次回落到 `.default`、模块本身。
   */
  readonly variant?: string;
  /** 可选：缺省视为启用；显式 `false` 时整条条目被跳过（不加载、不报错）。 */
  readonly enabled?: boolean;
  /** 可选：插件作者自用的配置段，内核原样传给插件。 */
  readonly config?: unknown;
}

/** 加载器到运行时的桥梁：把 `entry` 字符串变成模块对象。 */
export interface PluginModuleLoader {
  /** `specifier` 已经是解析后的绝对路径或内建模块名。 */
  loadModule(specifier: string): unknown;
  /** 当前工作目录（相对 `entry` 以此为基准解析）。 */
  workingDirectory(): string;
}

export interface ManifestLoadResult {
  readonly plugins: readonly Plugin[];
  /** 被跳过条目的说明（CLI 渲染成 `warning: ` 行）。 */
  readonly warnings: readonly string[];
}

/**
 * 内核的 JSON 配置加载器。
 *
 * 它与方式 A 走**完全相同**的激活路径（`assemble.activatePlugin`），差别只在于
 * "谁来实例化插件"：方式 A 是代码里的 `import`，方式 B 是这里的 `loadModule`。
 *
 * 路径解析规则（写进文档的硬约定）：
 * 1. `entry` 以 `./` 或 `../` 开头 → 相对**配置文件所在目录**解析；
 * 2. 其余相对写法（`plugins/x/src/index.ts`）→ 相对**当前工作目录**解析；
 * 3. 绝对路径 → 原样使用；
 * 4. 形如 `builtin:<name>` → 内建模块名，不落到文件系统。
 */
export class PluginManifestLoader {
  public constructor(private readonly moduleLoader: PluginModuleLoader) {}

  public load(source: string, manifestPath: string): ManifestLoadResult {
    const manifest = this.parse(source, manifestPath);
    const baseDir = dirname(manifestPath);
    const plugins: Plugin[] = [];
    const warnings: string[] = [];
    for (const entry of manifest.plugins) {
      if (entry.enabled === false) {
        warnings.push(`plugin ${entry.name} disabled by config`);
        continue;
      }
      const specifier = this.resolveEntry(entry.entry, baseDir);
      const module = this.requireModule(specifier, entry.name);
      plugins.push(this.pickPlugin(module, entry));
    }
    return { plugins, warnings };
  }

  /**
   * `entry` → 交给 `loadModule` 的说明符。
   * 相对路径的分辨规则与文档一致：`./`/`../` 相对配置文件，其余相对工作目录。
   */
  public resolveEntry(entry: string, manifestDir: string): string {
    if (entry.startsWith('builtin:')) {
      return entry;
    }
    if (entry.startsWith('./') || entry.startsWith('../') || entry.startsWith('.\\') || entry.startsWith('..\\')) {
      return normalize(join(manifestDir, entry));
    }
    if (isAbsolute(entry)) {
      return normalize(entry);
    }
    return normalize(join(this.moduleLoader.workingDirectory(), entry));
  }

  private requireModule(specifier: string, pluginName: string): unknown {
    try {
      return this.moduleLoader.loadModule(specifier);
    } catch {
      throw new EditorError(`cannot load plugin ${pluginName}: ${specifier}`);
    }
  }

  /** 变体 → `.default` → 模块本身，逐级回落；任何一步不是合法插件都报错。 */
  private pickPlugin(module: unknown, entry: PluginManifestEntry): Plugin {
    const label = `plugin ${entry.name}`;
    const variants = (module as { variants?: Record<string, unknown> } | null)?.variants;
    let candidate: unknown;
    if (entry.variant !== undefined) {
      if (variants === undefined || variants === null || !(entry.variant in variants)) {
        throw new EditorError(`${label}: unknown variant: ${entry.variant}`);
      }
      candidate = variants[entry.variant];
    } else {
      candidate =
        (module as { default?: unknown } | null)?.default !== undefined
          ? (module as { default?: unknown }).default
          : module;
    }
    if (!isPlugin(candidate)) {
      throw new EditorError(`${label}: not a plugin (missing activate)`);
    }
    if (candidate.name !== entry.name) {
      throw new EditorError(`${label}: name mismatch (module exports ${candidate.name})`);
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
      throw new EditorError(`cannot parse plugin config: ${manifestPath}`);
    }
    return validateManifest(raw, manifestPath);
  }
}

/** 去掉文件开头的 UTF-8 BOM（U+FEFF）。 */
function stripBom(source: string): string {
  return source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
}

/** 配置结构校验：错误信息一律带配置路径，方便定位。 */
export function validateManifest(raw: unknown, manifestPath: string): PluginManifest {
  const fail = (detail: string): never => {
    throw new EditorError(`invalid plugin config: ${manifestPath}: ${detail}`);
  };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail('expected a JSON object');
  }
  const object = raw as Record<string, unknown>;
  if (object.version !== 1) {
    return fail('version must be 1');
  }
  const plugins = object.plugins;
  if (!Array.isArray(plugins)) {
    return fail('plugins must be an array');
  }
  const seen = new Set<string>();
  const entries: PluginManifestEntry[] = [];
  plugins.forEach((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      fail(`plugins[${index}] must be an object`);
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.name !== 'string' || entry.name === '') {
      fail(`plugins[${index}].name must be a non-empty string`);
    }
    if (typeof entry.entry !== 'string' || entry.entry === '') {
      fail(`plugins[${index}].entry must be a non-empty string`);
    }
    const name = entry.name as string;
    if (seen.has(name)) {
      fail(`duplicate plugin name: ${name}`);
    }
    seen.add(name);
    if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') {
      fail(`plugins[${index}].enabled must be a boolean`);
    }
    if (entry.variant !== undefined && typeof entry.variant !== 'string') {
      fail(`plugins[${index}].variant must be a string`);
    }
    entries.push({
      name,
      entry: entry.entry as string,
      ...(entry.variant === undefined ? {} : { variant: entry.variant as string }),
      ...(entry.enabled === undefined ? {} : { enabled: entry.enabled as boolean }),
      ...(entry.config === undefined ? {} : { config: entry.config }),
    });
  });
  return { version: 1, plugins: entries };
}

function isPlugin(value: unknown): value is Plugin {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { name?: unknown }).name === 'string' &&
    typeof (value as { activate?: unknown }).activate === 'function'
  );
}