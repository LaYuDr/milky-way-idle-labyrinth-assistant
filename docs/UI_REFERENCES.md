# 界面设计参考

2026-11-08 查询；用于本地 0.5.0 界面整理，不引入这些设计系统的运行时依赖。

- [NN/G：Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)：常用操作直接可见，低频设置和详细数据按需展开。落实为推荐依据切换、主窗口设置和日志行动记录折叠。
- [Carbon：Data table guidelines](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines)：把表级操作集中在工具栏，保持结果列可扫描。落实为统一推荐区和右对齐的推荐等级、K/h。
- [Atlassian：Voice and tone](https://atlassian.design/foundations/content/voice-tone/)：用简明、准确、一致的词帮助用户完成任务。保留单位、错误恢复、失败原因与操作后果，删除重复解释和实施细节。

本插件沿用游戏内深色工具的使用环境，使用系统字体和标准控件。没有使用外部图片、字体或运行时样式依赖。颜色与组件规则由 `src/ui/theme.js` 统一提供，界面组织由 `src/calculator/presentation.js` 接入；计算核心不依赖这两个模块。

## 0.8.0：公会助手

用户指定公会助手为本次视觉依据。参考相邻项目 `../公会助手/src/ui/styles.js` 的建设与试炼区域，以及其本地浏览器夹具截图：深紫灰底板、深色字段、青绿操作和结果、紧凑工具栏与逐行数据。仅沿用视觉规则，不引入公会助手业务、存储键、发布地址或服务。最终组件和尺寸记录在 `DESIGN.md`。
