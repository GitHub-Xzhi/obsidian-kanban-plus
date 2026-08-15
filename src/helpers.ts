import { App, TFile, moment } from 'obsidian';
import { getDailyNoteSettings, getDateFromFile } from 'obsidian-daily-notes-interface';

import { frontmatterKey } from './parsers/common';

interface DailyNotePlugin {
  gotoNextExisting: (date: ReturnType<typeof moment>) => void;
  gotoPreviousExisting: (date: ReturnType<typeof moment>) => void;
}

type VaultWithConfig = App['vault'] & {
  getConfig: (key: string) => unknown;
};

type AppWithInternalPlugins = App & {
  internalPlugins: {
    plugins: {
      'daily-notes': {
        instance: DailyNotePlugin;
      };
    };
  };
};

export function gotoNextDailyNote(app: App, file: TFile) {
  const date = getDateFromFile(file, 'day');

  if (!date || !date.isValid()) {
    return;
  }

  const dailyNotePlugin = (app as AppWithInternalPlugins).internalPlugins.plugins['daily-notes'].instance;

  dailyNotePlugin.gotoNextExisting(date);
}

export function gotoPrevDailyNote(app: App, file: TFile) {
  const date = getDateFromFile(file, 'day');

  if (!date || !date.isValid()) {
    return;
  }

  const dailyNotePlugin = (app as AppWithInternalPlugins).internalPlugins.plugins['daily-notes'].instance;

  dailyNotePlugin.gotoPreviousExisting(date);
}

export function buildLinkToDailyNote(app: App, dateStr: string) {
  const dailyNoteSettings = getDailyNoteSettings();
  const shouldUseMarkdownLinks = !!(app.vault as VaultWithConfig).getConfig('useMarkdownLinks');

  if (shouldUseMarkdownLinks) {
    return `[${dateStr}](${
      dailyNoteSettings.folder ? `${encodeURIComponent(dailyNoteSettings.folder)}/` : ''
    }${encodeURIComponent(dateStr)}.md)`;
  }

  return `[[${dateStr}]]`;
}

export function hasFrontmatterKeyRaw(data: string) {
  if (!data) return false;

  const match = data.match(/---\s+([\w\W]+?)\s+---/);

  if (!match) {
    return false;
  }

  if (!match[1].contains(frontmatterKey)) {
    return false;
  }

  return true;
}

export function hasFrontmatterKey(app: App, file: TFile) {
  if (!file) return false;
  const cache = app.metadataCache.getFileCache(file);
  return !!cache?.frontmatter?.[frontmatterKey];
}

export function laneTitleWithMaxItems(title: string, maxItems?: number) {
  if (!maxItems) return title;
  return `${title} (${maxItems})`;
}
