# DeepChat 产品更名

2026-11-18，基于 main `bec9526`，工作分支 `codex/deepchat-branding`。用户要求项目和软件所有可见品牌从 AcceptCat 统一为 **DeepChat**，沿用大肥鱼头像。

## 修改范围

桌面标题、启动/登录/注册、账号与名片、联系人、任务、资料导入、工作台、原生菜单与错误提示、安装器与快捷方式采用 DeepChat。DSH 继续使用宿主品牌扩展，模型提供者显示名、任务上下文和归档说明同步更名。网页入口、飞书授权返回页和服务端目录说明也更新源码。

README 当前产品名称同步修改；已有公开下载地址保留真实发布的 AcceptCat 文件名，历史日志、许可和来源记录不重写。本地候选版本为 `0.10.117-preview.1`，本轮没有合并 main、发布 Release 或部署 API/worker。

## 兼容性

- package.name 仍为 `research-wechat-openim`，appId 仍为 `com.acceptcat.researchwechat`，固定 NSIS GUID 与 GitHub 更新源不变。
- 启动时先保存 Electron 解析后的 userData，再设置显示名；旧账号配置、聊天缓存、资料和 DSH 目录仍使用原路径，显式 CLI 和 smoke 隔离目录继续有效。
- 更新缓存仍为 `research-wechat-openim-updater`；新旧三个名称的卸载器均能识别。固定 electron-builder 23.6 的 NSIS 模板使用原 InstallLocation、UninstallString 和 ShortcutName 完成升级处理。
- HTTP headers、域名、名片口令、角色 schema、资料清单、storage keys 和插件/session ID 保留，避免破坏既有数据和前后端兼容。任务工作记录同时识别新旧品牌的上下文前缀。
- 不修改用户历史消息、私人角色或已学习习惯。本轮不需要数据库迁移；服务端生成的品牌文案在后续部署相应 API 后生效。

## 验证记录

定向检查：renderer/名片/上下文/DSH profile 等 37 项通过；API 28 项通过；原生构建和更新 17 项通过；renderer 和 Electron 类型检查通过。额外原生检查 36 项中 35 项通过，`team-library.test.mjs` 的 LFS/大文件用例在临时目录清理时出现 Windows EBUSY，单项复跑仍失败；保留失败，不记作通过。

Windows 安装器和 EXE 的产品名称均为 DeepChat，构建、更新清单、隔离启动检查通过。隔离实包登录和注册验证了窗口标题及品牌。旧版 0.10.116 与新版先后打开同一个合成用户目录，均通过命令行指定路径，确认已有设置文件的夹具值保留。实际覆盖安装和任务栏固定快捷方式迁移尚未执行。

完整 CI 的最终结果见本批项目日志。验证日志位于 `D:/deepseek-agent/.runtime/deepchat-branding-20261118/`，额外原生失败记录保存在 `C:/Users/luo/AppData/Local/Temp/deepchat-brand-native-20261118/focused-checks.json`。首次隐藏窗口截图超时，随后在隔离实包内完成登录和注册的界面文字与交互验证。
