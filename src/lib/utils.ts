import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * shadcn 标准的 className 合并工具
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** 简单 UUID v4 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 时间戳毫秒 */
export function now(): number {
  return Date.now();
}

/** 用会话首条用户消息前若干字生成标题 */
export function autoTitle(content: string, max = 24): string {
  const firstLine = content.trim().split(/\r?\n/)[0] ?? '';
  const cleaned = firstLine.replace(/^#+\s*/, '').trim();
  if (cleaned.length <= max) return cleaned || '新会话';
  return `${cleaned.slice(0, max)}…`;
}
