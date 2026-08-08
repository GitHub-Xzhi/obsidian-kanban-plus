import { Modal, Setting } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { t } from 'src/lang/helpers';

export class CompleteLaneModal extends Modal {
  stateManager: StateManager;
  onSelect?: (laneIndex: number) => void;

  constructor(stateManager: StateManager, onSelect?: (laneIndex: number) => void) {
    super(stateManager.app);

    this.stateManager = stateManager;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    const completeLanes = this.stateManager.getCompleteLaneOptions();
    const defaultLaneIndex = this.stateManager.getDefaultCompleteLaneIndex();

    contentEl.createEl('h3', { text: t('Default complete list') });
    contentEl.createEl('p', {
      text: t('Cards completed by checkbox will be moved to this list.'),
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
          this.stateManager.setDefaultCompleteLane(index);
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
  onSelect?: (laneIndex: number) => void
) {
  new CompleteLaneModal(stateManager, onSelect).open();
}
