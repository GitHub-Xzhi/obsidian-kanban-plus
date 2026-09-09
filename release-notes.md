## 📝 更新日志 / Changelog

### 2026-09-10

#### ✨ 新功能

- 新增「流转回退」功能：卡片可流转到下一列或回退上一列，支持卡片级流转历史与流转时间显示。
- 新增「看板模板」设置：新建看板时使用指定笔记的内容初始化列与卡片。

#### 🐛 修复

- 卡片块 ID（`^id`）改为附加在卡片内容末行：修复多行卡片在上方编辑插入内容后，块 ID 上移、文件中出现重复 ID 的问题。
- 语言切换实时刷新已打开看板

---

#### ✨ Features

- New "Flow/back" feature: flow a card to the next list or revert it back to the previous list, with per-card flow history and flow time display.
- New "Board template" setting: new Kanban boards are initialized with the columns and cards from the selected note.

#### 🐛 Fixes

- Card block IDs (`^id`) are now appended to the last line of the card content: fixes block IDs moving upward and duplicated IDs appearing in the file after inserting content above multi-line cards.
- Switching the plugin language now live-updates already-open Kanban boards.
