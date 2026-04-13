import { FormulaEvalError } from './types.js';

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') {
    if (value.trim() === '') return 0;
    const n = Number(value);
    if (Number.isNaN(n)) {
      throw new FormulaEvalError('TYPE_ERROR', `Cannot convert "${value}" to number`);
    }
    return n;
  }
  throw new FormulaEvalError('TYPE_ERROR', `Cannot convert ${typeof value} to number`);
}

export function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const upper = value.toUpperCase();
    if (upper === 'TRUE') return true;
    if (upper === 'FALSE') return false;
    return value.length > 0;
  }
  return Boolean(value);
}

export function toString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}
