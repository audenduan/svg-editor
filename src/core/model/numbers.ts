import { EditorError } from '../errors/EditorError';

/**
 * 数值的文本表示：整数不带小数点，小数最多保留 6 位。
 *
 * 所有面向用户的输出（回显摘要、tree/show、SVG 序列化）都走这一处，
 * 保证 `save` 的结果再次 `read` 之后数字文本不会漂移。
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded === 0 ? 0 : rounded);
}

/** 解析必填数值；失败时抛出带属性名的 `EditorError`（命令失败不改变状态）。 */
export function parseNumeric(text: string, name: string): number {
  const value = tryParseNumeric(text);
  if (value === null) {
    throw new EditorError(`invalid number for ${name}: ${text}`);
  }
  return value;
}

/**
 * 宽松解析（供 `read` 使用）：非法数值不抛错，交给调用方决定是否警告。
 * 读入外部 SVG 时，"尽量把能读懂的部分读进来" 比 "整份文件失败" 更有用。
 */
export function tryParseNumeric(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}
