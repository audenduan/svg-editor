import { EditorError } from '../errors/EditorError';
import type { Shape } from '../model/Shape';
import { tryParseNumeric } from '../model/numbers';
import type { ParameterValues, ShapeParameterSpec, ShapeProvider } from './ShapeProvider';

/**
 * 图形类型注册表：`create` 的**按名分派点**（架构方案里标注的两处之一）。
 *
 * 它同时维护"类型名 → Provider"与"SVG 标签名 → Provider 列表"两张表：
 * 命令行走类型名，`read` 走标签名。同一个标签可以被多个 Provider 共享，
 * 前提是除一个"默认 Provider"外，其余都声明 `matchesElement` 作为**标签变体**
 * （例如 `box` 与普通 `<g>` 共用 `g`，靠 `data-kind="box"` 区分）。
 */
export class ShapeTypeRegistry {
  private readonly providersByType = new Map<string, ShapeProvider>();
  private readonly providersByTag = new Map<string, ShapeProvider[]>();

  public register(provider: ShapeProvider): void {
    if (this.providersByType.has(provider.typeName)) {
      throw new Error(`duplicate shape provider: ${provider.typeName}`);
    }
    const sameTag = this.providersByTag.get(provider.elementTag) ?? [];
    if (provider.matchesElement === undefined && sameTag.length > 0) {
      throw new Error(`duplicate element tag: ${provider.elementTag}`);
    }
    this.providersByType.set(provider.typeName, provider);
    this.providersByTag.set(provider.elementTag, [...sameTag, provider]);
  }

  public findProvider(typeName: string): ShapeProvider | null {
    return this.providersByType.get(typeName) ?? null;
  }

  /** 该标签的**默认** Provider（不声明 `matchesElement` 的那个）。 */
  public findByTag(elementTag: string): ShapeProvider | null {
    return this.listByTag(elementTag).find((provider) => provider.matchesElement === undefined) ?? null;
  }

  /**
   * 读回时按标签 + 属性解析 Provider：先按注册顺序试所有**变体**，
   * 都不匹配才回落到默认 Provider；没有可用的返回 `null`。
   */
  public resolveProvider(
    elementTag: string,
    attributes: ReadonlyMap<string, string>,
  ): ShapeProvider | null {
    const providers = this.listByTag(elementTag);
    for (const provider of providers) {
      if (provider.matchesElement !== undefined && provider.matchesElement(attributes)) {
        return provider;
      }
    }
    return providers.find((provider) => provider.matchesElement === undefined) ?? null;
  }

  public listProviders(): readonly ShapeProvider[] {
    return [...this.providersByType.values()];
  }

  public createShape(typeName: string, id: string, tokens: readonly string[]): Shape {
    const provider = this.providersByType.get(typeName);
    if (provider === undefined) {
      // 需求 4.2 规定的原文错误信息
      throw new EditorError(`unknown shape type: ${typeName} (is the plugin loaded?)`);
    }
    return provider.create(id, bindParameters(provider, tokens));
  }

  private listByTag(elementTag: string): readonly ShapeProvider[] {
    return this.providersByTag.get(elementTag) ?? [];
  }
}

/** 按 schema 绑定位置参数：数量范围 + 数值解析，失败信息带参数名。 */
function bindParameters(provider: ShapeProvider, tokens: readonly string[]): ParameterValues {
  const specs = provider.parameters;
  const requiredCount = specs.filter((spec) => spec.optional !== true).length;
  if (tokens.length < requiredCount || tokens.length > specs.length) {
    const expected = requiredCount === specs.length ? `${specs.length}` : `${requiredCount} to ${specs.length}`;
    throw new EditorError(
      `wrong number of arguments for ${provider.typeName}: expected ${expected}, got ${tokens.length}`,
    );
  }
  const values = new Map<string, number | string>();
  specs.forEach((spec, index) => {
    const token = tokens[index];
    if (token === undefined) {
      return;
    }
    values.set(spec.name, convertValue(spec, token));
  });
  return values;
}

function convertValue(spec: ShapeParameterSpec, token: string): number | string {
  if (spec.kind !== 'number') {
    if (token === '') {
      throw new EditorError(`empty value for ${spec.name}`);
    }
    return token;
  }
  const value = tryParseNumeric(token);
  if (value === null) {
    throw new EditorError(`invalid number for ${spec.name}: ${token}`);
  }
  return value;
}