# 第三方参考与依赖

## 迷宫胜率计算器

用户提供 `迷宫胜率计算器-1.6.0.txt`，脚本头部标注作者 dakonglong、版本 1.6.0、许可证 MIT。原件 SHA-256 为 `370a5e1a8b3b67c34908984602ebfbe19d22bcce0444838b1fea7db8c1807814`。

公开来源：[Greasy Fork 566829](https://greasyfork.org/zh-CN/scripts/566829)。来源地址、用途及原文件登记在 `references/README.md`。`src/calculator/` 的改编模块保留作者和许可证声明。按职责拆分后改为每实例 `ctx`，使用本项目独立命名与存储，另加生命周期清理、输入失效检查、推荐条件修正和动态重开模型。

0.10.0 之前的内嵌 Worker/WASM 来自该用户提供文件，已由下述固定版本替换；历史 WASM SHA-256 为 `21bc74f0f089376dd6e2a31807cb7007a597d403d05a2fb17b7ca0d744ea3dfa`。

## labyrinth-clear-rate 1.8.2 战斗内核

2026-11-09 按用户指定的 [Yinhaoran1128/labyrinth-clear-rate](https://github.com/Yinhaoran1128/labyrinth-clear-rate/tree/e30f758841ba28b2af117ee14e8d97764ab1c8b3) 导入固定提交 `e30f758841ba28b2af117ee14e8d97764ab1c8b3` 的内嵌资源。Worker、WASM 与数据直接取自生成脚本中的 JSON 资源，不执行或安装上游用户脚本。WASM 解压后保持原始字节。0.11.0 起 Worker 在结果出口增加 `experienceGained` 字段，不修改战斗计算。资源清单见 `references/combat-engine.json`。

- 上游脚本 SHA-256：`663ad862424fd424f54c03cdd9861cb153309d67a553914606651f7d9484c76c`。
- 原始 Worker SHA-256：`119a14f9e6828dd71f6843c0a679299b1aaf4b3c81ee85b263fb3ed2c92044a4`。
- 经验扩展 Worker SHA-256：`635869c4009a38d87ca4495496529625beb5f2ba8b30858f19e19a0b8487d986`；由导入工具验证唯一接入点后生成。
- WASM SHA-256：`57f444599979b2f6de7a23ccb21963acbfe6948b023c0eb40cf24a5c0b62308c`，与仓库 `comparison/assets/mwi_engine.wasm` 一致，运行时再次校验。
- 作者链：原计算器 dakonglong，Rust 核心 wow121/mwi-fastsim，迷宫适配 Yinhr。上游 README 自述沿用原版 MIT 与 mwi-fastsim 来源，生成脚本声明 MIT；保留来源及现有内联声明。2026-11-15 发布准备时核对：固定 1.8.2 安装包头部声明 MIT；wow121/mwi-fastsim 当前 LICENSE 为 MIT（Copyright (c) 2026 wow121），原 JS 模拟器 LICENSE 为 MIT（Copyright (c) 2024 AmVoidGuy）。固定 Rust 核心提交没有单独 LICENSE 文件，因此同时记录其上层分发声明和当前上游许可证，不把当前文件称为该旧提交自带。完整附带声明保存在 `src/vendor/notices.js` 并进入安装包。

重新导入：将固定提交的 `labyrinth-clear-rate-rust-embedded.user.js` 下载到本地后运行 `node tools/import-combat-engine.mjs <本地路径>`，再格式化目标文件并运行检查。导入工具核对完整脚本哈希和 WASM 哈希，拒绝其他版本，不访问网络、不执行下载内容。`src/calculator/combat-engine.js` 中资源标记以外为本项目的生命周期和协议适配代码。

对照夹具 `test/fixtures/combat-engine-reference.json` 由该提交未修改的 `comparison/core.mjs`、`Game`、`WasmEngine` 和相同固定数据产生，覆盖十种迷宫怪物各两个等级、相同角色与种子；只保存合成输入和结果。120 秒边界用例改编自上游 `calculator/tests/deadline.test.mjs`。

## lz-string

内置版本 1.5.0，作者 Pieroxy，MIT。来源为 [固定版本源码](https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.js) 和 [许可证](https://cdn.jsdelivr.net/npm/lz-string@1.5.0/LICENSE)。完整许可证保留在 `src/vendor/compression.js` 头部。仅包裹为本项目命名空间并去除无用变量及模块加载分支，压缩算法未改变。

## 开发依赖

Playwright 仅用于独立浏览器夹具测试，不进入用户脚本。测试请求由本地夹具响应或阻断，不使用真实账号数据。版本由 `package-lock.json` 固定。

## Rust 编译依赖的附带声明

根据固定迷宫适配提交中的 `comparison/engine/Cargo.lock`，下载 crates.io 对应版本源码包并逐一核对锁文件 SHA-256。将各包根目录的 LICENSE、COPYING、NOTICE 和 COPYRIGHT 文件完整保存在 `src/vendor/notices.js`，包含编译期依赖，避免漏项。游戏引擎字节未因此改变。

版本：equivalent 1.0.2、hashbrown 0.17.1、indexmap 2.14.2、itoa 1.0.18、libm 0.2.16、memchr 2.8.3、proc-macro2 1.0.107、quote 1.0.47、rustc-hash 2.1.3、serde / serde_core / serde_derive 1.0.229、serde_json 1.0.151、smallvec 1.16.1、syn 3.0.6、unicode-ident 1.0.26、zmij 1.0.23。

上游许可证：[mwi-fastsim](https://github.com/wow121/mwi-fastsim/blob/main/LICENSE)、[MWICombatSimulatorTest](https://github.com/shykai/MWICombatSimulatorTest/blob/main/LICENSE)。原作者名称与贡献分别保留，不将依赖作者表述为迷宫助手的日常维护者。
