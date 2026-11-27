import type { PluginContributions, ContributionCategory } from '../config/PluginManifestLoader';
import { CONTRIBUTION_CATEGORIES } from '../config/PluginManifestLoader';
import type { ExtensionRegistry } from './ExtensionRegistry';
import type { Plugin } from './PluginContext';

/** 交给激活流程的一条插件：实例 + 可选声明段 + 可选配置段。 */
export interface ActivatablePlugin {
  readonly plugin: Plugin;
  /** 缺省时不校验清单（方式 A 的自由度；声明了就按四类名称比对）。 */
  readonly contributions?: PluginContributions;
  /** 原样透传给 `plugin.activate` 的第二个参数。 */
  readonly options?: unknown;
}

/** 把异常变成一句话（错误文案的统一口径）。 */
function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 插件激活的**唯一路径**（方式 A 与方式 B 共用）。
 *
 * 顺序：`beginRegistration` → `activate` → 清单校验 → `commitRegistration`。
 * 任一步失败都 `discardRegistration` 撤销该插件的全部暂存注册，并返回一行
 * 规范格式的错误文案（**不含** `error: ` 前缀，由输出层加）。
 *
 * 失败返回而不是抛出：规范要求加载期失败后"继续启动，主程序不得退出"。
 */
export function activateChecked(extensions: ExtensionRegistry, entry: ActivatablePlugin): string | null {
  const { plugin, contributions, options } = entry;
  extensions.beginRegistration();
  try {
    plugin.activate(extensions, options);
  } catch (error) {
    extensions.discardRegistration();
    return `plugin failed to activate: ${plugin.name} (${reason(error)})`;
  }
  if (contributions !== undefined) {
    const mismatch = compareContributions(plugin.name, contributions, extensions.stagedNames());
    if (mismatch !== null) {
      extensions.discardRegistration();
      return mismatch;
    }
  }
  try {
    extensions.commitRegistration();
  } catch (error) {
    extensions.discardRegistration();
    return reason(error);
  }
  return null;
}

/**
 * 声明与实际注册逐类比较（规范要求的四类名称集合比对）。
 *
 * 声明缺省的类别视为空集合，因此"声明了什么都不注册"和"注册了却没声明"
 * 都会被判为不一致，而不是被静默放过。
 */
export function compareContributions(
  name: string,
  declared: PluginContributions,
  registered: Readonly<Record<ContributionCategory, readonly string[]>>,
): string | null {
  let mismatch = false;
  const sides = CONTRIBUTION_CATEGORIES.map((category) => {
    const want = [...(declared[category] ?? [])].sort();
    const got = [...registered[category]].sort();
    if (want.length !== got.length || want.some((item, index) => item !== got[index])) {
      mismatch = true;
    }
    return { category, want, got };
  });
  if (!mismatch) {
    return null;
  }
  const render = (pick: (side: (typeof sides)[number]) => readonly string[]): string =>
    sides.map((side) => `${side.category}=[${pick(side).join(', ')}]`).join(' ');
  return (
    `plugin manifest mismatch: ${name}` +
    ` (declared: ${render((side) => side.want)}; registered: ${render((side) => side.got)})`
  );
}