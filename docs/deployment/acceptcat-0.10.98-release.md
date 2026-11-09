# AcceptCat 0.10.98 发布回执

北京时间2026/11/9 11:33:08，Windows **0.10.98** 已公开发布并设为Latest：[Release](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.98)。固定构建/tag为main **386f62a7fc3874d2e2c43bc678c5d37bc746a72d**，PR186/187及发布复查补修PR188已合并。EXE 421214965字节，SHA256 **79d0b8d3cb03b3a03cfce153879d3369a29006fc2bd71ef0905e0450a4cddc49**。

本地安装包：D:\deepseek-agent\acceptcat-group-invite-fix\clients\openim\release\Base\0.10.98\AcceptCat_0.10.98.exe。桌面副本C:/Users/luo/Desktop/AcceptCat_0.10.98.exe。四附件为EXE、blockmap、latest.yml与SHA256SUMS.txt，远端大小/digest和匿名下载入口已核对；0.10.96/0.10.97原资产保留。

## 纳入内容

- PR186：随每批变更核对旧入口、兼容分支与残留依赖的维护提醒，不做全仓自动删除。
- PR187：图片/文件选择、拖放与File粘贴先暂存，图片按图片发送，PDF/PPT保留可移除文件卡片，明确发送才入队；移除扩展网格和语音入口，保留失败回执、同ID重试及会话隔离。
- 截图不隐藏当前窗口，独立覆盖层支持框选、圈/框/箭头/画笔、选色和撤销；✓/Enter复制并暂存，×/Esc取消，F2限聊天窗口内。
- PR188发布补修：实际Electron大图会使嵌图导航URL过长，改静态HTML加仅活动编辑器主frame可读的初始化IPC，原身份检查/权限与图片边界保持。
- 包含main已有完整消息正文/引用本地缓存及0.10.97待定/阻塞骨架解析修复，未改同事原两态规划、特殊字段写回、提示词或模型设置。

## 验证

最终main三平台Foundation与Windows package共四项CI成功。renderer/Electron类型、64项附件/图片/outbox/截图/IPC/构建定向检查及文档检查通过。合成Edge1280×800/1024×768验证框选标注/撤销/取消/工具栏，750×480输出尺寸及红色像素正确；此前实际组件F2暂存/取消/切会话已通过。

真实Electron43.8.4隐藏隔离窗口加载真实sandbox preload，约4.1MB合成高熵data URL经IPC载入、标注导出和取消通过；再以EXE提取的同一模块验证。没有抓私人桌面或读写系统剪贴板。独立空profile成品启动及更新清单通过。

冻结1666份输入；从最终EXE提取app.asar等8项实际载荷，与win-unpacked相同，132份构建文件逐字节核对；截图新主进程/preload/HTML、F2/附件逻辑、本地缓存及旧提示移除存在，原task-decomposition Skill一致，未混入rcedit临时文件。DSH0.2.1-rc.3、科研插件0.4.0与Tectonic0.17.0保持，插件SHA256为583de48caac441a2fe97c316a09e08fa13b23af512a7b9b7435643316b594585。

## 失败与边界

GitHub连接器合并403后使用已登录gh；PR187仅项目日志追加冲突，双方记录保留。启动探针曾用未解引用pnpm路径、遗留ELECTRON_RUN_AS_NODE，准备脚本旁置dist后探针曾缺模块；均修正测试入口并保留失败。一次误用成品EXE执行外部GUI脚本，打包程序未执行该脚本，旧结果已作废保留为rejected，改以固定Electron引擎加载EXE提取模块并检查新时间戳和明确通过标记后通过，不把退出0当作探针成功。大图旧实现ERR_INVALID_URL为真实缺陷，修复并新增回归后才发布。上传后按tag查询草稿返回404，改从认证releases列表取得唯一草稿ID并核验四附件，之后才发布；失败ID响应已旁置留证，没有重复创建Release。构建保留既有Vite/AntD/Node等提示，不称全无警告。

本批无需部署后台：公网ready仍contract0.43.0，database/storage/authentication为ok，harness为not_verified；schema032沿已有部署回执。没有清库、迁移、重建账号或使用私人模型密钥。真实账号/双机、用户系统截图与剪贴板交互、多屏混合DPI须安装后验收；合成与隔离检查不替代这些体验。

Git外证据：D:/deepseek-agent/.runtime/release-0.10.98-20261109。主要文件build-source.json、windows-build.log、focused-final.log、native-editor-large-result.json、native-editor-packaged-result.json、ui-result.json、installer-audit.json、electron-smoke.log、main-ci-final.json、release-public-verified.json和anonymous-verification.json。
