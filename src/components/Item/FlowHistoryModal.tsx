import { App, Modal, moment } from 'obsidian';

import { PersistedFlowRecord } from 'src/helpers/cardSettings';
import { t } from 'src/lang/helpers';

import { c } from '../helpers';
import { Lane } from '../types';

class FlowHistoryModalImpl extends Modal {
  private onClickOutside: (e: MouseEvent) => void;

  constructor(
    app: App,
    private history: PersistedFlowRecord[],
    private lanes: Lane[],
    private onCloseCb: () => void
  ) {
    super(app);
  }

  onOpen() {
    this.modalEl.addClass(c('flow-history-modal'));

    // 阻止点击弹窗内部时冒泡到遮罩
    this.modalEl.addEventListener('click', (e) => e.stopPropagation());
    // 点击遮罩(弹窗外部)关闭
    this.onClickOutside = (e: MouseEvent) => {
      if (!this.modalEl.contains(e.target as Node)) {
        this.close();
      }
    };
    document.body.addEventListener('mousedown', this.onClickOutside, true);

    const { history, lanes } = this;
    const format = 'YYYY-MM-DD HH:mm';

    this.contentEl.empty();
    this.contentEl.createEl('div', {
      cls: c('flow-history-title'),
      text: t('View flow history'),
    });

    if (!history.length) {
      this.contentEl.createEl('div', {
        cls: c('flow-history-empty'),
        text: t('No flow history'),
      });
      return;
    }

    const list = this.contentEl.createEl('div', { cls: c('flow-history-list') });

    [...history].reverse().forEach((record) => {
      const row = list.createEl('div', { cls: c('flow-history-row') });
      row.createEl('div', {
        cls: c('flow-history-time'),
        text: moment(record.at).format(format),
      });
      row.createEl('div', {
        cls: c('flow-history-path'),
        text: `${laneTitle(lanes, record.fromLaneId)} → ${laneTitle(lanes, record.toLaneId)}`,
      });
    });
  }

  onClose() {
    document.body.removeEventListener('mousedown', this.onClickOutside, true);
    this.contentEl.empty();
    this.onCloseCb?.();
  }
}

function laneTitle(lanes: Lane[], laneId?: string) {
  if (!laneId) return '—';

  const lane = lanes.find((child) => child.id === laneId);

  return lane?.data.title || '—';
}

/** 打开流转历史弹窗(原生 Modal:Esc/点击遮罩关闭) */
export function openFlowHistoryModal(
  app: App,
  history: PersistedFlowRecord[],
  lanes: Lane[],
  onClose?: () => void
) {
  new FlowHistoryModalImpl(app, history, lanes, onClose).open();
}
