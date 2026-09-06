import { KanbanSettings } from 'src/Settings';

export interface PersistedArchivedCard {
  sourceLaneId: string;
  sourceItemIndex: number;
  archivedAt: number;
  archiveDateFormat?: string;
  archiveDateSeparator?: string;
  archiveDateAfterTitle?: boolean;
}

/** 卡片流转记录:从 fromLaneId 流转到 toLaneId 的时刻 */
export interface PersistedFlowRecord {
  fromLaneId?: string;
  toLaneId: string;
  at: number;
  /** 回退动作标记(用于弹窗胶囊标签) */
  back?: boolean;
}

/** 撤销栈中的一步(无时间字段):从 fromLaneId 流转到 toLaneId */
export interface PersistedFlowStep {
  fromLaneId?: string;
  toLaneId: string;
}

export interface PersistedCard {
  id: string;
  'created-time'?: number;
  'completed-time'?: number;
  sourceLaneId?: string;
  sourceItemIndex?: number;
  targetLaneId?: string;
  /** 审计日志:所有流转动作(含回退)追加,只增不删(受历史上限约束) */
  'flow-history'?: PersistedFlowRecord[];
  /** 撤销栈:仅“流转下一列”时 push,回退时 pop */
  'flow-source-history'?: PersistedFlowStep[];
  archived?: PersistedArchivedCard;
}

type PersistedCards = NonNullable<KanbanSettings['cards']>;

function isValidNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeArchivedCard(archived: unknown): PersistedArchivedCard | undefined {
  if (!archived || typeof archived !== 'object') {
    return undefined;
  }

  const source = archived as Record<string, unknown>;

  if (typeof source.sourceLaneId !== 'string' || !isValidNumber(source.sourceItemIndex)) {
    return undefined;
  }

  if (!isValidNumber(source.archivedAt)) {
    return undefined;
  }

  return {
    sourceLaneId: source.sourceLaneId,
    sourceItemIndex: source.sourceItemIndex as number,
    archivedAt: source.archivedAt as number,
    archiveDateFormat:
      typeof source.archiveDateFormat === 'string' ? source.archiveDateFormat : undefined,
    archiveDateSeparator:
      typeof source.archiveDateSeparator === 'string' ? source.archiveDateSeparator : undefined,
    archiveDateAfterTitle:
      typeof source.archiveDateAfterTitle === 'boolean'
        ? source.archiveDateAfterTitle
        : undefined,
  };
}

export function sanitizeFlowHistory(history: unknown): PersistedFlowRecord[] | undefined {
  if (!Array.isArray(history)) {
    return undefined;
  }

  const records = history.reduce<PersistedFlowRecord[]>((acc, record) => {
    if (!record || typeof record !== 'object') {
      return acc;
    }

    const source = record as Record<string, unknown>;

    if (typeof source.toLaneId !== 'string' || !source.toLaneId) {
      return acc;
    }

    if (!isValidNumber(source.at)) {
      return acc;
    }

    acc.push({
      fromLaneId: typeof source.fromLaneId === 'string' ? source.fromLaneId : undefined,
      toLaneId: source.toLaneId,
      at: source.at as number,
      back: source.back === true ? true : undefined,
    });

    return acc;
  }, []);

  return records.length ? records : undefined;
}

export function sanitizeFlowSourceHistory(history: unknown): PersistedFlowStep[] | undefined {
  if (!Array.isArray(history)) {
    return undefined;
  }

  const steps = history.reduce<PersistedFlowStep[]>((acc, step) => {
    if (!step || typeof step !== 'object') {
      return acc;
    }

    const source = step as Record<string, unknown>;

    if (typeof source.toLaneId !== 'string' || !source.toLaneId) {
      return acc;
    }

    acc.push({
      fromLaneId: typeof source.fromLaneId === 'string' ? source.fromLaneId : undefined,
      toLaneId: source.toLaneId,
    });

    return acc;
  }, []);

  return steps.length ? steps : undefined;
}

