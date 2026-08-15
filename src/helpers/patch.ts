import { moment } from 'obsidian';
import { getAPI } from 'obsidian-dataview';

import { isPlainObject } from 'src/helpers/isPlainObject';

type Primitive = string | number | boolean | null | undefined;
type DiffValue = Primitive | Date | moment.Moment | DiffObject | DiffValue[];
interface DiffObject {
  [key: string]: DiffValue;
}
type Key = string | number;
type Diffable = DiffObject | DiffValue[];
type OpPath = Array<Key>;
type DiffRecord = Record<Key, DiffValue>;

const REMOVE = 'remove';
const REPLACE = 'replace';
const ADD = 'add';

export interface Op {
  op: 'remove' | 'replace' | 'add';
  path: OpPath;
  value?: DiffValue;
}

interface Diff {
  remove: Op[];
  replace: Op[];
  add: Op[];
}

type SkipFn = (k: OpPath, val?: DiffValue) => boolean;
type ToStringFn = (val: DiffValue) => string;

function stringifyDiffValue(val: DiffValue): string {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'object') {
    const jsonValue = JSON.stringify(val);
    return typeof jsonValue === 'string' ? jsonValue : '[object]';
  }

  return String(val);
}

interface DataviewApiLike {
  value: {
    isObject(value: unknown): boolean;
  };
}

function isDiffable(obj: unknown): obj is Diffable {
  if (!obj) return false;
  if (isPlainObject(obj) || Array.isArray(obj)) return true;

  const dv = getAPI() as DataviewApiLike | null;
  if (!moment.isMoment(obj) && dv?.value.isObject(obj)) return true;

  return false;
}

export function diff(
  obj1: Diffable,
  obj2: Diffable,
  skip: SkipFn = () => false,
  toString: ToStringFn = stringifyDiffValue
): Op[] {
  if (!isDiffable(obj1) || !isDiffable(obj2)) {
    throw new Error('both arguments must be objects or arrays');
  }

  const diffs: Diff = getDiff(
    obj1,
    obj2,
    [],
    [],
    { remove: [], replace: [], add: [] },
    skip,
    toString
  );

  // reverse removes since we want to maintain indexes
  return diffs.remove.reverse().concat(diffs.replace).concat(diffs.add);
}

function getDiff(
  obj1: Diffable,
  obj2: Diffable,
  basePath: OpPath,
  basePathForRemoves: OpPath,
  diffs: Diff,
  skip: SkipFn,
  toString: ToStringFn
) {
  if (!isDiffable(obj1) || !isDiffable(obj2)) return diffs;

  const obj1Keys = Object.keys(obj1);
  const obj2Keys = Object.keys(obj2);
  const obj2KeysLength = obj2Keys.length;
  const lengthDelta = Array.isArray(obj1) && Array.isArray(obj2) ? obj1.length - obj2.length : 0;

  let path: OpPath;

  if (trimFromRight(obj1, obj2)) {
    for (const k of obj1Keys) {
      const key = Array.isArray(obj1) ? Number(k) : k;
      if (!(key in obj2)) {
        path = basePathForRemoves.concat(key);
        if (skip(path)) continue;
        diffs.remove.push({
          op: REMOVE,
          path,
        });
      }
    }

    for (const k of obj2Keys) {
      const key = Array.isArray(obj2) ? Number(k) : k;
      pushReplaces(
        key,
        obj1,
        obj2,
        basePath.concat(key),
        basePath.concat(key),
        diffs,
        skip,
        toString
      );
    }
  } else {
    // trim from left, objects are both arrays
    for (let i = 0; i < lengthDelta; i++) {
      path = basePathForRemoves.concat(i);
      if (skip(path)) continue;
      diffs.remove.push({
        op: REMOVE,
        path,
      });
    }

    // now make a copy of obj1 with excess elements left trimmed and see if there any replaces
    const obj1Trimmed = Array.isArray(obj1) ? obj1.slice(lengthDelta) : [];
    for (let i = 0; i < obj2KeysLength; i++) {
      pushReplaces(
        i,
        obj1Trimmed,
        obj2,
        basePath.concat(i),
        // since list of removes are reversed before presenting result,
        // we need to ignore existing parent removes when doing nested removes
        basePath.concat(i + lengthDelta),
        diffs,
        skip,
        toString
      );
    }
  }

  return diffs;
}

