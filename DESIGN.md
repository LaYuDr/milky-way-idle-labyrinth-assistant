---
name: "迷宫助手"
description: "公会助手风格的游戏内工具：深紫灰底板、青绿操作、紧凑数据行。"
colors:
  surface: "#24273b"
  inset: "#191c2e"
  header: "#202139"
  raised: "#2c3047"
  hover: "#34394f"
  hover-active: "#454e68"
  line: "#41465f"
  field-line: "#626b86"
  text: "#edf0fa"
  muted: "#b7bfd4"
  accent: "#91dfcb"
  action: "#43c4ad"
  action-text: "#10201f"
  action-hover: "#75dbc6"
  good: "#91dfcb"
  warn: "#e9c487"
  danger: "#ffa7b5"
  selection: "#34685e"
  selection-text: "#fff"
  selected-bg: "#2d4947"
  selected-line: "#527d73"
  notice-bg: "#3a3340"
  close-hover-bg: "#56323b"
  close-hover-text: "#ffdce2"
  close-hover-line: "#74414b"
  route: "#91d8e4"
  route-treasure: "#efc778"
  route-force: "#ffad66"
  route-label-bg: "#161722"
typography:
  title:
    fontFamily: 'system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.45
  window-title:
    fontSize: "14px"
    fontWeight: 650
    lineHeight: 1.45
  body:
    fontFamily: 'system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "13px"
    lineHeight: 1.45
  compact:
    fontSize: "12px"
    lineHeight: 1.45
  label:
    fontSize: "11px"
    lineHeight: 1.45
  result:
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.45
  recommendation:
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.45
  button:
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
  button-primary:
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.4
rounded:
  bar: "2px"
  control: "4px"
  window: "6px"
spacing:
  small: "6px"
  compact: "8px"
  control: "10px"
  section: "12px"
  section-wide: "14px"
  column: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-text}"
    typography: "{typography.button-primary}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-primary-active:
    backgroundColor: "{colors.accent}"
  button-secondary:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
  button-secondary-hover:
    backgroundColor: "{colors.hover-active}"
  button-secondary-active:
    backgroundColor: "{colors.inset}"
  field:
    backgroundColor: "{colors.inset}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "5px 8px"
    height: "34px"
  planner:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.window}"
    padding: "0"
    width: "280px"
  preview:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.compact}"
    rounded: "{rounded.window}"
    padding: "0 12px 10px"
    width: "310px"
  floating-window:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.compact}"
    rounded: "{rounded.window}"
    padding: "0"
    width: "380px"
  distribution-toggle:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "6px"
  distribution-toggle-selected:
    backgroundColor: "{colors.selected-bg}"
    textColor: "{colors.accent}"
  close-hover:
    backgroundColor: "{colors.close-hover-bg}"
    textColor: "{colors.close-hover-text}"
  notice:
    backgroundColor: "{colors.notice-bg}"
    textColor: "{colors.warn}"
    rounded: "{rounded.control}"
    padding: "8px"
---

# Design System: 迷宫助手

## Overview

**Creative North Star: "游戏地图旁的紧凑工具"**

沿用公会助手建设与试炼界面的视觉语言：深紫灰底板、深色字段、青绿操作和重点数值。地图旁的紧凑工具用标题栏、分区标题和细线组织信息，路线、计算和推荐保留各自入口。

本文件记录本地 0.8.0 已实现的界面。最终主题来自 `src/ui/theme.js`，结构和状态结合 `src/ui/planner-view.js`、`src/calculator/presentation.js`；主题安装在基础样式之后，已覆盖的旧颜色和尺寸不再作为当前规则。静态组件和离线截图仅展示外观，不代表真实游戏验收。

**Key Characteristics:**

- 深紫灰窗口与标题栏分层，青绿强调操作和结果。
- 紧凑字段、对齐的数据行、等宽数字，优先让结果可比较。
- 沿用原生交互与游戏图标，保留原因、单位和详情入口。

## Colors

### Primary

