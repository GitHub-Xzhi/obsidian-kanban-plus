import { CompileContext, Extension as FromMarkdownExtension, Token } from 'mdast-util-from-markdown';
import { markdownLineEndingOrSpace } from 'micromark-util-character';
import { Effects, Extension, State, TokenizeContext } from 'micromark-util-types';

import { getValueNode } from './helpers';

export function tagExtension(): Extension {
  const name = 'hashtag';
  const hashCharCode = '#'.charCodeAt(0);

  function tokenize(this: TokenizeContext, effects: Effects, ok: State, nok: State) {
    let data = false;
    let startMarkerCursor = 0;
    const self = this;

    return start;

    function start(code: number) {
      if (
        code !== hashCharCode ||
        (self.previous !== null && !/\s/.test(String.fromCharCode(self.previous)))
      ) {
        return nok(code);
      }

      effects.enter(name);
      effects.enter('hashtagMarker');

      return consumeStart(code);
    }

    function consumeStart(code: number) {
      if (startMarkerCursor === 1) {
        effects.exit('hashtagMarker');
        return consumeData(code);
      }

      if (code !== hashCharCode) {
        return nok(code);
      }

      effects.consume(code);
      startMarkerCursor++;

      return consumeStart;
    }

    function consumeData(code: number) {
      effects.enter('hashtagData');
      effects.enter('hashtagTarget');
      return consumeTarget(code);
    }

    function consumeTarget(code: number) {
      if (
        code === null ||
        markdownLineEndingOrSpace(code) ||
        /[\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~[\]\\\s\n\r]/.test(
          String.fromCharCode(code)
        )
      ) {
        if (!data) return nok(code);
        effects.exit('hashtagTarget');
        effects.exit('hashtagData');
        effects.exit(name);

        return ok(code);
      }

      data = true;
      effects.consume(code);

      return consumeTarget;
    }
  }

  const call = { tokenize: tokenize };

  return {
    text: { [hashCharCode]: call },
  };
}

export function tagFromMarkdown(): FromMarkdownExtension {
  const name = 'hashtag';

  function enterTag(this: CompileContext, token: Token) {
    this.enter(
      {
        type: name,
        value: null,
      },
      token
    );
  }

  function exitTagTarget(this: CompileContext, token: Token) {
    const target = this.sliceSerialize(token);
    const current = getValueNode(this.stack);

    current.value = target;
  }

  function exitTag(this: CompileContext, token: Token) {
    this.exit(token);
  }

  return {
    enter: {
      [name]: enterTag,
    },
    exit: {
      [`${name}Target`]: exitTagTarget,
      [name]: exitTag,
    },
  };
}
