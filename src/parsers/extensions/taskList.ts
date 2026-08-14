import { factorySpace } from 'micromark-factory-space';
import { markdownLineEndingOrSpace, markdownSpace } from 'micromark-util-character';
import { codes } from 'micromark-util-symbol/codes.js';
import { types } from 'micromark-util-symbol/types.js';
import { Effects, Extension, State, Token, TokenizeContext, Tokenizer } from 'micromark-util-types';
import type { CompileContext, ListItem, Paragraph, Parent, Content, Text } from 'mdast-util-from-markdown';

const taskListCheckType = 'taskListCheck';
const taskListCheckMarkerType = 'taskListCheckMarker';
const taskListCheckValueUncheckedType = 'taskListCheckValueUnchecked';
const taskListCheckValueCheckedType = 'taskListCheckValueChecked';

interface TaskListTokenizeContext extends TokenizeContext {
  _gfmTasklistFirstContentOfListItem?: boolean;
}

interface CheckedListItem extends ListItem {
  checked?: boolean;
  checkChar?: string;
}

const tasklistCheck = { tokenize: tokenizeTasklistCheck };

export const gfmTaskListItem: Extension = {
  text: { [codes.leftSquareBracket]: tasklistCheck },
};

function tokenizeTasklistCheck(this: TaskListTokenizeContext, effects: Effects, ok: State, nok: State) {
  const self = this;

  return open;

  function open(code: number) {
    if (
      // Exit if there’s stuff before.
      self.previous !== codes.eof ||
      // Exit if not in the first content that is the first child of a list
      // item.
      !self._gfmTasklistFirstContentOfListItem
    ) {
      return nok(code);
    }

    effects.enter(taskListCheckType);
    effects.enter(taskListCheckMarkerType);
    effects.consume(code);
    effects.exit(taskListCheckMarkerType);
    return inside;
  }

  /** @type {State} */
  function inside(code: number) {
    if (markdownSpace(code)) {
      effects.enter(taskListCheckValueUncheckedType);
      effects.consume(code);
      effects.exit(taskListCheckValueUncheckedType);
      return close;
    }

    if (code !== codes.rightSquareBracket) {
      effects.enter(taskListCheckValueCheckedType);
      effects.consume(code);
      effects.exit(taskListCheckValueCheckedType);
      return close;
    }

    return nok(code);
  }

  /** @type {State} */
  function close(code: number) {
    if (code === codes.rightSquareBracket) {
      effects.enter(taskListCheckMarkerType);
      effects.consume(code);
      effects.exit(taskListCheckMarkerType);
      effects.exit(taskListCheckType);
      return effects.check({ tokenize: spaceThenNonSpace }, ok, nok);
    }

    return nok(code);
  }
}

/** @type {Tokenizer} */
function spaceThenNonSpace(this: TaskListTokenizeContext, effects: Effects, ok: State, nok: State) {
  const self = this;

  return factorySpace(effects, after, types.whitespace);

  /** @type {State} */
  function after(code: number) {
    const tail = self.events[self.events.length - 1];

    return tail &&
      tail[1].type === types.whitespace &&
      code !== codes.eof &&
      !markdownLineEndingOrSpace(code)
      ? ok(code)
      : nok(code);
  }
}

/** @type {FromMarkdownExtension} */
export const gfmTaskListItemFromMarkdown = {
  exit: {
    taskListCheckValueChecked: exitCheck,
    taskListCheckValueUnchecked: exitCheck,
    paragraph: exitParagraphWithTaskListItem,
  },
};

/** @type {FromMarkdownHandle} */
function exitCheck(this: CompileContext, token: Token) {
  const node = this.stack[this.stack.length - 2] as CheckedListItem;
  // We’re always in a paragraph, in a list item.
  node.checked = token.type === taskListCheckValueCheckedType;
  node.checkChar = this.sliceSerialize(token);
}

/** @type {FromMarkdownHandle} */
function exitParagraphWithTaskListItem(this: CompileContext, token: Token) {
  const parent = this.stack[this.stack.length - 2] as Parent;
  const node = this.stack[this.stack.length - 1] as Paragraph;
  const siblings = parent.children as Content[];
  const head = node.children[0] as Text | undefined;
  let index = -1;
  let firstParaghraph: Paragraph | undefined;

  if (
    parent &&
    parent.type === 'listItem' &&
    typeof parent.checked === 'boolean' &&
    head &&
    head.type === 'text'
  ) {
    while (++index < siblings.length) {
      const sibling = siblings[index];
      if (sibling.type === 'paragraph') {
        firstParaghraph = sibling as Paragraph;
        break;
      }
    }

    if (firstParaghraph === node) {
      // Must start with a space or a tab.
      head.value = head.value.slice(1);

      if (head.value.length === 0) {
        node.children.shift();
      } else if (node.position && head.position && typeof head.position.start.offset === 'number') {
        head.position.start.column++;
        head.position.start.offset++;
        node.position.start = Object.assign({}, head.position.start);
      }
    }
  }

  this.exit(token);
}