`accent` 是推荐等级、预览重点值和键盘焦点的浅青绿；`action` 与深色 `action-text` 组成主按钮，悬停使用 `action-hover`，按下使用 `accent`。输入光标使用 `accent`，复选框使用 `action`。

### Neutral

`surface` 是窗口底面，`header` 是独立标题栏，`raised` 用于主窗口标题悬停；`inset` 是字段和图表轨道，`hover` 与 `hover-active` 是次要按钮默认及悬停底色。`line` 划分内容，`field-line` 提高输入边界的辨识度，同时用于悬停按钮边框和滚动条。正文为 `text`，标签、时间和辅助数据为 `muted`。

### States and map colors

`good` 表示成功或达标，`warn` 表示需要注意及双倍结果，`danger` 表示失败或无效输入；未知结果用 `muted`。状态同时保留文字。分布复选项选中时使用 `selected-bg`、`selected-line` 和 `accent`。档案提示使用 `notice-bg` 与 `warn`。关闭按钮悬停使用 `close-hover-bg`、`close-hover-text`、`close-hover-line`；它是关闭反馈，不把关闭操作解释为删除。文本选择使用 `selection` 和 `selection-text`。

地图路线独立使用 `route`、`route-treasure`、`route-force` 和 `route-label-bg`。探照灯最佳位置使用金色小圆点，选中位置和两盏中心只在空位显示标签。胜率条保留原有五档半透明底色和文字阴影，不从窗口颜色推导。sidecar 中的八阶色板只用于预览，不是新增运行时状态。

**The Theme Boundary Rule.** 窗口使用最终主题；地图标记、胜率条和原生编辑控件遵守各自已有规则。

## Typography

系统字体栈与主字号见前置 token。主窗口和推荐区正文使用 `body`，主标题使用 `title`，浮窗标题使用 `window-title`；只读预览标题为同尺寸的 700 字重。分区标题为 13px、650 字重，经验目标标题为 13px、600 字重。没有展示型大标题或外部字体。

预览和日志正文为 `compact`，辅助时间和进度为 `label`。可填写的推荐等级使用 `recommendation`，预览强调值为 16px、600 字重。常规按钮使用 `button`，主按钮使用 `button-primary`。数字使用 `font-variant-numeric: tabular-nums`，不另换等宽字体。日志正文与档案提示行高为 1.5，字段行高为 1.4。

## Layout

主窗口展开时标称 280px，固定在地图旁；地图左侧可用空间小于 272px 时移至底部，距底部 16px。窗口保持至少 8px 横向边距，宽度不超过 `calc(100vw - 16px)`；收起后随标题内容取宽。视口不宽于 700px 时默认收起。标题栏内边距 11px 12px、最小高度 44px；内容内边距 12px。内容可滚动，高度上限为 `min(70vh, calc(100dvh - 80px))`，窄屏改为 `min(58vh, calc(100dvh - 80px))`。

主窗口先路线、后计算，分区由细线隔开。路线常态显示标题、“自动显示路线”开关、快速通过层数输入和全宽本层显示按钮；层数输入宽 72px，说明文字使用 11px 次要颜色，输入无效或保存失败时显示错误文案。不显示剩余格数、下一格、已揭示数量或“虚线待探索”，必要的道具、无路和错误提示按情况出现，不显示宝箱坐标提示。主计算按钮全宽；日志和分布并排；设置为原生 `details`。设置字段宽 78px，复选框为 16px。内容节奏主要使用 8px、10px、12px，计算分区上方间距 14px。

推荐区随宿主容器取宽，上限 920px。推荐区、标题、经验目标区和数字输入框使用透明背景，透出游戏背景；去除外框，分区用细线，操作按钮保留主题颜色。标题 14px，数字输入 12px、高 28px；预算和胜率/耗时字段宽 64px，经验字段宽 68px，右对齐。条件标签与输入、按钮同行，技能图标 20px，行内间隔 6px、上下内边距 3px。宿主宽度不超过 560px 时胜率和耗时分两行；至少 360px 时十项经验目标排成两列五行，低于 360px 时单列并将顶栏操作换到整行。