function pushReplaces(
  key: Key,
  obj1: Diffable,
  obj2: Diffable,
  path: OpPath,
  pathForRemoves: OpPath,
  diffs: Diff,
  skip: SkipFn,
  toString: ToStringFn
) {
  const obj1AtKey = (obj1 as DiffRecord)[key];
  const obj2AtKey = (obj2 as DiffRecord)[key];

  if (skip(path, obj2AtKey)) return;

  if (!(key in obj1) && key in obj2) {
    diffs.add.push({ op: ADD, path, value: obj2AtKey });
  } else if (obj1AtKey !== obj2AtKey) {
    if (
      Object(obj1AtKey) !== obj1AtKey ||
      Object(obj2AtKey) !== obj2AtKey ||
      differentTypes(obj1AtKey, obj2AtKey)
    ) {
      diffs.replace.push({ op: REPLACE, path, value: obj2AtKey });
    } else {
      if (
        !isDiffable(obj1AtKey) &&
        !isDiffable(obj2AtKey) &&
        toString(obj1AtKey) !== toString(obj2AtKey)
      ) {
        diffs.replace.push({ op: REPLACE, path, value: obj2AtKey });
      } else {
        getDiff(
          obj1AtKey as Diffable,
          obj2AtKey as Diffable,
          path,
          pathForRemoves,
          diffs,
          skip,
          toString
        );
      }
    }
  }
}

function differentTypes(a: DiffValue, b: DiffValue) {
  return Object.prototype.toString.call(a) !== Object.prototype.toString.call(b);
}

function trimFromRight(obj1: Diffable, obj2: Diffable) {
  const lengthDelta = Array.isArray(obj1) && Array.isArray(obj2) ? obj1.length - obj2.length : 0;

  if (Array.isArray(obj1) && Array.isArray(obj2) && lengthDelta > 0) {
    let leftMatches = 0;
    let rightMatches = 0;
    for (let i = 0; i < obj2.length; i++) {
      if (stringifyDiffValue(obj1[i]) === stringifyDiffValue(obj2[i])) {
        leftMatches++;
      } else {
        break;
      }
    }

    for (let j = obj2.length; j > 0; j--) {
      if (stringifyDiffValue(obj1[j + lengthDelta]) === stringifyDiffValue(obj2[j])) {
        rightMatches++;
      } else {
        break;
      }
    }

    // bias to trim right becase it requires less index shifting
    return leftMatches >= rightMatches;
  }

  return true;
}

export function diffApply(obj: Diffable, diff: Op[]) {
  if (!isDiffable(obj)) {
    throw new Error('base object must be an object or an array');
  }

  if (!Array.isArray(diff)) {
    throw new Error('diff must be an array');
  }

  if (Array.isArray(obj)) obj = obj.slice();
  else obj = { ...obj };

  type MutableDiffValue = DiffValue | MutableDiffObject | DiffValue[];
  interface MutableDiffObject {
    [key: string]: MutableDiffValue;
    [key: number]: MutableDiffValue;
  }

  for (const thisDiff of diff) {
    const thisOp = thisDiff.op;
    const thisPath = thisDiff.path;
    const pathCopy = thisPath.slice();
    const lastProp = pathCopy.pop();
    let subObject: MutableDiffObject | DiffValue[] = obj;

    prototypeCheck(lastProp);
    if (lastProp == null) return false;

    let thisProp: Key | undefined;
    while ((thisProp = pathCopy.shift()) !== null) {
      if (thisProp === undefined) break;

      prototypeCheck(thisProp);
      if (!(thisProp in subObject)) {
        const nextObject: MutableDiffObject = {};
        subObject[thisProp] = nextObject;
        subObject = nextObject;
      } else if (Array.isArray((subObject as MutableDiffObject)[thisProp])) {
        const currentValue = (subObject as MutableDiffObject)[thisProp] as DiffValue[];
        const nextArray = currentValue.slice();
        subObject[thisProp] = nextArray;
        subObject = nextArray;
      } else if (isPlainObject(subObject[thisProp])) {
        const nextObject = { ...(subObject[thisProp] as MutableDiffObject) };
        subObject[thisProp] = nextObject;
        subObject = nextObject;
      } else {
        subObject = subObject[thisProp] as MutableDiffObject | DiffValue[];
      }
    }

    if (thisOp === REMOVE || thisOp === REPLACE) {
      const path = thisDiff.path;
      if (!Object.prototype.hasOwnProperty.call(subObject, lastProp)) {
        throw new Error(`expected to find property ${String(path)} in object`);
      }
    }

    if (thisOp === REMOVE && typeof lastProp === 'number') {
      Array.isArray(subObject) ? subObject.splice(lastProp, 1) : delete subObject[lastProp];
    }

    if (thisOp === REPLACE || thisOp === ADD) {
      subObject[lastProp] = thisDiff.value;
    }
  }

  return obj;
}

function prototypeCheck(prop?: string | number) {
  // coercion is intentional to catch prop values like `['__proto__']`
  if (prop === '__proto__' || prop === 'constructor' || prop === 'prototype') {
    throw new Error('setting of prototype values not supported');
  }
}
