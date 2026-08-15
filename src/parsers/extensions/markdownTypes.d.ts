import 'mdast';
import 'micromark-util-types';
import type { Literal } from 'mdast';

interface KanbanTextNode extends Literal {
  value: string | null;
}

declare module 'mdast' {
  interface PhrasingContentMap {
    blockid: KanbanTextNode & { type: 'blockid' };
    date: KanbanTextNode & { type: 'date'; date?: string };
    dateLink: KanbanTextNode & { type: 'dateLink'; date?: string };
    embedLink: KanbanTextNode & { type: 'embedLink' };
    embedWikilink: KanbanTextNode & { type: 'embedWikilink' };
    hashtag: KanbanTextNode & { type: 'hashtag' };
    time: KanbanTextNode & { type: 'time'; time?: string };
    wikilink: KanbanTextNode & { type: 'wikilink' };
  }
}

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    blockid: 'blockid';
    blockidData: 'blockidData';
    blockidMarker: 'blockidMarker';
    blockidTarget: 'blockidTarget';
    date: 'date';
    dateData: 'dateData';
    dateLink: 'dateLink';
    dateLinkData: 'dateLinkData';
    dateLinkMarker: 'dateLinkMarker';
    dateLinkTarget: 'dateLinkTarget';
    dateMarker: 'dateMarker';
    dateTarget: 'dateTarget';
    embedWikilink: 'embedWikilink';
    embedWikilinkData: 'embedWikilinkData';
    embedWikilinkMarker: 'embedWikilinkMarker';
    embedWikilinkTarget: 'embedWikilinkTarget';
    hashtag: 'hashtag';
    hashtagData: 'hashtagData';
    hashtagMarker: 'hashtagMarker';
    hashtagTarget: 'hashtagTarget';
    taskListCheck: 'taskListCheck';
    taskListCheckMarker: 'taskListCheckMarker';
    taskListCheckValueChecked: 'taskListCheckValueChecked';
    taskListCheckValueUnchecked: 'taskListCheckValueUnchecked';
    time: 'time';
    timeData: 'timeData';
    timeMarker: 'timeMarker';
    timeTarget: 'timeTarget';
    wikilink: 'wikilink';
    wikilinkData: 'wikilinkData';
    wikilinkMarker: 'wikilinkMarker';
    wikilinkTarget: 'wikilinkTarget';
  }
}