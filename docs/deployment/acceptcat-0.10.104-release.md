# AcceptCat 0.10.104 发布回执

北京时间 2026-11-12T09:58:48+08:00，Windows **0.10.104** 已公开发布并设为 Latest：[Release](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.104)。固定构建源码/tag 为 main **f70f3a640ce2df2b0b0cf15cb79a82c6e94ed0f5**。PR199/200/201 已审核并按顺序普通合并，PR202仅版本和发布准备，保留原提交历史。

本地安装包：`D:\deepseek-agent\acceptcat-group-invite-fix\clients\openim\release\Base\0.10.104\AcceptCat_0.10.104.exe`；桌面副本：`C:/Users/luo/Desktop/AcceptCat_0.10.104.exe`。两份均为 421238113 字节，SHA256 `f5630e0332b98c1b367aa175c0edac5da5be7a107f85705ff37dfbb55dbd47aa`。EXE、blockmap、latest.yml、SHA256SUMS.txt 四附件大小与 GitHub SHA256 digest 对上本机；匿名 Latest、小文件字节和 EXE HEAD 核验通过，0.10.100 原附件保持不变。

## 审核与整合

- PR199/437b520：资料服务版本确认后保持新版布局，未知/失败不闪回旧页面。
- PR200/7d1ecc1：统一我的待办/团队列表详情；保留团队筛选与分工、个人/课题组创建入口；读取10秒限时、失败重试、瞬态错误标识上次结果，401/403/作用域变化清除旧事实。公共兼容版本不再作为周期 ready 健康探测，不掩盖真实任务错误。
- PR201/cc9c2f2：规范与计划记录完整页面；列表阅读、独立编辑、原计划继续沟通和授权任务关联；原 allowedActions/expectedVersion/失败草稿保留。

三个 PR 最终 HEAD 均四项 CI 通过；整合 main/74991ec 的树与受审 PR201 完全一致，三个 HEAD 都是最终 main 祖先。版本准备 PR202及最终构建 main 四项 CI 均通过。提示词、两态规划、聊天缓存、截图/附件、DSH原生集成、API/契约/迁移、工具依赖和锁文件相对公开0.10.100均未修改，机器断言见 integration-proof.json。

## 检查与成品

本地双类型、386项客户端脚本检查执行、32项聊天历史、44项本地DSH、19项插件检查通过；脚本存在重叠，不能相加当作独立覆盖数。内容检查449份Markdown/19份Skill通过。此批未修改共享代码或Skill，根完整CI由远端三个平台检查执行。

冻结 1731 份源码输入，Windows按根脚本冻结安装依赖并重新构建，不复用103的EXE。最终EXE提取 8 项实际载荷，与win-unpacked核对；135 份构建资源逐字节一致。新版页面标记、截图编辑/F2/不隐藏原窗、本地缓存入口、原生CJS加载与交接/规则回归、原task-decomposition Skill逐字节一致均通过。更新清单、PE/asar版本和临时独立profile启动通过；EXE提取的SQLite模块使用实际成品Electron、独立进程、禁止网络，验证完整正文/引用、账号和服务隔离、撤回、分页与删除。

内置 DSH 0.2.1-rc.3、科研插件 0.4.0、Tectonic 0.17.0 固定不变，无rcedit残留tmp。既有第三方构建警告和electron-log重复初始化提示保留在日志，未宣称零警告。

此前同一产品树的实际页面/合成接口IAB交互和图稿对照证据在 `D:/deepseek-agent/.runtime/record-pages-20261111`；此次只调版本和文档，验证最终成品而不重复私人账号测试。未代安装、未操作真实账号/私人文件/模型密钥。规范当前只显示真实当前版本，完整历史接口尚未接入；计划搜索明确限本页。

## 后台与记录

本批无需也未部署后台：仍 acffd5e / contract0.45.0 / schema034、116表；公网只读ready的database/storage/authentication为ok，harness为not_verified。不迁移、不清库、不改变权限。真实任务、模型遵守与团队双机体验由负责人验收。

Git外证据：`D:/deepseek-agent/.runtime/release-0.10.104-20261112`。主要文件 pr-199/200/201.json、pr202-ci-final.json、main-ci-final.json、integration-proof.json、client-checks.log、chat-history.log、local-dsh.log、dsh-plugin.log、build-source.json、windows-build.log、installer-audit.json、update-check.log、electron-smoke.log、packaged-cache.json、release-public-verified.json、anonymous-verification.json。若有失败尝试，以 failed-attempts.md 及原日志为准；不会用通过结果覆盖失败。

发布回执经独立文档PR补入；tag始终保持实际构建提交。
