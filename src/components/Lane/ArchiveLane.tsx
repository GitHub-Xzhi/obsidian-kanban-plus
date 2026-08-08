import classcat from 'classcat';
import { memo } from 'preact/compat';
import { t } from 'src/lang/helpers';

import { MarkdownRenderer } from '../MarkdownRenderer/MarkdownRenderer';
import { c } from '../helpers';
import { Item } from '../types';

interface ArchiveLaneProps {
  items: Item[];
  collapseDir: 'horizontal' | 'vertical';
}

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
          {items.map((item) => (
            <div key={item.id} className={classcat([c('item-wrapper'), c('archive-item')])}>
              <div className={c('item')}>
                <div className={c('item-content-wrapper')}>
                  <div className={c('item-title-wrapper')}>
                    <MarkdownRenderer markdownString={item.data.title} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
