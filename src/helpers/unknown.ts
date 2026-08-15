export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export function getRecordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

export function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function asError(error: unknown): Error {
  if (error instanceof Error) return error;

  if (typeof error === 'object') {
    const jsonValue = JSON.stringify(error);
    return new Error(typeof jsonValue === 'string' ? jsonValue : '[object]');
  }

  if (typeof error === 'string') return new Error(error);
  if (typeof error === 'number') return new Error(error.toString());
  if (typeof error === 'boolean') return new Error(error ? 'true' : 'false');
  if (typeof error === 'bigint') return new Error(error.toString(10));
  if (error === undefined) return new Error('undefined');
  if (typeof error === 'symbol') return new Error('[symbol]');
  if (typeof error === 'function') return new Error('[function]');

  return new Error('[unknown]');
}