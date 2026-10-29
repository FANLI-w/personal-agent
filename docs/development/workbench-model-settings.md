# 工作台名称与 DSH 原生模型菜单

2026-10-29，负责人要求将 DSH 板块命名为「工作台」，并保留截图中的 Flash / Pro、Off / Low / High / Max 设置。独立副本从 main/7f8775f 建立 `fix/workbench-model-settings`；PR135 的本地材料与大文件改动仍在原分支，没有混入本次修复。

## 改动

- 导航、页面标题及加载提示改为「工作台」。任务仍为「任务」；内部 `/dsh`、`/workbench` 路由保持，DSH 来源署名保持。
- 原先为共享 AcceptCat 账号使用 pi-ai 自定义 `acceptcat` 路由，只声明模型名称和容量，缺少推理能力。这让官方菜单缺失推理等级，不能靠改按钮文案解决。
- 对已知 DeepSeek Flash / Pro，改用已打包的 DSH 0.2.1-rc.3 原生 `llm-deepseek` 插件；通过官方 `--patch` 配置账号中继地址、临时凭据引用与两个模型。原生 UI、模型标签、版本徽标、推理菜单由 DSH 自己提供，没有复制或注入一套菜单。
- 默认模型仍取 AcceptCat 当前账号设置，工作台内可切换 Flash / Pro。旧 `acceptcat` 路由保留兼容已保存的会话，因而菜单仍可能出现原 AcceptCat 兼容项；旧会话可在同一原生菜单选择 DeepSeek 后使用推理等级。不修改历史消息或用户插件配置。
- 其他提供方、未知模型继续原接入，不宣称支持 DeepSeek 的四档能力。模型密钥仍留在服务端，DSH 只获得当前进程的回环中继凭据。
- 本机原生适配器按官方配置关闭附加会话日志上传和插件清单上传。它们此前不在 pi-ai 请求内；本次也不放入 AcceptCat 推理中继。

## 后台与发布顺序

后台仅增加已知 DeepSeek 账号在 Flash / Pro 间选择，以及严格验证、转发 `output_config.effort` 的 low/high/max；Off 由原生适配器发送 `thinking.type: disabled`。模型名单、账号/CSRF/指纹、速率与输出上限保持约束，不开放任意模型、地址或服务端工具。

协议依据：[DeepSeek Anthropic 兼容文档](https://api-docs.deepseek.com/guides/anthropic_api/)；实际适配依据为已安装 rc.3 的 `dsh-llm-deepseek`、`dsh-llm-deepseek-api-key`、`dsh-session-log-deepseek` 和 `dsh-plugin-package-inventory-deepseek` 包内 README/配置接口。模型的费用按实际选择计，Flash 与 Pro 不作等价替换。

**必须先部署兼容后台，再发布客户端。** 旧后台会拒绝原生 effort 字段及切换到非默认 Pro 的请求；不能只更新客户端。此次不改数据库或契约结构（contract0.37/schema030），不部署、不合并、不打包/发布；生产仍3162c814，公开 Windows 仍0.10.70。本分支与 PR135 整合时需保留其0.38分块接口。

## 验证及限制

- 冻结安装与根 `pnpm run ci`：856项/68文件、生产3项、B0和Web生产检查通过。
- 客户端28项 DSH/账号/任务/团队定向检查、客户端及 Electron 类型检查、Web/Electron 编译通过。
- 独立 Electron22 + 真实 DSH rc.3 + 实际本地 AcceptCat API/SQLite，使用合成账号、合成模型响应：原生模型/推理两层菜单可见，四档选项与实际转发参数一致，回复及刷新恢复通过；Flash→Pro→Flash 的实际请求模型与选择一致。没有使用真实密钥、私人文件或用户正在使用的客户端。
- 证据：`D:/deepseek-agent/.runtime/workbench-model-settings-20261029`，含 `qa-results.json`、`qa-models-results.json`、`model-calls.json`、菜单截图和检查日志。UI截图已目视核对；模型切换功能断言通过，末次额外截图因后台窗口 CDP 捕获超时未生成，不把该次截图称为成功。
- 保留失败证据：首次完整检查与开发中补充 Pro 测试交错，重跑最终CI通过；原生日志附加字段被中继拒绝后按官方配置关闭；测试标题生成请求混入对话断言、临时API旧编译版本/旧计数、Vite监听临时用户目录及后台窗口截图问题分别记录并修正测试环境。Browser插件不可用，Playwright连接Electron的浏览器上下文管理失败后使用隔离窗口的目标CDP。

真实模型效果、费用及用户安装体验未验收。下一步审阅 PR，和材料工作流分别整合，再安排后台更新及 Windows 安装包；不要将源码完成当作当前已安装版本生效。
