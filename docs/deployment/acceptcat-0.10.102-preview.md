# Windows 0.10.102：任务加载与连接提示恢复试用

2026-11-11，跟进PR200的本机试用反馈。**仍在同一个PR #200整合，未合main、未创建tag或公开Release、未部署后台。** 包含0.10.101统一任务视图和PR199资料页闪动修复。

- 固定产品源码：`7b3ee2d7e4fbe735c5ca62d225b9b9ed544e1f18`。构建/成品检查时工作目录干净，后续提交仅补记录。
- 桌面：`C:/Users/luo/Desktop/AcceptCat_0.10.102.exe`。
- 原始产物：`D:/deepseek-agent/acceptcat-group-invite-fix/clients/openim/release/Base/0.10.102/AcceptCat_0.10.102.exe`。
- 421228845字节；SHA256：`b727a1aaf07af5a97e38846254b2031e7a35642d5af64c97edd3b90a8be65bb5`。桌面副本一致，app.asar版本0.10.102。
- 仍使用Electron43.8.4、DSH0.2.1-rc.3、科研插件0.4.0、Tectonic0.17.0。没有改提示词、模型、两态规划或权限规则。

## 改变的行为

原全局黄色框来自独立的ready探测，并非任务执行结果；此前按5秒轮询，失败时任务虽然已读取仍可能常驻。兼容版本现在可由成功且通过契约校验的业务API既有`X-Contract-Version`确认，在当前服务renderer内共享；初始/手动探测使用既有`health/live`，不再周期执行ready探测。版本仅说明兼容范围，不表示授权、数据库或存储健康；业务API错误仍独立报告。更换桌面服务会加载新renderer并重置公共版本；账号/课题组事实仍按原scope隔离。

任务/团队列表与成员首次读取限时10秒；失败后结束loading并提供重试。网络、超时、5xx只保留当前scope当前页面上一次已读结果，明确显示灰色更新提示。401/403、格式错误、身份或课题组变化移除旧事实，不能借缓存扩大权限。没有新增持久任务缓存；正常写入/发送/模型调用的原时限保持。本批不保证真实网络永不超时，也没有将检测失败伪装成连接正常。

## 验证

- 客户端双类型和373项脚本检查执行通过，含脚本间重复覆盖。新增实际useResearchRead受控时钟的超时/重试、瞬态保留/401或403清除、格式错误、身份变化晚到结果、合并请求、停止轮询；真实researchApi的有效版本头/无效响应/401不确认版本回归通过。根工程/共享包未修改，不冒称本地重跑根CI。
- 隔离Playwright/无头Edge（Browser插件未列出）：实际DesktopWorkbench/共享列表/团队/hooks，真实researchApi解析合成session和版本头。探测永不返回但版本已确认时立即显示任务，两分钟只有一次探测；初始任务或版本请求永不返回在10秒转明确错误，重试可恢复；503保留并标明旧列表、403清列表。1440×960和1100×800布局检查通过。
- 业务数据、规划与任务详情叶组件为明确合成夹具；使用受控时钟，不能当作真实账号/任务执行/模型/双机验收。未操作正在使用的私人客户端。
- `desktop:win`冻结准备、完整Web/NSIS、11必要入口与固定DSH校验通过；64份应打包Web资源与dist摘要一致，任务新提示与资料修复标记在成品中。两份根目录Web WASM按原生桌面原配置排除。EXE、版本、SHA512、blockmap及本地latest.yml校验通过，未上传更新清单。
- `electron:smoke`临时user-data目录隔离启动，收到`OPENIM_ELECTRON_READY`并通过，退出码0。既有electron-log重复preload提示仍在；浏览器已有Antd findDOMNode弃用/Router未来版本提示保留，不称为零警告。
- 只读公网ready抽查：HTTP200、0.45、DB/storage/auth均ok，约0.13秒。相同Electron桌面传输代码、全新临时目录、无Cookie的公开live/ready抽查分别5529/3632ms，均200/0.45。两种传输耗时不同，不能据此认定用户出错时的具体网络或服务器根因；本批不改代理/证书/端口。

证据：`D:/deepseek-agent/.runtime/task-read-recovery-20261111`。包含client-checks.log、browser-result.json/截图、public-ready.json、public-transport.json、windows-build.log、artifact-proof.json、update-check.log和electron-smoke.log。API测试初次缺失import.meta.env define及浏览器两字按钮空格定位失败已修正，保留记录；未因夹具问题更改产品依赖。

退出原客户端后运行桌面安装包，由负责人验证实际任务读取、重试及两个任务视图。**已构建/启动不等于已安装或真实使用通过。** 后台仍acffd5e/contract0.45/schema034，公开Latest仍0.10.100，无需后台更新。下一步按真实体验反馈决定是否合并/公开发布。
