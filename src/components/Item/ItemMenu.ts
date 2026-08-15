import update from 'immutability-helper';
import { Menu, MenuItem, Platform, TFile, TFolder } from 'obsidian';
import { Dispatch, StateUpdater, useCallback } from 'preact/hooks';
import { StateManager } from 'src/StateManager';
import { Path } from 'src/dnd/types';
import { t } from 'src/lang/helpers';

import { BoardModifiers } from '../../helpers/boardModifiers';
import { applyTemplate, escapeRegExpStr, generateInstanceId } from '../helpers';
import { EditState, Item } from '../types';
import {
  constructDatePicker,
  constructMenuDatePickerOnChange,
  constructMenuTimePickerOnChange,
  constructTimePicker,
} from './helpers';

const illegalCharsRegEx = /[\\/:"*?<>|]+/g;
const embedRegEx = /!?\[\[([^\]]*)\.[^\]]+\]\]/g;
const wikilinkRegEx = /!?\[\[([^\]]*)\]\]/g;
const mdLinkRegEx = /!?\[([^\]]*)\]\([^)]*\)/g;
const tagRegEx = /#([^\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~[\]\\\s\n\r]+)/g;
const condenceWhiteSpaceRE = /\s+/g;

type FileManagerWithCreate = StateManager['app']['fileManager'] & {
  createNewMarkdownFile: (folder: TFolder, title: string) => Promise<TFile>;
};

interface MenuItemWithSubmenu extends MenuItem {
  setSubmenu: () => Menu;
}

interface UseItemMenuParams {
  setEditState: Dispatch<StateUpdater<EditState>>;
  item: Item;
  path: Path;
  boardModifiers: BoardModifiers;
  stateManager: StateManager;
}

