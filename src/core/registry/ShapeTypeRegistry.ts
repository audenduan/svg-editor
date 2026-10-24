import { EditorError } from '../errors/EditorError';
import type { Shape } from '../model/Shape';
import { tryParseNumeric } from '../model/numbers';
import type { ParameterValues, ShapeParameterSpec, ShapeProvider } from './ShapeProvider';

/**
 * 图形类型注册表：`create` 的**按名分派点**（架构方案里标注的两处之一）。
 *
 * 它同时维护"类型名 → Provider"与"SVG 标签名 → Provider"两张表：
 * 命令行走类型名，`read` 走标签名，二者指向同一个 Provider，避免两套构造逻辑。
 */
export class ShapeTypeRegistry {
  private readonly providersByType = new Map<string, ShapeProvider>();
  private readonly providersByTag = new Map<string, ShapeProvider>();

  public register(provider: ShapeProvider): void {
    if (this.providersByType.has(provider.typeName)) {
      throw new Error(`duplicate shape provider: ${provider.typeName}`);
    }
    if (this.providersByTag.has(provider.elementTag)) {
      throw new Error(`duplicate element tag: ${provider.elementTag}`);
    }
    this.providersByType.set(provider.typeName, provider);
    this.providersByTag.set(provider.elementTag, provider);
  }

  public findProvider(typeName: string): ShapeProvider | null {
    return this.providersByType.get(typeName) ?? null;
  }

  public findByTag(elementTag: string): ShapeProvider | null {
    return this.providersByTag.get(elementTag) ?? null;
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
