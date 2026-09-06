import { moment } from 'obsidian';
import Preact, { useContext } from 'preact/compat';

import { PersistedFlowRecord } from 'src/helpers/cardSettings';
import { t } from 'src/lang/helpers';

import { KanbanContext } from '../context';
import { c } from '../helpers';
import { Lane } from '../types';

interface FlowHistoryModalProps {
  history: PersistedFlowRecord[];
  onClose: () => void;
}

function laneTitle(lanes: Lane[], laneId?: string) {
  if (!laneId) return '—';

  const lane = lanes.find((child) => child.id === laneId);

  return lane?.data.title || '—';
}

export function FlowHistoryModal({ history, onClose }: FlowHistoryModalProps) {
  const { stateManager } = useContext(KanbanContext);
  const lanes = stateManager.state.children;
  const format = stateManager.getSetting('card-completed-time-format') || 'YYYY-MM-DD HH:mm';

  return (
    <div className={c('flow-history-backdrop')} onClick={onClose}>
      <div
        className={c('flow-history-modal')}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <div className={c('flow-history-title')}>{t('View flow history')}</div>

        {history.length === 0 ? (
          <div className={c('flow-history-empty')}>{t('No flow history')}</div>
        ) : (
          <div className={c('flow-history-list')}>
            {history.map((record, index) => {
              const m = moment(record.at);

              return (
                <div className={c('flow-history-row')} key={index}>
                  <span className={c('flow-history-time')}>{m.format(format)}</span>
                  <span className={c('flow-history-path')}>
                    {`${laneTitle(lanes, record.fromLaneId)} → ${laneTitle(lanes, record.toLaneId)}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