export function useItemMenu({
  setEditState,
  item: card,
  path,
  boardModifiers,
  stateManager,
}: UseItemMenuParams) {
  return useCallback(
    (e: MouseEvent) => {
      const coordinates = { x: e.clientX, y: e.clientY };
      const fileManager = stateManager.app.fileManager;
      const pickerWindow = activeWindow;
      const hasDate = !!card.data.metadata.date;
      const hasTime = !!card.data.metadata.time;
      const copyCardLink = () => {
        const blockId = card.data.blockId || generateInstanceId(6);

        void navigator.clipboard.writeText(
          `${fileManager.generateMarkdownLink(stateManager.file, '', '#^' + blockId)}`
        );

        if (!card.data.blockId) {
          boardModifiers.updateItem(
            path,
            stateManager.updateItemContent(
              update(card, { data: { blockId: { $set: blockId } } }),
              card.data.titleRaw
            )
          );
        }
      };

      const menu = new Menu().addItem((i) => {
        i.setIcon('lucide-edit')
          .setTitle(t('Edit card'))
          .onClick(() => setEditState(coordinates));
      });

      menu
        .addItem((i) => {
          i.setIcon('lucide-file-plus-2')
            .setTitle(t('New note from card'))
            .onClick(async () => {
              const prevTitle = card.data.titleRaw.split('\n')[0].trim();
              const sanitizedTitle = prevTitle
                .replace(embedRegEx, '$1')
                .replace(wikilinkRegEx, '$1')
                .replace(mdLinkRegEx, '$1')
                .replace(tagRegEx, '$1')
                .replace(illegalCharsRegEx, ' ')
                .trim()
                .replace(condenceWhiteSpaceRE, ' ');

              const newNoteFolder = stateManager.getSetting('new-note-folder');
              const newNoteTemplatePath = stateManager.getSetting('new-note-template');

              const configuredFolder = newNoteFolder
                ? stateManager.app.vault.getAbstractFileByPath(newNoteFolder)
                : null;
              const targetFolder = configuredFolder instanceof TFolder
                ? configuredFolder
                : stateManager.app.fileManager.getNewFileParent(stateManager.file.path);

              const newFile = await (stateManager.app.fileManager as FileManagerWithCreate).createNewMarkdownFile(
                targetFolder,
                sanitizedTitle
              );

              const newLeaf = stateManager.app.workspace.getLeaf(true);

              await newLeaf.openFile(newFile);

              await applyTemplate(stateManager, newNoteTemplatePath);

              const newTitleRaw = card.data.titleRaw.replace(
                prevTitle,
                fileManager.generateMarkdownLink(newFile, stateManager.file.path)
              );

              boardModifiers.updateItem(path, stateManager.updateItemContent(card, newTitleRaw));
            });
        })
        .addItem((i) => {
          i.setIcon('lucide-link').setTitle(t('Copy link to card')).onClick(copyCardLink);
        })
        .addSeparator();

      if (/\n/.test(card.data.titleRaw)) {
        menu.addItem((i) => {
          i.setIcon('lucide-wrap-text')
            .setTitle(t('Split card'))
            .onClick(async () => {
              const titles = card.data.titleRaw.split(/[\r\n]+/g).map((t) => t.trim());
              const newItems = titles.map((title) => stateManager.getNewItem(title, ' '));

              boardModifiers.splitItem(path, newItems);
            });
        });
      }

      menu
        .addItem((i) => {
          i.setIcon('lucide-copy')
            .setTitle(t('Duplicate card'))
            .onClick(() => boardModifiers.duplicateEntity(path));
        })
        .addItem((i) => {
          i.setIcon('lucide-list-start')
            .setTitle(t('Insert card before'))
            .onClick(() =>
              boardModifiers.insertItems(path, [stateManager.getNewItem('', ' ', true)])
            );
        })
        .addItem((i) => {
          i.setIcon('lucide-list-end')
            .setTitle(t('Insert card after'))
            .onClick(() => {
              const newPath = [...path];

              newPath[newPath.length - 1] = newPath[newPath.length - 1] + 1;

              boardModifiers.insertItems(newPath, [stateManager.getNewItem('', ' ', true)]);
            });
        })
        .addItem((i) => {
          i.setIcon('lucide-arrow-up')
            .setTitle(t('Move to top'))
            .onClick(() => boardModifiers.moveItemToTop(path));
        })
        .addItem((i) => {
          i.setIcon('lucide-arrow-down')
            .setTitle(t('Move to bottom'))
            .onClick(() => boardModifiers.moveItemToBottom(path));
        })
        .addItem((i) => {
          i.setIcon('lucide-archive')
            .setTitle(t('Archive card'))
            .onClick(() => boardModifiers.archiveItem(path));
        })
        .addItem((i) => {
          i.setIcon('lucide-trash-2')
            .setTitle(t('Delete card'))
            .onClick(() => boardModifiers.deleteEntity(path));
        })
        .addSeparator()
        .addItem((i) => {
          i.setIcon('lucide-calendar-check')
            .setTitle(hasDate ? t('Edit date') : t('Add date'))
            .onClick(() => {
              constructDatePicker(
                pickerWindow,
                stateManager,
                coordinates,
                constructMenuDatePickerOnChange({
                  stateManager,
                  boardModifiers,
                  item: card,
                  hasDate,
                  path,
                }),
                card.data.metadata.date?.toDate()
              );
            });
        });

      if (hasDate) {
        menu.addItem((i) => {
          i.setIcon('lucide-x')
            .setTitle(t('Remove date'))
            .onClick(() => {
              const shouldLinkDates = stateManager.getSetting('link-date-to-daily-note');
              const dateTrigger = stateManager.getSetting('date-trigger');
              const contentMatch = shouldLinkDates
                ? '(?:\\[[^\\]]+\\]\\([^\\)]+\\)|\\[\\[[^\\]]+\\]\\])'
                : '{[^}]+}';
              const dateRegEx = new RegExp(
                `(^|\\s)${escapeRegExpStr(dateTrigger)}${contentMatch}`
              );

              const titleRaw = card.data.titleRaw.replace(dateRegEx, '').trim();

              boardModifiers.updateItem(path, stateManager.updateItemContent(card, titleRaw));
            });
        });

        menu.addItem((i) => {
          i.setIcon('lucide-clock')
            .setTitle(hasTime ? t('Edit time') : t('Add time'))
            .onClick(() => {
              constructTimePicker(
                pickerWindow,
                stateManager,
                coordinates,
                constructMenuTimePickerOnChange({
                  stateManager,
                  boardModifiers,
                  item: card,
                  hasTime,
                  path,
                }),
                card.data.metadata.time
              );
            });
        });

        if (hasTime) {
          menu.addItem((i) => {
            i.setIcon('lucide-x')
              .setTitle(t('Remove time'))
              .onClick(() => {
                const timeTrigger = stateManager.getSetting('time-trigger');
                const timeRegEx = new RegExp(
                  `(^|\\s)${escapeRegExpStr(timeTrigger)}{([^}]+)}`
                );

                const titleRaw = card.data.titleRaw.replace(timeRegEx, '').trim();
                boardModifiers.updateItem(path, stateManager.updateItemContent(card, titleRaw));
              });
          });
        }
      }

      menu.addSeparator();

      const addMoveToOptions = (menu: Menu) => {
        const lanes = stateManager.state.children;
        if (lanes.length <= 1) return;
        lanes.forEach((lane, laneIndex) => {
          menu.addItem((menuItem) => {
            menuItem
              .setIcon('lucide-square-kanban')
              .setChecked(path[0] === laneIndex)
              .setTitle(lane.data.title)
              .onClick(() => {
                if (path[0] === laneIndex) return;
                stateManager.moveItemToLane(path, laneIndex);
              });
          });
        });
      };

      if (Platform.isPhone) {
        addMoveToOptions(menu);
      } else {
        menu.addItem((item) => {
          const submenu = (item as MenuItemWithSubmenu)
            .setTitle(t('Move to list'))
            .setIcon('lucide-square-kanban')
            .setSubmenu();

          addMoveToOptions(submenu);
        });
      }

      menu.showAtPosition(coordinates);
    },
    [setEditState, card, path, boardModifiers, stateManager]
  );
}
