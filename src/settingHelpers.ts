import { AbstractInputSuggest, App, Setting, TFile, TFolder, Vault } from 'obsidian';

import { KanbanSettings, SettingsManager } from './Settings';
import { getTemplatePlugins } from './components/helpers';
import { t } from './lang/helpers';

export const defaultDateTrigger = '@';
export const defaultTimeTrigger = '@@';
export const defaultMetadataPosition = 'body';

export interface ChoiceItem {
  value: string;
  label: string;
  placeholder?: boolean;
}

export function getFolderChoices(app: App) {
  const folderList: ChoiceItem[] = [];

  Vault.recurseChildren(app.vault.getRoot(), (f) => {
    if (f instanceof TFolder) {
      folderList.push({
        value: f.path,
        label: f.path,
      });
    }
  });

  return folderList;
}

export function getTemplateChoices(app: App, folderStr?: string) {
  const fileList: ChoiceItem[] = [];

  const folder = folderStr ? app.vault.getAbstractFileByPath(folderStr) : null;

  const searchRoot = folder instanceof TFolder ? folder : app.vault.getRoot();

  Vault.recurseChildren(searchRoot, (f) => {
    if (f instanceof TFile) {
      fileList.push({
        value: f.path,
        label: f.basename,
      });
    }
  });

  return fileList;
}

export function getListOptions(app: App) {
  const { templateFolder, templatesEnabled, templaterPlugin } = getTemplatePlugins(app);

  const templateFiles = getTemplateChoices(app, templateFolder);
  const vaultFolders = getFolderChoices(app);

  let templateWarning = '';

  if (!templatesEnabled && !templaterPlugin) {
    templateWarning = t('Note: No template plugins are currently enabled.');
  }

  return {
    templateFiles,
    vaultFolders,
    templateWarning,
  };
}

interface CreateSearchSelectParams {
  choices: ChoiceItem[];
  key: keyof KanbanSettings;
  warningText?: string;
  local: boolean;
  placeHolderStr: string;
  manager: SettingsManager;
}

/**
 * Obsidian 原生输入建议组件。
 *
 * 不再使用 choices.js:其内部依赖全局 document/requestAnimationFrame,
 * 在新版 Obsidian 的设置页中点击无法展开下拉列表;
 * AbstractInputSuggest 的事件绑定跟随元素作用域,无此问题。
 */
class ChoiceSuggest extends AbstractInputSuggest<ChoiceItem> {
  constructor(
    app: App,
    inputEl: HTMLInputElement,
    private items: ChoiceItem[],
    private onPick: (item: ChoiceItem) => void
  ) {
    super(app, inputEl);
  }

  protected getSuggestions(query: string): ChoiceItem[] {
    const q = query.trim().toLowerCase();

    if (!q) {
      return this.items.slice(0, this.limit);
    }

    return this.items
      .filter(
        (item) => item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q)
      )
      .slice(0, this.limit);
  }

  renderSuggestion(item: ChoiceItem, el: HTMLElement): void {
    el.setText(item.label);
  }

  selectSuggestion(item: ChoiceItem, evt: MouseEvent | KeyboardEvent): void {
    this.onPick(item);
    this.close();
  }
}

export function createSearchSelect({
  choices,
  key,
  warningText,
  local,
  placeHolderStr,
  manager,
}: CreateSearchSelectParams) {
  return (setting: Setting) => {
    const inputEl = setting.controlEl.createEl('input', { type: 'text' });
    inputEl.setCssStyles({ width: '100%' });

    const [value, globalValue] = manager.getSetting(key, local);

    const current = value && typeof value === 'string' ? value : '';
    if (current) {
      inputEl.value = current;
    }

    const globalChoice =
      globalValue && typeof globalValue === 'string'
        ? choices.find((c) => c.value === globalValue)
        : undefined;

    inputEl.placeholder = globalChoice
      ? `${globalChoice.label} (${t('default')})`
      : placeHolderStr;

    const commit = (val: string | null) => {
      if (val) {
        manager.applySettingsUpdate({
          [key]: {
            $set: val,
          },
        });
      } else {
        manager.applySettingsUpdate({
          $unset: [key],
        });
      }
    };

    const suggest = new ChoiceSuggest(manager.app, inputEl, choices, (item) => {
      if (item.placeholder) {
        inputEl.value = '';
        commit(null);
        return;
      }

      inputEl.value = item.value;
      commit(item.value);
    });

    const openSuggest = () => {
      suggest.open();
    };
    inputEl.addEventListener('focus', openSuggest);

    // 失焦/回车时校验:空值 = 清除设置(回退到默认);非法输入 = 回退到原值
    const onValidate = () => {
      const val = inputEl.value.trim();

      if (!val) {
        inputEl.value = '';
        commit(null);
        return;
      }

      if (choices.some((c) => c.value === val)) {
        commit(val);
        return;
      }

      inputEl.value = current;
    };
    inputEl.addEventListener('change', onValidate);

    manager.cleanupFns.push(() => {
      inputEl.removeEventListener('focus', openSuggest);
      inputEl.removeEventListener('change', onValidate);
      suggest.close();
    });

    if (warningText) {
      setting.descEl.createDiv({}, (div) => {
        div.createEl('strong', { text: warningText });
      });
    }
  };
}
