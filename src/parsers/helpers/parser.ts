import { App, Stat } from 'obsidian';
import { Item } from 'src/components/types';

export interface FileAccessor {
  isEmbed: boolean;
  target: string;
  stats?: Stat;
}

export function markRangeForDeletion(str: string, range: { start: number; end: number }): string {
  const len = str.length;

  let start = range.start;
  while (start > 0 && str[start - 1] === ' ') start--;

  let end = range.end;
  while (end < len - 1 && str[end + 1] === ' ') end++;

  return str.slice(0, start) + '\u0000'.repeat(end - start) + str.slice(end);
}

export function executeDeletion(str: string) {
  return str.replace(/ *\0+ */g, ' ').trim();
}

export function replaceNewLines(str: string) {
  return str.trim().replace(/(?:\r\n|\n)/g, '<br>');
}

export function replaceBrs(str: string) {
  return str.replace(/<br>/g, '\n').trim();
}

type VaultWithConfig = App['vault'] & {
  getConfig: (key: string) => unknown;
};

export function indentNewLines(str: string, app?: App) {
  const useTab = app ? !!(app.vault as VaultWithConfig).getConfig('useTab') : false;
  return str.trim().replace(/(?:\r\n|\n)/g, useTab ? '\n\t' : '\n    ');
}

export function addBlockId(str: string, item: Item) {
  if (!item.data.blockId) return str;

  const lines = str.split(/(?:\r\n|\n)/g);
  const lastLine = lines[lines.length - 1] ?? '';

  // 块 ID 应附在块的最后一行(Obsidian 惯例);已存在时不再追加,避免 ID 重复
  if (lastLine.endsWith('^' + item.data.blockId)) return str;

  lines[lines.length - 1] = `${lastLine} ^${item.data.blockId}`;

  return lines.join('\n');
}

export function removeBlockId(str: string) {
  // 与解析端一致:任意行行尾的块 ID 都属于该卡片,全部移除,防止 ID 在行间残留/重复
  return str.replace(/ +\^[a-zA-Z0-9-]+$/gm, '');
}

export function dedentNewLines(str: string) {
  return str.trim().replace(/(?:\r\n|\n)(?: {4}|\t)/g, '\n');
}

export function parseLaneTitle(str: string) {
  str = replaceBrs(str);

  const match = str.match(/^(.*?)\s*\((\d+)\)$/);
  if (match == null) return { title: str, maxItems: 0 };

  return { title: match[1], maxItems: Number(match[2]) };
}