生活、强化与战斗详情统一为 320px，其他奖励预览宽度见 `preview`，日志和分布宽度见 `floating-window`；最大宽度均为 `calc(100vw - 24px)`。浮窗最大高度为 `min(75vh, calc(100dvh - 24px))`，只有外层滚动，标题和关闭按钮保持可见。浮窗内容内边距为 10px 12px。分布图行是 78px 标签、弹性条形和 52px 数值三列，最小高度 24px；条形高 8px，步长字段宽 64px。

原生表格继续承载游戏数据；单元格内边距为上下 6px、左右 4px。房间名称至少占 7rem，保持完整单行；配装下拉框宽 5.5rem，计算结果列宽 4rem。编辑区维持固定占位：四列宽度为 1.625rem、1.625rem、2.5rem、2.75rem，总宽 9.0625rem，列间距 .1875rem，数字输入左右内边距 2px；保留加减按钮，隐藏数字输入框内重复的微调箭头。切换编辑不挤动房间名称和按钮，窄屏或额外计算列超出宿主时沿用原生表格容器横向滚动。

## Elevation & Depth

窗口、预览、浮窗和工具按钮使用实色底面与细边框，无阴影；标题栏的色阶差建立层次。浮动层级由定位处理。地图胜率条的既有文字阴影属于独立覆盖层，不作为窗口阴影规则。

**The Flat Window Rule.** 窗口依靠标题栏、底色和细线区分层次，不新增光晕或装饰阴影。

## Shapes

控件采用 `control` 圆角，窗口采用 `window` 圆角，进度与分布条采用 `bar` 圆角。字段和容器通常使用 1px 边框，主按钮边框透明；标题栏仅顶部两角沿用窗体圆角。日志条目采用分隔线，不使用独立小卡片。

## Components

### Buttons

主按钮用于计算迷宫和按胜率、耗时、经验推荐；推荐区顶栏计算沿用次要按钮外观。常规按钮最小高度 32px，主计算按钮为 36px，推荐区按钮高至少 28px，推荐按钮最小宽度 96px。浮窗按钮内边距 5px 8px，关闭按钮为 32px 宽、18px 字号。

次要按钮悬停改变底色和边框，按下回到字段底色；主按钮分别使用专属悬停和按下色。键盘焦点是 2px 青绿轮廓，偏移 2px。按钮、字段和选择框禁用时透明度为 .55；主窗口及推荐区按钮使用等待指针，其余禁用控件为默认指针。计算中的按钮保留“计算中”文字。背景色与边框色过渡为 .15s ease；请求减少动态效果时取消过渡。

### Inputs / Fields

深色内嵌字段使用 `field` 尺寸和 `field-line` 边框；标签在字段上方或设置行左侧，单位随标签保留。无效值边框为 `danger`；占位文字为 `muted`，不额外降低透明度。选择框、复选框保留原生交互。当前没有独立输入悬停色。

### Containers and details

标题栏、分区和数据行构成窗口，没有独立导航或标签芯片。主窗口标题按钮控制展开与收起，并同步可访问状态和折线箭头方向。设置默认收起，展开后保留预算、重开设置及统计开关入口；推荐区全部平铺。

分布入口是带复选框的标签，选中状态使用独立底色与边框。档案提示只在有信息时出现。推荐状态区在计算中或有需告知的内容时显示；普通待计算和完成状态不额外占行。主窗口进度轨道高 4px，停止计算后隐藏；异常文字仍可保留。隐藏元素不占布局空间。

### Preview and results

只读预览完整展示原有属性、收益和奖励，不折叠数据。生活与强化详情宽度随内容收紧，战斗详情也随内容收紧宽度，按当前结果、目标、行动参数、升级收益、奖励分组；未知字段仍保留。胜率和每小时经验并排展示，标签与数值同行，强调值 16px；普通行 12px、标签左值右，升级表列头 10px，四列依次为提升项目、门槛 / 花费、通关胜率、相对当前胜率的百分点变化；门槛和花费字号 11px、右对齐，效率与速度显示所需百分比，两项专业升级显示迷宫代币数量。未达经验目标时增加最右侧“升级后经验 / 小时”列，详情随新增列按需加宽（仍受视口宽度限制），数值使用 K/h，高于目标时青绿色；各列按内容共享宽度，表头、标签、数值和单位保持单行，极窄时表内横向滚动。分区以细线分隔，不为每项套卡片。360px 以下行动参数和目标改为单列。标题内边距 6px 10px，分区上下 4px，数据行上下 1px；正文保持 12px。

