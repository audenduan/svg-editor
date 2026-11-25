import { createRequire } from 'node:module';
import path from 'node:path';
import type { PluginModuleLoader } from '../core/config/PluginManifestLoader';

/**
 * 内建模块名 → 编译产物路径（相对仓库根目录）。
 *
 * 说明：`node:require` 只能加载 JavaScript，源码是 TypeScript，所以内建的三个插件
 * 统一用**先编译再加载**的路径；外部插件同样可以指向自己的 `dist/…/index.js`。
 * 这就是文档里写明的 `entry` 解析规则第 5 条：相对/绝对路径一律按"可被 require 的
 * 文件"解析，`.ts` 源码会在装配时给出 `cannot load plugin` 错误。
 */
const BUILTIN_MODULES: Record<string, string> = {
  'builtin:shape-box': 'plugins/shape-box/src/index.js',
  'builtin:command-stats': 'plugins/command-stats/src/index.js',
  'builtin:command-dir': 'plugins/command-dir/src/index.js',
};

/**
 * 方式 B 的 Node 适配器：把 `PluginManifestLoader` 要求的两件事
 * （"按说明符取模块"与"给出工作目录"）接到 Node 的模块系统上。
 *
 * 内核不认识 `createRequire`，因此"配置文件能不能加载插件"这件事
 * 完全停在宿主层，与方式 A 的可执行文件共用同一份内核。
 */
export class NodePluginModuleLoader implements PluginModuleLoader {
  private readonly requireFromCli: NodeJS.Require;
  private readonly projectRoot: string;

  public constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.requireFromCli = createRequire(path.join(projectRoot, 'package.json'));
  }

  public loadModule(specifier: string): unknown {
    const builtin = BUILTIN_MODULES[specifier];
    if (builtin !== undefined) {
      return this.requireFromCli(path.join(this.projectRoot, 'dist', builtin));
    }
    // 绝对路径或相对路径（相对工作目录，由内核加载器已经归一）
    return this.requireFromCli(path.resolve(specifier));
  }

  public workingDirectory(): string {
    return process.cwd();
  }
}