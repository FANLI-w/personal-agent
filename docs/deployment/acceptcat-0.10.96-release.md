# AcceptCat 0.10.96 发布回执

北京时间 2026/11/6 09:46:58 已公开稳定 Latest [v0.10.96](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.96)，Release ID 435987109。PR178 与发布复查补修 PR180 已通过普通合并整合；版本准备为 PR179。实际构建/tag 固定 main **fb9e2d2677d39416e83a2d88df5ad660d96a0984**，从干净输入完整重建，首轮旧候选未公开。

- Windows x64 安装包：[AcceptCat_0.10.96.exe](https://github.com/luoyan96/personal-agent/releases/download/v0.10.96/AcceptCat_0.10.96.exe)，421225024 字节。
- SHA256：ad1a6fa7c24967a5c73e2764cb8377a35a38ba3ae78307f02559a05eb7f4b484。
- DSH 0.2.1-rc.3、科研插件0.4.0与Tectonic0.17.0保持；插件原包SHA256为583de48caac441a2fe97c316a09e08fa13b23af512a7b9b7435643316b594585。
- 本地安装包：D:\deepseek-agent\acceptcat-group-invite-fix\clients\openim\release\Base\0.10.96\AcceptCat_0.10.96.exe。

## 这次修复

正常本地历史读取安静；真实离线和最新页同步失败分别准确显示。自动恢复阅读位置只查本地，过期位置静默回到最新。主动定位等待正在读取的页，保留原目标重试并跨页查找；目标行实际提交到列表后才滚动，换账号/会话或新跳转取消旧定位。

PR178解决截图里的常驻缓存提示、自动位置恢复误报、读取繁忙误判及无效重试。发布复查新增PR180：异步读取完成不等于React已提交新行；旧的一次RAF可能看到旧列表，目标索引不存在就永久放弃滚动。现在按已提交的数据安排定位帧，保留现有虚拟列表和本地缓存结构。

## 检查与证据

49 项聊天定向检查（32 缓存/定位/帧时序、17 引用/会话/注意状态）、双类型检查、8 条实际组件/SQLite隔离 Edge 界面路径通过，1280×800/1024×768。冻结 1656 份输入，EXE 解包核对 129 份构建文件；缓存跨进程、实际离线插件升级、DSH加载、隔离启动、更新清单与四资产远端摘要核对通过。最终构建 main 的三平台根CI与Windows包CI均成功。

| 检查 | 结果与边界 |
| --- | --- |
| 页面身份、首屏与错误覆盖层 | 本机临时 /chat/synthetic-group 路由、标题正确，首屏有实际聊天组件，无框架错误覆盖层 |
| 正常缓存读取、自动恢复 | 无常驻黄条；本地恢复在显式阻塞最新页核对时仍完成；过期锚点不请求未缓存旧页 |
| 主动定位和重试 | 注入一次旧页503，点击“重新定位”跨页找到第5条并滚入视野；忙碌读取不误报；关闭与切账号清理旧目标 |
| 桌面与窄屏 | 1280×800、1024×768，实际ChatContent、hook、timeline、Virtuoso/AntD与原生SQLite；SDK/IPC及简单气泡为合成边界 |
| 控制台 | 页面异常0；既有Router future/AntD findDOMNode警告与两次主动注入503留证，不称零警告 |
| 安装包内容 | EXE提取app.asar与本机成品逐文件一致，129份；新提示/定位代码存在、旧误导文字不存在；原两态规划/技能、DSH/插件/许可保留，无rcedit临时文件 |
| 缓存持久化 | EXE提取的SQLite模块在随包Electron独立写入/重开/撤回进程验证完整正文/引用、分页删除、账号与服务隔离，网络请求0 |
| 插件和启动 | EXE提取的插件模块+随包pnpm在空store/offline下升级旧GitHub锁及.ignored失败状态；独立DSH加载实际插件、匿名403/临时会话读取200，重复不重装；隔离Electron ready通过 |
| 更新与发布 | latest.yml名称/版本/大小/SHA512一致；EXE/blockmap/latest.yml/SHA256SUMS四附件远端digest与本地相同，匿名Latest与EXE HEAD200；95原附件保留 |

执行根 desktop:win、客户端双typecheck和test:chat-history，补跑chat-attention/chat-quote-recovery/conversation-actions；独立Playwright1.61.1/headless Edge检查（Browser插件未提供）。成品检查使用verify-installer、packaged-cache、packaged-upgrade、run-native及electron-smoke脚本。冻结输入与逐文件核验使成品和受测源码相互对应；界面合成测试不等同于真实SDK/账号验收。

## 失败记录

首轮构建c454753成功，但UI遇到目标已找到却停在末尾，未发布该候选。ui-first-failure.json/png/log、render-regression-baseline.log保留。可控React提交/RAF帧的原实现回归1失败/1通过，补修后2项通过。探针一次受1.8秒定时假设影响而失败，改用显式释放屏障，不通过延长期限掩盖产品问题；ui-probe/timing-assertion.json保留。

首轮c454753 Windows根CI出现agent-files.spec.ts文件解析超时、连带缺失turn；first-main-ci-failure.log保留。原文件按原时限本机14项通过；最终main以main-ci-final.json为准，不修改后台、测试断言或时限。第一次从api工作目录套用根Vitest配置无匹配，agent-files-wrong-filter.log留证后改从根执行。初次聊天命令误带两条不存在文件名，Node仅运行其余36项；再用正确引用/会话文件完成11项，不把忽略项计入结果。原始PR178开发失败另见11月5日项目日志。

构建保留Vite/AntD既有警告；隔离启动保留electron-log重复初始化警告，最终OPENIM_ELECTRON_READY与startup passed。没有将这些记录称为全无警告。

## 验收边界

本批没有部署后台，公网ready仍contract0.42.0，database/storage/authentication为ok、harness为not_verified；schema沿现有032。不改模型、提示词、科研插件原包或DSH能力。未使用私人账号/资料/密钥，也未代操作已安装客户端；SDK/IPC和简单气泡为UI合成边界。系统级断网、实际安装和真实双客户端验收留给负责人。 既有旧版只存指针/本机尚未读过的消息，首次仍需要联网取得正文；本地优先并不取消新消息传输和后台状态核对。科研插件沿上游本机资料目录，Office/WPS能力需要本机软件，原80MiB插件上传范围未改。

无需清库或重建账号，安装新版复验原截图场景即可。其他同事PR176未混入本批。

证据目录（Git外）：D:/deepseek-agent/.runtime/release-0.10.96-20261106。主要文件：build-source.json、windows-build.log、installer-audit.json、navigation-markers.json、history-final.log、render-regression-fixed.log、ui-result.json、packaged-cache.json、packaged-upgrade.log、native-plugin.json、electron-smoke.log、main-ci-final.json、release-public-verified.json、anonymous-verification.json。界面截图 normal-local-history.png、expired-position-fallback.png、explicit-retry-found-target.png、narrow-desktop-location.png。
