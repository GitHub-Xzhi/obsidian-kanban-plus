import classcat from 'classcat';
import { Menu } from 'obsidian';
import { memo } from 'preact/compat';
import { useCallback, useContext } from 'preact/hooks';
import { t } from 'src/lang/helpers';

import { Icon } from '../Icon/Icon';
import { MarkdownRenderer } from '../MarkdownRenderer/MarkdownRenderer';
import { KanbanContext } from '../context';
import { c } from '../helpers';
import { Item } from '../types';

interface ArchiveLaneProps {
  items: Item[];
  collapseDir: 'horizontal' | 'vertical';
}

interface ArchiveItemProps {
  item: Item;
  archiveIndex: number;
}

const ArchiveItem = memo(function ArchiveItem({ item, archiveIndex }: ArchiveItemProps) {
  const { boardModifiers } = useContext(KanbanContext);

  const showMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();

      new Menu()
        .addItem((menuItem) => {
          menuItem
            .setIcon('lucide-undo-2')
            .setTitle(t('Unarchive card'))
            .onClick(() => boardModifiers.unarchiveItem(archiveIndex));
        })
        .showAtMouseEvent(e);
    },
    [archiveIndex, boardModifiers]
  );

  return (
    <div className={classcat([c('item-wrapper'), c('archive-item')])} onContextMenu={showMenu}>
      <div className={c('item')}>
        <div className={c('item-content-wrapper')}>
          <div className={c('item-title-wrapper')}>
            <MarkdownRenderer markdownString={item.data.title} />
            <div className={c('item-postfix-button-wrapper')}>
              <a
                data-ignore-drag={true}
                onPointerDown={(e) => e.preventDefault()}
                onClick={showMenu as any}
                className={`${c('item-postfix-button')} clickable-icon`}
                aria-label={t('More options')}
              >
                <Icon name="lucide-more-vertical" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export const ArchiveLane = memo(function ArchiveLane({ items, collapseDir }: ArchiveLaneProps) {
  return (
    <div
      className={classcat([
        c('lane-wrapper'),
        c('archive-lane-wrapper'),
        {
          [c('archive-lane-wrapper-vertical')]: collapseDir === 'vertical',
        },
      ])}
    >
      <div className={classcat([c('lane'), c('archive-lane')])}>
        <div className={c('lane-header-wrapper')}>
          <div className={c('lane-title')}>
            <div className={c('lane-title-text')}>{t('Archive')}</div>
          </div>
          <div className={c('lane-title-count')}>{items.length}</div>
        </div>
        <div className={classcat([c('lane-items'), c('vertical')])}>
          {items.map((item, archiveIndex) => (
            <ArchiveItem key={item.id} item={item} archiveIndex={archiveIndex} />
          ))}
        </div>
      </div>
    </div>
  );
});
