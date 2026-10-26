# AcceptCat 0.10.55 星标读取修复

2026-10-26（北京时间）。负责人安装0.10.54后反馈通讯录提示“本机星标暂时无法读取”，随后明确要求修复。在现有待审PR114/feat/contact-directory-pages继续修正该批回归，不新增其他功能；fetch后main仍d25781d，已有工作区干净，保留PR113删除依赖和同事功能。产品固定 **4e87b3492b66e2a94813206985cc78fb116f2209**。

## 原因与修复

useContactStars经readContactServiceOrigin调用preload的getResearchServiceStatus，但主进程research-service-status误用仅允许本机连接页的管理权限；正常通讯录页面被拒绝后，合并成了本机存储读取失败提示。这不是已证实的磁盘或用户数据损坏。

只读状态现在允许本机连接页，以及已连接服务的当前应用主窗口/主frame；后者须同时匹配实际frame和WebContents当前文档的rendererOrigin。其他窗口、子frame、外部/失效来源和断开连接的应用页继续拒绝。修改服务器地址仍限当前主窗口的本机连接页，没有赋予正常应用页切换服务的能力。星标和名片使用已配置的实际后台origin，不以临时loopback来源替代；原星标键、账号隔离及记录内容不迁移或清空。

## 实际检查

- 新增5项合成检查，加载真实ipcHandlerManage、preload和renderer名片/服务helper，仅Electron环境与无关桥接用替身；覆盖通讯录调用、模拟存储星标/取消与服务/账号键隔离、连接页读写、异窗/子frame/来源拒绝和只读权限不扩大配置权限。不是安装后的Electron或用户资料验收。
- 修复前实际运行3通过/2失败，复现正常通讯录被拦截及旧配置入口未限定当前主窗口；原失败日志保留。修复后 **42项/7文件**全部通过，包括新5项、已有通讯录/名片、连接地址、认证输入、消息提醒和构建守卫。没有跳过断言或放宽预算/时限。
- renderer及Electron类型检查均通过。新串联检查和原名片检查已加入Windows CI；0.10.54原96项属历史批次，没有冒称本批重跑。
- 本批不改API、契约、数据库、共享包、角色/方法或依赖锁，未重跑已通过的根799项；后台保持b9901ac5、contract0.33/schema027，无需升级。

## 安装包与协作状态

根desktop:win按固定pnpm11/10冻结顺序完成两个共享包构建、客户端安装、Web/4固定SDK资源/55运行依赖、NSIS和既有4启动入口守卫，--publish never、无force。EXE/blockmap/latest.yml及包内更新源版本/大小/摘要核对通过。桌面 **C:/Users/luo/Desktop/AcceptCat_0.10.55.exe**，**88,221,426字节**，SHA256 **88575553d299146f0bcd7df2cc0bef61fe8526c602167872733a259bd8069678**，源包与桌面副本摘要一致，0.10.54及旧安装包保留。本批未安装或启动用户客户端，未操作浏览器产品、真实账号/材料或追加体验验收；实际安装体验由负责人检查。未合main、未公开Release，Latest重新读取仍v0.10.52/423781483。没有后台部署、迁移、重启或生产业务探测；注册超时仍未定因。

修复和交付记录继续提交到[PR114](https://github.com/luoyan96/personal-agent/pull/114)待审，不新建重复PR，不合main。Git外证据 **D:/deepseek-agent/.runtime/contact-stars-status-20261026**：bridge-before.log、client-tests.log、renderer-types/electron-types日志及exit、desktop-win日志/exit、windows-update.log与delivery.json保留。