所有预览最大高度为视口减 16px；超高时启用鼠标与键盘滚动，标题保持可见，移出延迟 160ms 关闭以便跨过房间与预览间距。只有超高预览接收指针事件，不放游戏操作控件。

战斗详情按通关结果、战斗属性、技能、奖励与说明分组，技能等级与名称相邻；保留失败原因、模拟口径和原有操作说明，长名称换行。生活工作能力仅显示实际生效整数。

可填写的推荐数值突出显示；无数值的状态文本允许换行。推荐等级列不附加经验效率，房间预览继续显示 K/h。

### Logs and distribution

日志条目上下内边距 12px，条目之间只有细线；概要允许换行，时间与辅助信息弱化。成功、失败、双倍、未知分别使用语义颜色；双倍不再用渐变文字。详情以原生 `details` 展开，入口为青绿。关闭按钮保持在浮窗标题栏内。

分布条使用深色轨道和青绿填充；空数据和异常沿用文字提示，不能伪造柱形或结果。浮窗可拖动，长内容只在窗体内滚动。

### Map overlays

主路线以编号和线条提示顺序：已知可走格为实线，待探索格为虚线，宝箱分支显示“宝”，需要道具的路线用橙色双线。地图标记不接收指针事件。探照灯选点工具只在原生道具预览期间出现。原地图使用 4px 金色圆点与最多 25×12px 的选中标签，逐格避让原生等级、图标、胜率、队列和路线；无空位时不绘制。全图收益放在面板内迷你地图，网格单元最小 22px，超宽只在自身滚动。金边表示最佳，绿色表示当前选中的新增范围；无需辨色也能读取格数和位置。

探照灯面板沿用现有窗口，不新增弹窗。标题与灯型/余量同行，当前位置收益为 16px 青绿数值，最佳和差值为紧凑文字。范围构成与候选比较、两盏规划默认折叠；本地查看控件不会执行游戏操作。窄屏优先使用地图上方或下方至少 140px 的空白区，内容内部滚动，原地图保持原位置。

房间胜率条沿用参考插件 1.6.0 的独立规则：胜率 9px/700、耗时 8px/600，右下各距 1px，间距 2px、内边距 1px 3px；保持五档底色，窗口主题不覆盖。

## Do's and Don'ts

### Do:

- **Do** 沿用当前主题的颜色、圆角和系统字体，并保留键盘焦点。
- **Do** 在推荐区依据容器宽度切换列数，让窄侧栏也能正常使用。
- **Do** 让长标题、状态和非数值推荐换行，保留单位与异常原因。
- **Do** 将经验目标和结果统一显示为 K/h。

### Don't:

- **Don't** 把旧基础样式中已覆盖的配色、阴影或圆角带回窗口。
- **Don't** 为每条结果再套一层卡片，或为现有工具新增导航。
- **Don't** 在不接收点击的悬浮预览里放交互控件。
- **Don't** 将窗口主题套在原生地图标记和胜率条上，或把模拟截图当作游戏验收。

详情浮窗单独使用深灰蓝底（#222638）、较深标题底（#1c2030）、浅色数值（#e8edf7）和灰蓝标签（#acb6ca）。通关胜率沿用地图五档阈值，颜色依次为柔和红、橙、黄、绿、青绿；经验是否高于目标决定暖黄或青绿，不用统一强调色暗示结果良好。升级表头用较深背景连接列名，普通数值保持中性，正增益青绿、负增益红色。

升级表项目使用“等级、效率、速度、专业成功率、专业双倍进度”，由表头说明胜率与变化，行名不再重复“升档”“提升胜率”。

