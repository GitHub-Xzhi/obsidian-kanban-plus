// 简体中文
import { Lang } from './en';

const lang: Partial<Lang> = {
  // main.ts
  'Open as kanban board': '打开为看板',
  'Create new board': '创建新看板',
  'Archive completed cards in active board': '在当前看板中归档已完成卡片',
  'Error: current file is not a Kanban board': '错误：当前文件不是看板文件',
  'Convert empty note to Kanban': '转换空白笔记为看板',
  'Error: cannot create Kanban, the current note is not empty':
    '错误：无法转换当前文件，当前笔记不是空白笔记',
  'New kanban board': '新看板',
  'Untitled Kanban': '未命名看板',
  'Toggle between Kanban and markdown mode': '在看板和 Markdown 模式之间进行切换',

  'View as board': '看板视图',
  'View as list': '列表视图',
  'View as table': '表格视图',
  'Board view': '看板视图',

  // KanbanView.tsx
  'Open as markdown': '打开为 Markdown 文件',
  'Open board settings': '打开看板设置',
  'Archive completed cards': '归档已完成卡片',
  'Show archived cards': '显示/隐藏已归档卡片',
  'Something went wrong': '出了点问题',
  'You may wish to open as markdown and inspect or edit the file.':
    '你可能希望以 Markdown 方式打开，并检查或编辑该文件。',
  'Are you sure you want to archive all completed cards on this board?':
    '你确定要将这个板块上所有已完成的卡片归档吗？',

  // parser.ts
  Complete: '完成',
  Archive: '归档',
  'Invalid Kanban file: problems parsing frontmatter':
    '无效的看板文件：解析 frontmatter 时出现问题',
  "I don't know how to interpret this line:": '我不知道如何解读这句话：',
  Untitled: '未命名', // auto-created column

  // settingHelpers.ts
  'Note: No template plugins are currently enabled.': '注意：当前没有启用模板插件',
  default: '默认',
  'Search...': '搜索……',

  // Settings.ts
  'New line trigger': '换行触发器',
  'Select whether Enter or Shift+Enter creates a new line. The opposite of what you choose will create and complete editing of cards and lists.':
    '选择 Enter 或是 Shift+Enter 来创建新行, 未选用的快捷键将被用于创建卡片和列，以及完成卡片、列的编辑。',
  'Shift + Enter': 'Shift + Enter',
  Enter: 'Enter',
  'Prepend / append new cards': '追加新卡片',
  'This setting controls whether new cards are added to the beginning or end of the list.':
    '设置新卡片追加到列头部或尾部。',
  'Completed card placement': '完成卡片放置位置',
  'This setting controls where cards are moved after their checkbox is completed.':
    '设置点击完成复选框后，卡片移动到完成列的头部或尾部。',
  Prepend: '头部',
  'Prepend (compact)': '头部 (紧凑)',
  Append: '尾部',
  'These settings will take precedence over the default Kanban board settings.':
    '当前看板设置将会覆盖默认的看板设置。',
  'Set the default Kanban board settings. Settings can be overridden on a board-by-board basis.':
    '更改默认的看板设置。为每个看板单独进行设置将覆盖默认设置。',
  Language: '语言',
  'Select the Kanban plugin language.': '选择看板插件语言。',
  'Note template': '笔记模板',
  'This template will be used when creating new notes from Kanban cards.':
    '从看板卡片创建新笔记时会使用该模板。',
  'No template': '没有模板',
  'Note folder': '笔记存放位置',
  'Notes created from Kanban cards will be placed in this folder. If blank, they will be placed in the default location for this vault.':
    '从看板卡片创建的笔记会放置到该文件夹中。如果为空，笔记将会放置到 Obsidian 的默认文件存放位置。',
  'Default folder': '默认文件夹',
  'List width': '列宽',
  'Expand lists to full width in list view': '在列表视图中将列扩展为全宽',
  'Enter a number to set the list width in pixels.': '输入一个像素值来设置列的宽度',
  'Maximum number of archived cards': '单个看板内已归档卡片的最大数量',
  "Archived cards can be viewed in markdown mode. This setting will begin removing old cards once the limit is reached. Setting this value to -1 will allow a board's archive to grow infinitely.":
    '已归档卡片可以在 Markdown 模式下查看。该设置将使已归档卡片在达到最大数量时删除旧卡。设置为 -1 可以永久保留所有归档卡片。',
  'Display card checkbox': '展示卡片复选框',
  'When toggled, a checkbox will be displayed with each card': '打开时，复选框会出现在每张卡片上',
  'Reset to default': '还原初始设置',
  'Date & Time': '日期和时间',
  'Date trigger': '日期触发指令',
  'When this is typed, it will trigger the date selector':
    '当在看板卡片中输入这个时，会触发一个日期选择器',
  'Time trigger': '时间触发指令',
  'When this is typed, it will trigger the time selector':
    '当在看板卡片中输入这个时，会触发一个时间选择器',
  'Date format': '日期格式',
  'This format will be used when saving dates in markdown.':
    '这个格式会在日期保存到 Markdown 格式时使用。',
  'For more syntax, refer to': '更多格式，请查看',
  'format reference': '格式参考',
  'Your current syntax looks like this': '你当前设置的格式会是',
  'Time format': '时间格式',
  'Date display format': '日期展示格式',
  'This format will be used when displaying dates in Kanban cards.': '看板卡片会以该格式展示日期。',
  'Show relative date': '展示相对日期',
  "When toggled, cards will display the distance between today and the card's date. eg. 'In 3 days', 'A month ago'. Relative dates will not be shown for dates from the Tasks and Dataview plugins.":
    '打开时，卡片会显示今天与卡片日期之间的距离，例如“3 天后”、“1 个月前”。来自 Tasks 和 Dataview 插件的日期不会显示相对日期。',

  'Move dates to card footer': '将日期移动到卡片页脚',
  "When toggled, dates will be displayed in the card's footer instead of the card's body.":
    '打开时，日期会显示在卡片页脚，而不是卡片正文中。',
  'Move tags to card footer': '将标签移动到卡片页脚',
  "When toggled, tags will be displayed in the card's footer instead of the card's body.":
    '打开时，标签会显示在卡片页脚，而不是卡片正文中。',
  'Move task data to card footer': '将任务数据移动到卡片页脚',
  "When toggled, task data (from the Tasks plugin) will be displayed in the card's footer instead of the card's body.":
    '打开时，来自 Tasks 插件的任务数据会显示在卡片页脚，而不是卡片正文中。',
  Tags: '标签',
  'Inline metadata position': '内联元数据位置',
  'Controls where the inline metadata (from the Dataview plugin) will be displayed.':
    '控制来自 Dataview 插件的内联元数据显示位置。',
  'Card body': '卡片正文',
  'Card footer': '卡片页脚',
  'Merge with linked page metadata': '合并到链接页面元数据',

  'Hide card counts in list titles': '在列标题上隐藏卡片计数',
  'When toggled, card counts are hidden from the list title': '打开时，列标题上的卡片计数将隐藏',
  'Link dates to daily notes': '链接日期到日记',
  'When toggled, dates will link to daily notes. Eg. [[2021-04-26]]':
    '打开时，日期会自动链接到日记页面，例如[[2021-04-26]]',
  'Add date and time to archived cards': '添加日期和时间到归档卡片',
  'When toggled, the current date and time will be added to the card title when it is archived. Eg. - [ ] 2021-05-14 10:00am My card title':
    '打开时，当前日期和时间会被添加到归档卡片的 frontmatter 上，例如“- [ ] 2021-05-14 10:00am 我的卡片标题”',
  'Add archive date/time after card title': '将归档日期/时间添加到卡片标题后',
  'When toggled, the archived date/time will be added after the card title, e.g.- [ ] My card title 2021-05-14 10:00am. By default, it is inserted before the title.':
    '打开时，归档日期/时间会添加到卡片标题后，例如“- [ ] 我的卡片标题 2021-05-14 10:00am”。默认会插入到标题前。',
  'Archive date/time separator': '归档日期/时间分隔符',
  'This will be used to separate the archived date/time from the title':
    '用于分隔标题与归档卡片的日期或时间',
  'Archive date/time format': '归档日期或时间格式',
  'Kanban Plugin': '看板插件',
  'Tag click action': '标签点击动作',
  'Search Kanban Board': '搜索看板',
  'Search Obsidian Vault': '搜索 Obsidian 库',
  'This setting controls whether clicking the tags displayed below the card title opens the Obsidian search or the Kanban board search.':
    '此设置控制点击卡片标题下方标签时，打开 Obsidian 搜索还是看板搜索。',
  'Tag colors': '标签颜色',
  'Set colors for tags displayed in cards.': '设置卡片中显示标签的颜色。',
  'Linked Page Metadata': '连接的页面元数据',
  'Inline Metadata': '内联元数据',
  'Display metadata for the first note linked within a card. Specify which metadata keys to display below. An optional label can be provided, and labels can be hidden altogether.':
    '展示卡片中第一个连接所对应的笔记元数据。请在下方指定哪些元数据可以展示。你可以选择展示哪些标志，所有标志都可以被隐藏。',
  'Board Header Buttons': '板头按钮',
  'Calendar: first day of week': '日历：一周的第一天',
  'Override which day is used as the start of the week': '设置哪一天作为一周的开始',
  Sunday: '周日',
  Monday: '周一',
  Tuesday: '周二',
  Wednesday: '周三',
  Thursday: '周四',
  Friday: '周五',
  Saturday: '周六',
  'Background color': '背景颜色',
  Tag: '标签',
  'Text color': '文字颜色',
  'Date is': '日期为',
  Today: '今天',
  'After now': '晚于现在',
  'Before now': '早于现在',
  'Between now and': '从现在到',
  'Display date colors': '显示日期颜色',
  'Set colors for dates displayed in cards based on the rules below.':
    '根据下面的规则设置卡片中显示日期的颜色。',
  'Add date color': '添加日期颜色',

  // MetadataSettings.tsx
  'Metadata key': '元数据参数名',
  'Display label': '展示标志',
  'Hide label': '隐藏标志',
  'Drag to rearrange': '拖动以重排顺序',
  Delete: '删除',
  'Add key': '添加参数名',
  'Add tag': '添加标签',
  'Field contains markdown': '字段包含 Markdown',
  'Tag sort order': '标签排序顺序',
  'Set an explicit sort order for the specified tags.': '为指定标签设置明确的排序顺序。',

  // TagColorSettings.tsx
  'Add tag color': '添加标签颜色',

  // components/Table.tsx
  List: '列表',
  Card: '卡片',
  Date: '日期',

  Priority: '优先级',
  Start: '开始',
  Created: '创建时间',
  Scheduled: '计划时间',
  Due: '截止时间',
  Cancelled: '已取消',
  Recurrence: '重复',
  'Depends on': '依赖于',
  ID: 'ID',

  // components/Item/Item.tsx
  'More options': '更多选项',
  Cancel: '取消',
  Done: '完成',
  Save: '保存',

  // components/Item/ItemContent.tsx
  today: '今天',
  yesterday: '昨天',
  tomorrow: '明天',
  'Change date': '更改日期',
  'Change time': '更改时间',

  // components/Item/ItemForm.tsx
  'Card title...': '卡片标题……',
  'Add card': '添加',
  'Add a card': '添加卡片',

  // components/Item/ItemMenu.ts
  'Edit card': '编辑卡片',
  'New note from card': '从卡片新建笔记',
  'Archive card': '归档卡片',
  'Delete card': '删除卡片',
  'Edit date': '编辑日期',
  'Add date': '添加日期',
  'Remove date': '移除日期',
  'Edit time': '编辑时间',
  'Add time': '添加时间',
  'Remove time': '移除时间',
  'Duplicate card': '复制卡片',
  'Split card': '分离卡片',
  'Copy link to card': '复制链接至卡片',
  'Insert card before': '在上方插入卡片',
  'Insert card after': '在下方插入卡片',
  'Add label': '添加标签',
  'Move to top': '移到顶部',
  'Move to bottom': '移至底部',
  'Move to list': '移动到列',

  // components/Lane/LaneForm.tsx
  'Enter list title...': '输入新的列标题……',
  'Mark cards in this list as complete': '将该列设置为完成列',
  'Add list': '添加',
  'Add a list': '添加列',
  'Default complete list': '默认完成列',
  'Cards completed by checkbox will be moved to this list.': '点击复选框完成的卡片会移动到这个列。',
  Select: '选择',

  // components/Lane/LaneHeader.tsx
  'Move list': '移动列',
  Close: '关闭',

  // components/Lane/LaneMenu.tsx
  'Are you sure you want to delete this list and all its cards?':
    '你确定你要删除整列以及该列下所有卡片吗？',
  'Yes, delete list': '是，删除列',
  'Are you sure you want to archive this list and all its cards?':
    '你确定你要归档整列以及该列下所有卡片吗？',
  'Yes, archive list': '是, 归档列',
  'Are you sure you want to archive all cards in this list?': '你确认你要归档当前列的所有卡片吗？',
  'Yes, archive cards': '是，归档所有卡片',
  'Edit list': '编辑列',
  'Archive cards': '归档卡片',
  'Change default complete list': '修改默认完成列',
  'Only incomplete lists can set a default complete list': '只有非完成列可以设置默认完成列',
  'Archive list': '归档列',
  'Delete list': '删除列',
  'Insert list before': '在上方插入列',
  'Insert list after': '在下方插入列',
  'Sort by card text': '以卡片文本排序',
  'Sort by date': '以日期排序',
  'Sort by tags': '以标签排序',
  'Sort by': '排序方式',

  // components/helpers/renderMarkdown.ts
  'Unable to find': '无法找到',
  'Open in default app': '在默认应用中打开',

  // components/Editor/MarkdownEditor.tsx
  Submit: '提交',
};

export default lang;
