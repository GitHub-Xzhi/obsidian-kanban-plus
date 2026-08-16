import { Modal, Setting } from 'obsidian';
import { noDefaultCompleteLaneId } from 'src/Settings';
import { StateManager } from 'src/StateManager';
import { t } from 'src/lang/helpers';

export class CompleteLaneModal extends Modal {
  stateManager: StateManager;
  sourceLaneIndex?: number;
  onSelect?: (laneIndex: number) => void;

  constructor(
    stateManager: StateManager,
    sourceLaneIndex?: number,
    onSelect?: (laneIndex: number) => void
  ) {
    super(stateManager.app);

    this.stateManager = stateManager;
    this.sourceLaneIndex = sourceLaneIndex;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    const completeLanes = this.stateManager.getCompleteLaneOptions();
    const defaultLaneIndex = this.stateManager.getDefaultCompleteLaneIndex(this.sourceLaneIndex);

    contentEl.createEl('h3', { text: t('Default complete list') });
    contentEl.createEl('p', {
      text: t('Cards completed by checkbox will be moved to this list.'),
    });

    const noneSetting = new Setting(contentEl)
      .setName(t('None'))
      .setDesc(defaultLaneIndex === noDefaultCompleteLaneId ? t('default') : '');

    const noneRadio = noneSetting.controlEl.createEl('input', {
      attr: {
        type: 'radio',
        name: 'kanban-default-complete-lane',
      },
    });

    noneRadio.checked = defaultLaneIndex === noDefaultCompleteLaneId;
    noneRadio.addEventListener('change', () => {
      if (noneRadio.checked) {
        this.stateManager.setNoDefaultCompleteLane(this.sourceLaneIndex);
        this.close();
      }
    });

    completeLanes.forEach(({ lane, index }) => {
      const setting = new Setting(contentEl)
        .setName(lane.data.title || t('Untitled'))
        .setDesc(index === defaultLaneIndex ? t('default') : '');

      const radio = setting.controlEl.createEl('input', {
        attr: {
          type: 'radio',
          name: 'kanban-default-complete-lane',
        },
      });

      radio.checked = index === defaultLaneIndex;
      radio.addEventListener('change', () => {
        if (radio.checked) {
          this.stateManager.setDefaultCompleteLane(index, this.sourceLaneIndex);
          this.onSelect?.(index);
          this.close();
        }
      });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

export function openCompleteLaneModal(
  stateManager: StateManager,
  sourceLaneIndex?: number,
  onSelect?: (laneIndex: number) => void
) {
  new CompleteLaneModal(stateManager, sourceLaneIndex, onSelect).open();
}