升级表头简写为“项目、门槛/花费、胜率、百分点、经验/h”，完整含义通过 title 提示。表体和表头共享 CSS subgrid 列宽，数值采用内容宽度，第一列仅占最长名称的宽度，不吸收剩余空间；基础列间距为 8px，其余空间均匀分配给数值列，最右列贴齐内容右边界，避免按固定列宽挤断百分号。

结果、目标与行动参数统一采用等宽双列及 12px 列间距，右半列起点一致，不再为顶部结果另设列宽比例。

战斗详情的结果、属性、技能、奖励共用一个两列网格，各分区通过 subgrid 继承列宽，说明行跨两列。标题、标签、技能名、数值和说明均保持单行；长内容超过视口时浮窗支持横向滚动及键盘聚焦，不截断内容。

生活与战斗详情共用结果、目标、收益与耗时的阅读顺序和双列网格；顶部胜率和每小时经验的标签在上、数值在下。随后保留生活升级收益、战斗属性与技能等专属信息，奖励靠近底部，说明置后。长表格或战斗文本可滚动查看，不裁掉数据。

## 2026-11-11 右侧页签迁移

按用户截图要求，当前入口统一为右侧与装备、技能、公会助手同级的“迷宫助手”。内部为“路线与计算”和“代币规划”两个页签，前者上方放路线与计算，下方放房间推荐，取代上文的地图旁固定窗口与迷宫商店旁入口。保持深紫灰和青绿控件，窄容器纵向排列，不移动原生设置表和地图。离线验证见 `tools/browser-sidebar.mjs` 与 `tools/browser-tokens.mjs`。

侧栏标题使用 20px，外层页签沿用游戏的 5px 顶角、`#2c2e45` 底色与 `#4558ad` 选中色，内部控件继续使用既有主题。旧 planner CSS 中的颜色由主题覆盖，不在此次迁移中重写。

## 当前布局（2026-11-11 撤回页签迁移）

默认恢复原位置：路线与计算在地图旁，房间推荐在原生自动化页，代币规划在迷宫商店旁。右侧布局实现保留，`src/ui/sidebar.js` 的 `enabled` 默认是 `false`；改为 `true` 后重建即可切回。`tools/browser-layout-restore.mjs` 检查默认布局，`tools/browser-sidebar.mjs` 显式开启右侧布局进行回归。此说明替代前文的默认右侧布局描述。

## 2026-11-12：按确认截图实现地图菜单

本节替代前文主窗口、折叠和计算设置的旧布局描述，其他页面不变。菜单宽 270px，常态约 243px 高；标题栏 42px，内容左右及底部 10px。路线卡至少 45px、探照灯卡至少 55px，两卡间隔 10px；计算区与卡片间隔 12px，主按钮 32px，日志与分布按钮 28px、间隔 6px。全程展开，窄屏随页面滚动。

底板 #24273b，边框 #41465f；卡片 #171928 / #30344d；字段 #24283f / #383d5d；主按钮 #43c4ad，文字 #10201f；揭示数 #91dfcb；库存徽标 #483c30 / #e9c487。标题 14px，正文和按钮 12px，数字 13px，场数 10px、常规字重、#214d45，不使用底色块。外框圆角 6px，卡片与计算按钮 8px，字段 4px。

标题右侧为缩放胶囊。路线卡保持自动显示与本层临时覆盖语义，不自动保存游戏设置。探照灯徽标显示规划量/库存，结果显示真实“+N格揭示”，库存突破保留两次点击与颜色反馈。计算条中的场数为独立输入，与按钮并列而非嵌套；其余设置入口及统计隐私控件保留。日志和分布并排，使用相同底色、文字与透明边框，不为分布单独使用青绿配色；分布保留原生复选框语义，视觉上使用整块按钮，键盘焦点可见。待机和正常完成不额外占用状态行，错误不隐藏。

离线截图与交互验证：`tools/browser-compact-menu.mjs`（1440px、390px）；探照灯边界：`tools/browser-beacon-fill.mjs`。夹具数值不作为真实游戏验收。