export function sanitizeCards(cards: unknown): PersistedCards | undefined {
  if (!Array.isArray(cards)) {
    return undefined;
  }

  const nextCards = cards.reduce<PersistedCards>((acc, card) => {
    if (!card || typeof card !== 'object') {
      return acc;
    }

    const source = card as Record<string, unknown>;

    if (typeof source.id !== 'string' || !source.id) {
      return acc;
    }

    const archived = sanitizeArchivedCard(source.archived);
    const nextCard: PersistedCard = {
      id: source.id,
    };

    if (isValidNumber(source['created-time'])) {
      nextCard['created-time'] = source['created-time'] as number;
    }

    if (isValidNumber(source['completed-time'])) {
      nextCard['completed-time'] = source['completed-time'] as number;
    }

    if (typeof source.sourceLaneId === 'string') {
      nextCard.sourceLaneId = source.sourceLaneId;
    }

    if (isValidNumber(source.sourceItemIndex)) {
      nextCard.sourceItemIndex = source.sourceItemIndex as number;
    }

    if (typeof source.targetLaneId === 'string') {
      nextCard.targetLaneId = source.targetLaneId;
    }

    const flowHistory = sanitizeFlowHistory(source['flow-history']);

    if (flowHistory) {
      nextCard['flow-history'] = flowHistory;
    }

    const flowSourceHistory = sanitizeFlowSourceHistory(source['flow-source-history']);

    if (flowSourceHistory) {
      nextCard['flow-source-history'] = flowSourceHistory;
    }

    if (archived) {
      nextCard.archived = archived;
    }

    if (
      nextCard['created-time'] === undefined &&
      nextCard['completed-time'] === undefined &&
      nextCard.sourceLaneId === undefined &&
      nextCard.sourceItemIndex === undefined &&
      nextCard.targetLaneId === undefined &&
      nextCard['flow-history'] === undefined &&
      nextCard['flow-source-history'] === undefined &&
      nextCard.archived === undefined
    ) {
      return acc;
    }

    acc.push(nextCard);
    return acc;
  }, []);

  return nextCards.length ? nextCards : undefined;
}

export function getCardMap(settings?: KanbanSettings): Map<string, PersistedCard> {
  const cards = sanitizeCards(settings?.cards);

  return new Map((cards || []).map((card) => [card.id, card]));
}

export function getCard(settings: KanbanSettings | undefined, blockId?: string): PersistedCard | undefined {
  if (!blockId) {
    return undefined;
  }

  return getCardMap(settings).get(blockId);
}

export function getCardCreatedTime(settings: KanbanSettings | undefined, blockId?: string) {
  return getCard(settings, blockId)?.['created-time'];
}

export function getCardCompletedTime(settings: KanbanSettings | undefined, blockId?: string) {
  return getCard(settings, blockId)?.['completed-time'];
}

export function getCompletedCardSource(settings: KanbanSettings | undefined, blockId?: string) {
  const card = getCard(settings, blockId);

  if (!card?.sourceLaneId) {
    return undefined;
  }

  return {
    sourceLaneId: card.sourceLaneId,
    sourceItemIndex: card.sourceItemIndex,
    targetLaneId: card.targetLaneId,
  };
}

export function getArchivedCardSource(settings: KanbanSettings | undefined, blockId?: string) {
  return getCard(settings, blockId)?.archived;
}

export function getCardFlowHistory(
  settings: KanbanSettings | undefined,
  blockId?: string
): PersistedFlowRecord[] {
  return getCard(settings, blockId)?.['flow-history'] || [];
}

/** 卡片撤销栈(仅“流转下一列”时 push,回退时 pop) */
export function getCardFlowSourceHistory(
  settings: KanbanSettings | undefined,
  blockId?: string
): PersistedFlowStep[] {
  return getCard(settings, blockId)?.['flow-source-history'] || [];
}

