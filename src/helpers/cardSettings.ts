import { KanbanSettings } from 'src/Settings';

export interface PersistedArchivedCard {
  sourceLaneId: string;
  sourceItemIndex: number;
  archivedAt: number;
  archiveDateFormat?: string;
  archiveDateSeparator?: string;
  archiveDateAfterTitle?: boolean;
}

export interface PersistedCard {
  id: string;
  'created-time'?: number;
  'completed-time'?: number;
  sourceLaneId?: string;
  sourceItemIndex?: number;
  targetLaneId?: string;
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
    sourceItemIndex: source.sourceItemIndex,
    archivedAt: source.archivedAt,
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
      nextCard['created-time'] = source['created-time'];
    }

    if (isValidNumber(source['completed-time'])) {
      nextCard['completed-time'] = source['completed-time'];
    }

    if (typeof source.sourceLaneId === 'string') {
      nextCard.sourceLaneId = source.sourceLaneId;
    }

    if (isValidNumber(source.sourceItemIndex)) {
      nextCard.sourceItemIndex = source.sourceItemIndex;
    }

    if (typeof source.targetLaneId === 'string') {
      nextCard.targetLaneId = source.targetLaneId;
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