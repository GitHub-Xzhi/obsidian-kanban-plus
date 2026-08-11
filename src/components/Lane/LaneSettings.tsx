import update from 'immutability-helper';
import { useContext } from 'preact/compat';
import { Path } from 'src/dnd/types';
import { t } from 'src/lang/helpers';

import { KanbanContext } from '../context';
import { c } from '../helpers';
import { EditState, Lane, isEditing } from '../types';

const laneBackgroundColorRegex =
  /^(?:#(?:[0-9a-f]{3}|[0-9a-f]{6})|rgba?\(\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/i;

export interface LaneSettingsProps {
  lane: Lane;
  lanePath: Path;
  editState: EditState;
}

export function LaneSettings({ lane, lanePath, editState }: LaneSettingsProps) {
  const { boardModifiers } = useContext(KanbanContext);
  const laneBackgroundColor = lane.data.backgroundColor || '';

  if (!isEditing(editState)) return null;

  return (
    <div className={c('lane-setting-wrapper')}>
      <div className={c('lane-setting-input-wrapper')}>
        <div className={c('checkbox-label')}>{t('List background color')}</div>
        <input
          className={c('lane-input')}
          placeholder="#D8EAFE / rgb(216, 234, 254)"
          value={laneBackgroundColor}
          onInput={(e) => {
            const inputEl = e.currentTarget as HTMLInputElement;
            const nextColor = inputEl.value.trim();

            if (!nextColor) {
              inputEl.removeClass('error');
              boardModifiers.updateLane(
                lanePath,
                update(lane, {
                  data: {
                    $unset: ['backgroundColor'],
                  },
                })
              );
              return;
            }

            if (!laneBackgroundColorRegex.test(nextColor)) {
              inputEl.addClass('error');
              return;
            }

            inputEl.removeClass('error');
            boardModifiers.updateLane(
              lanePath,
              update(lane, {
                data: {
                  backgroundColor: {
                    $set: nextColor,
                  },
                },
              })
            );
          }}
        />
      </div>
      <div className={c('checkbox-wrapper')}>
        <div className={c('checkbox-label')}>{t('Mark cards in this list as complete')}</div>
        <div
          onClick={() =>
            boardModifiers.updateLane(
              lanePath,
              update(lane, {
                data: { $toggle: ['shouldMarkItemsComplete'] },
              })
            )
          }
          className={`checkbox-container ${lane.data.shouldMarkItemsComplete ? 'is-enabled' : ''}`}
        />
      </div>
    </div>
  );
}
