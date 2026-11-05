# AcceptCat 0.10.95 发布回执

北京时间 2026/11/5 15:37:13 已公开稳定 Latest [v0.10.95](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.95)，Release ID 434891459。PR [#175](https://github.com/luoyan96/personal-agent/pull/175) 的 head 17e3b21 四项检查成功后普通合并；实际构建及 tag 固定 main **1baf294b707207ec7b7b9d3acd4de53b583aef82**，没有覆盖旧版本资产。

- 安装包：AcceptCat_0.10.95.exe，421224009 字节。
- SHA256：ddccfa6b80058f9b29d462a6b75b9b92c4e803682b675dee86d2fa1a027ca888。
- DSH 0.2.1-rc.3、科研插件 0.4.0、Tectonic 0.17.0 保持不变；插件 tgz SHA256 为 583de48caac441a2fe97c316a09e08fa13b23af512a7b9b7435643316b594585。

## 修复与范围

0.10.94 包内已有插件 0.4.0，但旧 profile 仍可能记录 GitHub 3d2805c/0.3.1。裸 file 参数让附带 pnpm11 先恢复旧依赖；空缓存离线会失败，还可能把旧模块移入 .ignored。上一批只验证新 profile，漏了旧 profile 升级，属于客户端接入缺陷。

现在显式传入 dsh-research-workbench@file:，由 pnpm 替换该条依赖并维护锁。锁文件是版本记录，不禁止更新；打包固定并校验插件，启动时兼容更新用户现存 profile，二者都要验证。继续核对实际安装版本，不降级用户另装的更高版本；没有删除锁文件/profile/账号数据，没有关闭校验或让用户重新下载旧 GitHub 包。其他插件、配置、会话与资料保留。Windows CI 在真实升级检查前准备固定的 DSH 和工具。

后台、共享业务/Skills、客户端页面、模型设置与提示词没有变化。EXE 内完整聊天缓存模块 SHA256 与 0.10.94 完全相同：0b14c5cc68c2d18f6337f0ee0a8422959fda853d5c3323e1032807babfe46331。配套后台本批未部署；公网 ready 0.42.0，database/storage/authentication 为 ok，harness 为 not_verified。

## 实际检查

- 冻结 1653 份源码输入，从干净合并 main 执行根 desktop:win。直接解包 EXE，核对 129 份构建文件、@file 修复、插件原包/Office及许可、DSH/tectonic 固定摘要、聊天正文/引用缓存及 IPC、原两态规划；无 rcedit tmp。
- 插件检查 19 项通过，含真实附带 pnpm11.28.5、空 store、--offline 的旧 GitHub 锁与上次失败 .ignored 两场景。其他插件/配置/会话/资料哨兵逐字节保留；重复补装不重装。renderer/Electron 类型及既有 DSH 41 项通过。
- 同样两条真实升级回归直接针对 EXE 提取的模块、随包运行时和插件再次通过。成品独立 DSH home 从旧 GitHub 依赖升级后实际启动/加载插件，匿名两路由 403、有效临时会话文件读取 200，重复补装不重装。未访问私人 profile、调用真实模型或运行 Office 命令。
- EXE 提取的实际 SQLite 模块在随包 Electron 独立写入/重开/撤回进程验证完整正文和引用、本地分页/删除、账号与服务隔离、迟到正文不能恢复已撤回内容，网络请求为 0。
- 成品隔离 Electron 启动、更新清单版本/大小/SHA512 检查通过。保留既有 electron-log 重复初始化警告日志，最终 OPENIM_ELECTRON_READY 和 startup smoke passed；不称零警告。
- PR 四项、合并 main 的 Windows 包检查及根三平台 CI 最终成功。根检查包含 70 文件/874 项。未为此修改超时或测试断言。
- 草稿四资产大小与 GitHub digest 和本地一致后才公开；匿名 Latest、小附件字节摘要与 EXE HEAD 200/长度核对通过。0.10.94 原四资产 ID/大小/digest 保留。

## 失败记录与边界

0.10.94 EXE 模块运行新回归的两场景均按原错误失败，是负向证明；verify_deps_before_run=false 的隔离实验也失败，未采用。原日志在 dsh-legacy-plugin-upgrade-20261105/released-0.10.94-regression.log、repro.log、no-auto-verify.log。PR 创建首次遇 push 尚未结束，完成推送后重试创建 #175，无重复 PR。

PR 首轮 Windows 在 dialogue-context.spec.ts:109 的既有测试超时 30 秒（873 通过/1 超时）；本地原文件 9 项通过，原 head/原时限仅重跑失败作业后成功。main 首轮同文件 :82 的另一测试超时 30 秒（873/1），按原代码/时限重跑失败作业后成功；不将超时根因说成已查明。保留 foundation-first-failure.log、dialogue-context-targeted.log、foundation-retry-watch.log，以及本批 main-first-failure.log、main-retry-watch.log。CI 偶发超时应单独跟进，不通过扩大期限掩盖。

本批修复和验收是独立合成 profile/数据及真实附带进程，未代操作负责人正在使用的客户端，也未进行真实账号模型/双机验收。科研插件沿上游的本机资料位置，不能称资料已按 AcceptCat 账号隔离；Office/WPS 功能仍需本机 Office/WPS，既有 80MiB 插件上传范围未改变。直接升级即可，下一步由负责人安装复验原工作台故障，无需清空个人资料。

构建与成品证据在 Git 外 D:/deepseek-agent/.runtime/release-0.10.95-20261105；回归/首次失败证据在 D:/deepseek-agent/.runtime/dsh-legacy-plugin-upgrade-20261105。关键文件为 build-source.json、windows-build.log、installer-audit.json、packaged-upgrade.log、native-plugin.json、packaged-cache.json、electron-smoke.log、release-draft-verified.json、release-public-verified.json、anonymous-verification.json。
