# 开发指南

| 命令                                          | 用途                                                |
| --------------------------------------------- | --------------------------------------------------- |
| `npm ci`                                      | 按锁文件安装开发工具                                |
| `npm run format`                              | 格式化人工维护文件                                  |
| `npm run lint`                                | 静态检查                                            |
| `npm test`                                    | Node 测试                                           |
| `npm run build`                               | 只更新 dist，不归档                                 |
| `npm run verify:repo`                         | 检查包版本、模块清单、产物和历史哈希                |
| `npm run check:quick -- test/tooling.test.js` | 指定测试的快速检查                                  |
| `npm run check:handoff`                       | 格式、静态检查、测试、构建、仓库校验和 Git 空白检查 |
| `npm run check:ci`                            | 完整检查后确认工作区没有变化                        |
| `npm run release:dry-run`                     | 只读检查发布条件与文件范围，不联网                  |

开发服务仅监听 `127.0.0.1`，只提供四个明确列出的构建文件。每次请求重新构建；失败返回 503，不回退旧产物。未知路径返回 404。
构建不会归档历史。新增源码需要更新构建清单；生成物与源码一起提交。

工程配置取自公会助手，基础工作流参照其 `docs/NEW_PLUGIN_PROJECT_HANDOFF.md` 精简移植。没有复用公会业务和发布脚本中的固定身份。
工具文档参考：[Node 测试](https://nodejs.org/api/test.html)、[GitHub Node CI](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs)。