/** 历史上限:0=不保留任何记录,-1=不限制,其他=保留最近 max 条(流转与回退共用) */
export function applyFlowHistoryLimit(
  card: PersistedCard,
  max: number
): PersistedCard {
  if (max < 0) {
    return card;
  }

  const nextCard = { ...card };

  if (max === 0) {
    delete nextCard['flow-history'];
    delete nextCard['flow-source-history'];

    return nextCard;
  }

  if (nextCard['flow-history'] && nextCard['flow-history'].length > max) {
    nextCard['flow-history'] = nextCard['flow-history'].slice(-max);
  }

  if (nextCard['flow-source-history'] && nextCard['flow-source-history'].length > max) {
    nextCard['flow-source-history'] = nextCard['flow-source-history'].slice(-max);
  }

  return nextCard;
}

/** 追加一条流转记录;若新记录与末条完全同向则合并(更新时间)避免连点产生重复项 */
export function appendFlowRecord(
  card: PersistedCard,
  record: PersistedFlowRecord
): PersistedCard {
  const history = (card['flow-history'] || []).slice();
  const last = history[history.length - 1];

  if (last && last.toLaneId === record.toLaneId && last.fromLaneId === record.fromLaneId) {
    history[history.length - 1] = record;
  } else {
    history.push(record);
  }

  return { ...card, 'flow-history': history };
}

export function upsertCard(
  settings: KanbanSettings,
  blockId: string,
  updater: (card: PersistedCard) => PersistedCard | undefined
): PersistedCards {
  const cards = sanitizeCards(settings.cards) || [];
  const nextCards: PersistedCards = [];
  let didUpdate = false;
  let found = false;

  cards.forEach((card) => {
    if (card.id !== blockId) {
      nextCards.push(card);
      return;
    }

    found = true;
    const nextCard = updater({ ...card, archived: card.archived ? { ...card.archived } : undefined });

    if (nextCard) {
      nextCards.push(nextCard);
    }

    didUpdate = true;
  });

  if (!found) {
    const nextCard = updater({ id: blockId });

    if (nextCard) {
      nextCards.push(nextCard);
    }

    didUpdate = true;
  }

  return didUpdate ? nextCards : cards;
}

export function normalizeCard(card: PersistedCard): PersistedCard | undefined {
  const nextCard: PersistedCard = { id: card.id };

  if (isValidNumber(card['created-time'])) {
    nextCard['created-time'] = card['created-time'];
  }

  if (isValidNumber(card['completed-time'])) {
    nextCard['completed-time'] = card['completed-time'];
  }

  if (typeof card.sourceLaneId === 'string') {
    nextCard.sourceLaneId = card.sourceLaneId;
  }

  if (isValidNumber(card.sourceItemIndex)) {
    nextCard.sourceItemIndex = card.sourceItemIndex;
  }

  if (typeof card.targetLaneId === 'string') {
    nextCard.targetLaneId = card.targetLaneId;
  }

  if (card['flow-history']) {
    nextCard['flow-history'] = card['flow-history'];
  }

  if (card['flow-source-history']) {
    nextCard['flow-source-history'] = card['flow-source-history'];
  }

  if (card.archived) {
    nextCard.archived = card.archived;
  }

  return Object.keys(nextCard).length > 1 || nextCard.archived ? nextCard : undefined;
}

export function updateCard(
  settings: KanbanSettings,
  blockId: string,
  updater: (card: PersistedCard) => PersistedCard | undefined
): PersistedCards {
  return upsertCard(settings, blockId, (card) => {
    const nextCard = updater(card);

    return nextCard ? normalizeCard(nextCard) : undefined;
  });
}

export function removeCards(settings: KanbanSettings, blockIds: string[]): PersistedCards | undefined {
  if (!blockIds.length) {
    return sanitizeCards(settings.cards);
  }

  const ids = new Set(blockIds);
  const nextCards = (sanitizeCards(settings.cards) || []).filter((card) => !ids.has(card.id));

  return nextCards.length ? nextCards : undefined;
}