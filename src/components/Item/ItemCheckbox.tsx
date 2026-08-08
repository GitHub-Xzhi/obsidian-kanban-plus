import update from 'immutability-helper';
import { memo, useCallback, useEffect, useState } from 'preact/compat';
import { StateManager } from 'src/StateManager';
import { Path } from 'src/dnd/types';
import { getTaskStatusDone, toggleTask } from 'src/parsers/helpers/inlineMetadata';

import { BoardModifiers } from '../../helpers/boardModifiers';
import { Icon } from '../Icon/Icon';
import { openCompleteLaneModal } from '../Lane/CompleteLaneModal';
import { c } from '../helpers';
import { Item } from '../types';

interface ItemCheckboxProps {
  path: Path;
  item: Item;
  shouldMarkItemsComplete: boolean;
  stateManager: StateManager;
  boardModifiers: BoardModifiers;
}

export const ItemCheckbox = memo(function ItemCheckbox({
  shouldMarkItemsComplete,
  path,
  item,
  stateManager,
  boardModifiers,
}: ItemCheckboxProps) {
  const shouldShowCheckbox = stateManager.useSetting('show-checkboxes');

  const [isCtrlHoveringCheckbox, setIsCtrlHoveringCheckbox] = useState(false);
  const [isHoveringCheckbox, setIsHoveringCheckbox] = useState(false);

  const onCheckboxChange = useCallback(() => {
    const isComplete = item.data.checked && item.data.checkChar === getTaskStatusDone();
    const updates = toggleTask(item, stateManager.file);

    let replacements: Item[];
    let completedIndex = 0;

    if (updates) {
      const [itemStrings, checkChars, thisIndex] = updates;
      replacements = itemStrings.map((str, i) => {
        const next = stateManager.getNewItem(str, checkChars[i]);
        if (i === thisIndex) next.id = item.id;
        return next;
      });

      completedIndex = thisIndex;
    } else {
      replacements = [
        update(item, {
          data: {
            checkChar: {
              $apply: (v) => {
                return v === ' ' ? getTaskStatusDone() : ' ';
              },
            },
            $toggle: ['checked'],
          },
        }),
      ];
    }

    const completeLanes = stateManager.getCompleteLaneOptions();
    const sourceIsCompleteLane = completeLanes.some((option) => option.index === path[0]);

    if (!isComplete && completeLanes.length && !sourceIsCompleteLane) {
      const moveToLane = (laneIndex: number) => {
        if (!stateManager.moveCompletedItemToLane(path, replacements, completedIndex, laneIndex)) {
          boardModifiers.updateItem(path, replacements[completedIndex]);
        }
      };

      const defaultCompleteLaneIndex = stateManager.getDefaultCompleteLaneIndex();

      if (defaultCompleteLaneIndex !== null) {
        moveToLane(defaultCompleteLaneIndex);
      } else {
        openCompleteLaneModal(stateManager, moveToLane);
      }

      return;
    }

    if (replacements.length === 1) {
      boardModifiers.updateItem(path, replacements[0]);
    } else {
      boardModifiers.replaceItem(path, replacements);
    }
  }, [item, stateManager, boardModifiers, ...path]);

  useEffect(() => {
    if (isHoveringCheckbox) {
      const handler = (e: KeyboardEvent) => {
        if (e.metaKey || e.ctrlKey) {
          setIsCtrlHoveringCheckbox(true);
        } else {
          setIsCtrlHoveringCheckbox(false);
        }
      };

      activeWindow.addEventListener('keydown', handler);
      activeWindow.addEventListener('keyup', handler);

      return () => {
        activeWindow.removeEventListener('keydown', handler);
        activeWindow.removeEventListener('keyup', handler);
      };
    }
  }, [isHoveringCheckbox]);

  if (!(shouldMarkItemsComplete || shouldShowCheckbox)) {
    return null;
  }

  return (
    <div
      onMouseEnter={(e) => {
        setIsHoveringCheckbox(true);

        if (e.ctrlKey || e.metaKey) {
          setIsCtrlHoveringCheckbox(true);
        }
      }}
      onMouseLeave={() => {
        setIsHoveringCheckbox(false);

        if (isCtrlHoveringCheckbox) {
          setIsCtrlHoveringCheckbox(false);
        }
      }}
      className={c('item-prefix-button-wrapper')}
    >
      {shouldShowCheckbox && !isCtrlHoveringCheckbox && (
        <input
          onChange={onCheckboxChange}
          type="checkbox"
          className="task-list-item-checkbox"
          checked={item.data.checked}
          data-task={item.data.checkChar}
        />
      )}
      {(isCtrlHoveringCheckbox || (!shouldShowCheckbox && shouldMarkItemsComplete)) && (
        <a
          onClick={() => {
            boardModifiers.archiveItem(path);
          }}
          className={`${c('item-prefix-button')} clickable-icon`}
          aria-label={isCtrlHoveringCheckbox ? undefined : 'Archive card'}
        >
          <Icon name="sheets-in-box" />
        </a>
      )}
    </div>
  );
});
