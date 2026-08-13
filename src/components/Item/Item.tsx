import classcat from 'classcat';
import {
  JSX,
  Fragment,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/compat';
import { Droppable, useNestedEntityPath } from 'src/dnd/components/Droppable';
import { DndManagerContext } from 'src/dnd/components/context';
import { useDragHandle } from 'src/dnd/managers/DragManager';
import { frontmatterKey } from 'src/parsers/common';
import { t } from 'src/lang/helpers';
import { getCardCreatedTime, getCardCompletedTime } from 'src/helpers/cardSettings';

import { KanbanContext, SearchContext } from '../context';
import { c } from '../helpers';
import { EditState, EditingState, Item, isEditing } from '../types';
import { ItemCheckbox } from './ItemCheckbox';
import { ItemContent } from './ItemContent';
import { useItemMenu } from './ItemMenu';
import { ItemMenuButton } from './ItemMenuButton';
import { ItemMetadata } from './MetadataTable';
import { getItemClassModifiers } from './helpers';

export interface DraggableItemProps {
  item: Item;
  itemIndex: number;
  isStatic?: boolean;
  shouldMarkItemsComplete?: boolean;
  showCreatedTime?: boolean;
  showCompletedTime?: boolean;
}

export interface ItemInnerProps {
  item: Item;
  isStatic?: boolean;
  shouldMarkItemsComplete?: boolean;
  showCreatedTime?: boolean;
  showCompletedTime?: boolean;
  isMatch?: boolean;
  searchQuery?: string;
}

const ItemInner = memo(function ItemInner({
  item,
  shouldMarkItemsComplete,
  showCreatedTime,
  showCompletedTime,
  isMatch,
  searchQuery,
  isStatic,
}: ItemInnerProps) {
  const { stateManager, boardModifiers } = useContext(KanbanContext);
  const [editState, setEditState] = useState<EditState>(EditingState.cancel);

  const dndManager = useContext(DndManagerContext);

  useEffect(() => {
    const handler = () => {
      if (isEditing(editState)) setEditState(EditingState.cancel);
    };

    dndManager.dragManager.emitter.on('dragStart', handler);
    return () => {
      dndManager.dragManager.emitter.off('dragStart', handler);
    };
  }, [dndManager, editState]);

  useEffect(() => {
    if (item.data.forceEditMode) {
      setEditState({ x: 0, y: 0 });
    }
  }, [item.data.forceEditMode]);

  const path = useNestedEntityPath();

  const showItemMenu = useItemMenu({
    boardModifiers,
    item,
    setEditState: setEditState,
    stateManager,
    path,
  });

  const onContextMenu: JSX.MouseEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      if (isEditing(editState)) return;
      if (
        e.targetNode.instanceOf(HTMLAnchorElement) &&
        (e.targetNode.hasClass('internal-link') || e.targetNode.hasClass('external-link'))
      ) {
        return;
      }
      showItemMenu(e);
    },
    [showItemMenu, editState]
  );

  const onDoubleClick: JSX.MouseEventHandler<HTMLDivElement> = useCallback(
    (e) => setEditState({ x: e.clientX, y: e.clientY }),
    [setEditState]
  );

  const ignoreAttr = useMemo(() => {
    if (isEditing(editState)) {
      return {
        'data-ignore-drag': true,
      };
    }

    return {};
  }, [editState]);

  return (
    <div
      // eslint-disable-next-line react/no-unknown-property
      onDblClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={c('item-content-wrapper')}
      {...ignoreAttr}
    >
      <div className={c('item-title-wrapper')} {...ignoreAttr}>
        <ItemCheckbox
          boardModifiers={boardModifiers}
          item={item}
          path={path}
          shouldMarkItemsComplete={shouldMarkItemsComplete}
          stateManager={stateManager}
        />
        <ItemContent
          item={item}
          searchQuery={isMatch ? searchQuery : undefined}
          setEditState={setEditState}
          editState={editState}
          isStatic={isStatic}
        />
        <ItemMenuButton editState={editState} setEditState={setEditState} showMenu={showItemMenu} />
      </div>
      <ItemMetadata
        searchQuery={isMatch ? searchQuery : undefined}
        item={item}
        shouldMarkItemsComplete={shouldMarkItemsComplete}
        showCreatedTime={showCreatedTime}
        showCompletedTime={showCompletedTime}
      />
    </div>
  );
});

