import ar from './locale/ar';
import cz from './locale/cz';
import da from './locale/da';
import de from './locale/de';
import en, { Lang } from './locale/en';
import es from './locale/es';
import fr from './locale/fr';
import hi from './locale/hi';
import id from './locale/id';
import it from './locale/it';
import ja from './locale/ja';
import ko from './locale/ko';
import nl from './locale/nl';
import no from './locale/no';
import pl from './locale/pl';
import pt from './locale/pt';
import ptBR from './locale/pt-br';
import ro from './locale/ro';
import ru from './locale/ru';
import sq from './locale/sq';
import tr from './locale/tr';
import uk from './locale/tr';
import zhCN from './locale/zh-cn';
import zhTW from './locale/zh-tw';
import { moment } from 'obsidian';

export type KanbanLanguage = 'auto' | 'en' | 'zh';

const kanbanLanguageKey = 'kanban-language';

const localeMap: { [k: string]: Partial<Lang> } = {
  ar,
  cz,
  da,
  de,
  en,
  es,
  fr,
  hi,
  id,
  it,
  ja,
  ko,
  nl,
  no,
  pl,
  'pt-BR': ptBR,
  pt,
  ro,
  ru,
  sq,
  tr,
  uk,
  'zh-CN': zhCN,
  'zh-cn': zhCN,
  'zh-TW': zhTW,
  zh: zhCN,
};

function normalizeLanguage(lang: string | null): KanbanLanguage | null {
  if (!lang) return null;
  if (lang.toLowerCase().startsWith('zh')) return 'zh';
  if (lang.toLowerCase().startsWith('en')) return 'en';

  return null;
}

export function getKanbanLanguage(): KanbanLanguage {
  return (
    normalizeLanguage(window.localStorage.getItem(kanbanLanguageKey)) ||
    normalizeLanguage(moment.locale()) ||
    'en'
  );
}

export function setKanbanLanguage(lang?: KanbanLanguage) {
  if (lang && lang !== 'auto') {
    window.localStorage.setItem(kanbanLanguageKey, lang);
  } else {
    window.localStorage.removeItem(kanbanLanguageKey);
  }
}

export function t(str: keyof typeof en): string {
  const lang = getKanbanLanguage();
  const locale = localeMap[lang || 'en'];

  if (!locale) {
    console.error('Error: kanban locale not found', lang);
  }

  return (locale && locale[str]) || en[str];
}
