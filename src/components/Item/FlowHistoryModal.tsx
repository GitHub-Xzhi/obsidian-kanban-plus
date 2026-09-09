import { App, Modal, moment } from 'obsidian';
import classcat from 'classcat';

import { PersistedFlowRecord } from 'src/helpers/cardSettings';
import { t } from 'src/lang/helpers';

import { c } from '../helpers';
import { Lane } from '../types';

class FlowHistoryModalImpl extends Modal {
  private onClickOutside: (e: MouseEvent) => void;
  /** 当前展示的历史快照;清空后置空并重渲染 */
  private history: PersistedFlowRecord[];
  /** 是否处于“确认清空”视图 */
  private confirming = false;

  constructor(
    app: App,
    history: PersistedFlowRecord[],
    private lanes: Lane[],
    private onCloseCb: () => void,
    private onClear?: () => void
  ) {
    super(app);
    this.history = history;
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

    this.renderContent();
  }

  renderContent() {
    const { lanes } = this;
    const history = this.history;
    const format = 'YYYY-MM-DD HH:mm:ss';

    this.contentEl.empty();

    // 标题行:标题 + 清空按钮(有记录且提供清空回调时显示)
    const titleRow = this.contentEl.createEl('div', { cls: c('flow-history-title-row') });
    titleRow.createEl('div', {
      cls: c('flow-history-title'),
      text: t('View flow history'),
    });

    if (!this.confirming && this.onClear && history.length) {
      titleRow
        .createEl('a', {
          cls: c('flow-history-clear'),
          text: t('Clear'),
        })
        .addEventListener('click', () => {
          this.confirming = true;
          this.renderContent();
        });
    }

    // 二次确认视图:点击清空后先询问用户是否确定
    if (this.confirming) {
      this.renderConfirm();
      return;
    }

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

      const labelRow = row.createEl('div', { cls: c('flow-history-label-row') });
      labelRow.createEl('span', {
        cls: classcat([
          c('flow-history-tag'),
          record.back ? 'is-back' : 'is-forward',
        ]),
        text: record.back ? t('Back') : t('Flow'),
      });
      labelRow.createEl('div', {
        cls: c('flow-history-time'),
        text: moment(record.at).format(format),
      });
      row.createEl('div', {
        cls: c('flow-history-path'),
        text: `${laneTitle(lanes, record.fromLaneId)} → ${laneTitle(lanes, record.toLaneId)}`,
      });
    });
  }

  renderConfirm() {
    const confirm = this.contentEl.createEl('div', { cls: c('flow-history-confirm') });

    confirm.createEl('div', {
      cls: c('flow-history-confirm-text'),
      text: t('Are you sure you want to clear the flow history?'),
    });

    const actions = confirm.createEl('div', { cls: c('flow-history-confirm-actions') });

    actions
      .createEl('button', { cls: 'mod-warning', text: t('Yes, clear history') })
      .addEventListener('click', () => {
        this.confirming = false;
        this.history = [];
        this.onClear?.();
        this.close();
      });

    actions
      .createEl('button', { text: t('Cancel') })
      .addEventListener('click', () => {
        this.confirming = false;
        this.renderContent();
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

/** 打开流转历史弹窗(原生 Modal:Esc/点击遮罩关闭);提供 onClear 时显示“清空”按钮(点击后二次确认) */
export function openFlowHistoryModal(
  app: App,
  history: PersistedFlowRecord[],
  lanes: Lane[],
  onClose?: () => void,
  onClear?: () => void
) {
  new FlowHistoryModalImpl(app, history, lanes, onClose, onClear).open();
}