export const DraggableItem = memo(function DraggableItem(props: DraggableItemProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const search = useContext(SearchContext);

  const { itemIndex, ...innerProps } = props;

  const bindHandle = useDragHandle(measureRef, measureRef);

  const isMatch = search?.query ? innerProps.item.data.titleSearch.includes(search.query) : false;
  const classModifiers: string[] = getItemClassModifiers(innerProps.item);

  return (
    <div
      ref={(el) => {
        measureRef.current = el;
        bindHandle(el);
      }}
      className={c('item-wrapper')}
    >
      <div ref={elementRef} className={classcat([c('item'), ...classModifiers])}>
        {props.isStatic ? (
          <ItemInner
            {...innerProps}
            isMatch={isMatch}
            searchQuery={search?.query}
            isStatic={true}
          />
        ) : (
          <Droppable
            elementRef={elementRef}
            measureRef={measureRef}
            id={props.item.id}
            index={itemIndex}
            data={props.item}
          >
            <ItemInner {...innerProps} isMatch={isMatch} searchQuery={search?.query} />
          </Droppable>
        )}
      </div>
    </div>
  );
});

interface ItemsProps {
  isStatic?: boolean;
  items: Item[];
  shouldMarkItemsComplete: boolean;
  showCreatedTime?: boolean;
  showCompletedTime?: boolean;
  laneId?: string;
  groupBy?: 'created-time' | 'completed-time';
}

interface ItemGroup {
  id: string;
  title: string;
  items: Array<{ item: Item; itemIndex: number }>;
}

export const Items = memo(function Items({
  isStatic,
  items,
  shouldMarkItemsComplete,
  showCreatedTime,
  showCompletedTime,
  laneId,
  groupBy,
}: ItemsProps) {
  const search = useContext(SearchContext);
  const { view } = useContext(KanbanContext);
  const { stateManager } = useContext(KanbanContext);
  const boardView = view.useViewState(frontmatterKey);
  const groupedCollapseState = view.useViewState('time-group-collapse') || {};

  const toggleGroup = useCallback(
    (groupId: string) => {
      const nextState = {
        ...groupedCollapseState,
        [groupId]: !groupedCollapseState[groupId],
      };
      view.setViewState('time-group-collapse', nextState);
      stateManager.softRefresh();
    },
    [groupedCollapseState, stateManager, view]
  );

  const groups = useMemo(() => {
    if (!groupBy || !laneId) {
      return null;
    }

    const getTime = (item: Item) => {
      if (groupBy === 'created-time') {
        return getCardCreatedTime(stateManager.state.data.settings, item.data.blockId);
      }

      return getCardCompletedTime(stateManager.state.data.settings, item.data.blockId);
    };

    const grouped = new Map<string, ItemGroup>();

    items.forEach((item, itemIndex) => {
      if (search?.query && !search.items.has(item)) {
        return;
      }

      const timestamp = getTime(item);
      const title = timestamp ? window.moment(timestamp).format('YYYY-MM-DD') : 'Unscheduled';
      const id = `${laneId}:${groupBy}:${title}`;

      if (!grouped.has(id)) {
        grouped.set(id, {
          id,
          title: timestamp ? title : t('No time set'),
          items: [],
        });
      }

      grouped.get(id).items.push({ item, itemIndex });
    });

    return Array.from(grouped.values());
  }, [groupBy, items, laneId, search?.items, search?.query, stateManager]);

  return (
    <>
      {(groups || [
        {
          id: `${laneId || 'lane'}:all`,
          title: '',
          items: items
            .map((item, itemIndex) => ({ item, itemIndex }))
            .filter(({ item }) => !(search?.query && !search.items.has(item))),
        },
      ]).map((group) => {
        const isCollapsed = !!groupedCollapseState[group.id];

        return (
          <Fragment key={group.id}>
            {!!groupBy && (
              <button className={c('item-group-header')} onClick={() => toggleGroup(group.id)}>
                <span
                  className={c('item-group-header-icon')}
                  data-collapsed={isCollapsed ? 'true' : 'false'}
                >
                  <span className={c('item-group-header-icon-line')} />
                  <span className={c('item-group-header-icon-line')} />
                </span>
                <span className={c('item-group-header-title')}>{group.title}</span>
                <span className={c('item-group-header-count')}>{group.items.length}</span>
              </button>
            )}

            {!isCollapsed &&
              group.items.map(({ item, itemIndex }) => {
                return (
                  <DraggableItem
                    key={boardView + item.id}
                    item={item}
                    itemIndex={itemIndex}
                    shouldMarkItemsComplete={shouldMarkItemsComplete}
                    showCreatedTime={showCreatedTime}
                    showCompletedTime={showCompletedTime}
                    isStatic={isStatic}
                  />
                );
              })}
          </Fragment>
        );
      })}
    </>
  );
});
