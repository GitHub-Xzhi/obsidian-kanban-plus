import { CompileContext } from 'mdast-util-from-markdown';

export function getSelf(stack: CompileContext['stack']) {
  return stack[stack.length - 1];
}

export function getValueNode(stack: CompileContext['stack']) {
  return getSelf(stack) as ReturnType<typeof getSelf> & { value: string | null };
}
