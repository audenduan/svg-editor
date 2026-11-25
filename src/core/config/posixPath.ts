/**
 * 极简路径工具：内核不 import `node:path`，保证 `src/core` 与运行时无关
 * （浏览器、测试沙箱、未来其他宿主都能直接复用）。
 *
 * 兼容 Windows 与 POSIX 分隔符：输入里的 `\` 一律视为分隔符，
 * 输出沿用**输入的主要分隔符**，不会把 Windows 路径改成 POSIX 风格。
 */
const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;

export function isAbsolute(path: string): boolean {
  return WINDOWS_ABSOLUTE.test(path) || path.startsWith('/') || path.startsWith('\\\\');
}

/** 输入里含有反斜杠且不含正斜杠时，按 Windows 风格输出。 */
export function separatorOf(path: string): string {
  return path.includes('\\') && !path.includes('/') ? '\\' : '/';
}

export function dirname(path: string): string {
  const sep = separatorOf(path);
  const unified = toUnified(path);
  // 盘符根（`C:\`）与 POSIX 根（`/`）的目录名都是自身
  if (WINDOWS_ABSOLUTE.test(unified)) {
    const tail = unified.slice(3);
    if (tail === '') {
      return toOriginal(unified, sep);
    }
    const last = tail.lastIndexOf('/');
    return toOriginal(last < 0 ? unified.slice(0, 2) : unified.slice(0, 3 + last), sep);
  }
  const last = unified.lastIndexOf('/');
  if (last < 0) {
    return '.';
  }
  if (last === 0) {
    return '/';
  }
  return toOriginal(unified.slice(0, last), sep);
}

export function join(base: string, child: string): string {
  const sep = separatorOf(base);
  const unifiedBase = toUnified(base).replace(/\/+$/, '');
  return toOriginal(`${unifiedBase}/${toUnified(child)}`, sep);
}

/** 折叠 `.`、`..` 与重复分隔符（不触碰文件系统）。 */
export function normalize(path: string): string {
  const sep = separatorOf(path);
  const unified = toUnified(path);
  const drive = WINDOWS_ABSOLUTE.exec(unified)?.[0] ?? '';
  const absolute = drive !== '' || unified.startsWith('/');
  const parts: string[] = [];
  for (const part of unified.slice(drive.length).split('/')) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') {
        parts.pop();
      } else if (!absolute) {
        parts.push('..');
      }
      continue;
    }
    parts.push(part);
  }
  const tail = parts.join('/');
  if (drive !== '') {
    return toOriginal(tail === '' ? drive : `${drive}${tail}`, sep);
  }
  return toOriginal(absolute ? `/${tail}` : tail, sep);
}

/** 统一成 `/` 分隔，便于内部计算（不改变盘符）。 */
function toUnified(path: string): string {
  return path.replace(/\\/g, '/');
}

function toOriginal(unified: string, sep: string): string {
  return sep === '\\' ? unified.replace(/\//g, '\\') : unified;
}