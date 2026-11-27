import { createRequire } from 'node:module';
import path from 'node:path';
import { PluginModuleNotFoundError } from '../core/config/PluginManifestLoader';
import type { PluginModuleLoader } from '../core/config/PluginManifestLoader';

/** Node 的"找不到模块"错误码。 */
const MODULE_NOT_FOUND = 'MODULE_NOT_FOUND';

/**
 * 方式 B 的 Node 适配器：把 `PluginManifestLoader` 要求的两件事
 * （"按说明符取模块"与"给出工作目录"）接到 Node 的模块系统上。
 *
 * 这里**没有任何插件名到路径的映射表**——内核加载器把 `module` 归一成
 * "绝对路径"或"包名"，本类只负责调用 `require`，因此接入新插件不需要改这里，
 * 也不存在按名字分支的可能。
 */
export class NodePluginModuleLoader implements PluginModuleLoader {
  private readonly requireFromCli: NodeJS.Require;

  public constructor(projectRoot: string) {
    this.requireFromCli = createRequire(path.join(projectRoot, 'package.json'));
  }

  public loadModule(specifier: string): unknown {
    try {
      return this.requireFromCli(specifier);
    } catch (error) {
      throw classify(error, specifier);
    }
  }

  public workingDirectory(): string {
    return process.cwd();
  }
}

/**
 * 区分两类失败（规范要求"模块存在但求值或依赖失败"不得误报为"找不到模块"）：
 *
 * - 报错信息点名**本次请求的说明符** → 模块本身找不到；
 * - 点名的是别的模块（该插件自己 require 的依赖缺失）→ 求值失败，按激活失败上报。
 */
export function classify(error: unknown, specifier: string): Error {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === MODULE_NOT_FOUND) {
    const message = error instanceof Error ? error.message : '';
    const named = /Cannot find module '([^']+)'/.exec(message)?.[1];
    if (named === undefined || sameSpecifier(named, specifier)) {
      return new PluginModuleNotFoundError(specifier);
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** Windows 上 Node 会把说明符换成反斜杠形式，比较时统一斜杠并忽略大小写。 */
function sameSpecifier(named: string, specifier: string): boolean {
  const normalize = (value: string): string => value.replace(/\\/g, '/').toLowerCase();
  return normalize(named) === normalize(specifier) || normalize(specifier).endsWith(normalize(named));
}