/* eslint-disable @typescript-eslint/no-unsafe-return */

export const pad = (number: string | number, length = 2) => `000${number}`.slice(length * -1);
export const int = (bool: boolean) => (bool === true ? 1 : 0);

/* istanbul ignore next */
export function debounce<F extends (...args: any[]) => unknown>(fn: F, wait: number, win: Window) {
  let t: number;
  return function (this: ThisParameterType<F>, ...args: Parameters<F>) {
    win.clearTimeout(t);
    t = win.setTimeout(() => fn.apply(this, args), wait);
  };
}

export const arrayify = <T>(obj: T | T[]): T[] => (Array.isArray(obj) ? obj : [obj]);

export type IncrementEvent = MouseEvent & { delta: number; type: 'increment' };
