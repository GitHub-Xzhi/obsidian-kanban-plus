import { Modal, Setting } from 'obsidian';
import { noDefaultCompleteLaneId } from 'src/Settings';
import { StateManager } from 'src/StateManager';
import { t } from 'src/lang/helpers';

export class CompleteLaneModal extends Modal {
  stateManager: StateManager;
  sourceLaneIndex?: number;
  onSelect?: (laneIndex: number | typeof noDefaultCompleteLaneId) => void;

  constructor(
    stateManager: StateManager,
    sourceLaneIndex?: number,
    onSelect?: (laneIndex: number | typeof noDefaultCompleteLaneId) => void
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

    const selectDefaultLane = (laneIndex: number | typeof noDefaultCompleteLaneId) => {
      if (laneIndex === noDefaultCompleteLaneId) {
        this.stateManager.setNoDefaultCompleteLane(this.sourceLaneIndex);
      } else {
        this.stateManager.setDefaultCompleteLane(laneIndex, this.sourceLaneIndex);
      }

      this.onSelect?.(laneIndex);
      this.close();
    };

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
    noneSetting.settingEl.addClass('clickable-icon');
    noneSetting.settingEl.addEventListener('click', () => {
      noneRadio.checked = true;
      selectDefaultLane(noDefaultCompleteLaneId);
    });
    noneRadio.addEventListener('change', () => {
      if (noneRadio.checked) {
        selectDefaultLane(noDefaultCompleteLaneId);
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
      setting.settingEl.addClass('clickable-icon');
      setting.settingEl.addEventListener('click', () => {
        radio.checked = true;
        selectDefaultLane(index);
      });
      radio.addEventListener('change', () => {
        if (radio.checked) {
          selectDefaultLane(index);
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
  onSelect?: (laneIndex: number | typeof noDefaultCompleteLaneId) => void
) {
  new CompleteLaneModal(stateManager, sourceLaneIndex, onSelect).open();
}
