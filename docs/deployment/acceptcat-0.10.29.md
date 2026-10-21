# Windows 0.10.29：添加联系人隐藏系统个人助理

2026-10-21（北京时间），从实际干净 `fix/library-agent-notices-0.10.28` / `c8efe0f` 接续，分支 `fix/contact-search-no-assistant-0.10.29`，产品提交 `a6256f8`。保留此前修改，没有切换 main 或修改已有账号。

## 用户可见变化

“添加联系人 → 朋友与已有 Agent”按服务端不可编辑的 `profile.role` 排除 `coordinator`，账号搜索与完整名片查找共用这一显示规则。真人和用户自行创建的 specialist Agent 继续显示，即使自建 Agent 名字中含“个人助理”也不会因此隐藏。过滤后为空时，明确提示未找到可添加的联系人。

仅调整客户端搜索结果；不删除个人助理、已有关系或会话，不修改服务端目录及联系人申请权限。

## 验证边界与交付

用户明确要求“不要检查，我自己检查”后，停止已启动的界面验收，不追加测试。此前渲染端 TypeScript 与生产 Web 构建已经完成并通过，不能据此声称联系人搜索交互、真实账号或安装后使用已验收。合成 ContactFinder/HTTP 夹具只启动并打开页面，尚未完成查找、名片或窄窗交互；没有将其计为通过。

Windows x64 安装包已制作并放到 `C:/Users/luo/Desktop/AcceptCat_0.10.29.exe`，87,439,504字节，SHA256 `20cdaf56795d5fc35489c22ab60b70ae783308b091aadcef23b46628620027bc`；该哈希用于标识交付文件，不代表载荷或功能验收。按照用户要求不追加安装载荷、原生启动或真实账号检查。打包使用 `--publish never`，不代安装、不更新公开 Release/自动更新源，无后台部署、数据库迁移、飞书权限或模型 Key 变更。本批提交本地保存，未创建远端PR。

构建日志、未完成验收夹具保留 Git 外 `D:/deepseek-agent/.runtime/contact-search-20261021`。界面验收本地服务已停止；浏览器标签关闭返回已不在当前会话中，未进一步接管或重开。前批他人注册超时仍待设备信息，与本次搜索结果调整分开跟进。

## 后续明确授权：同步 main 并公开 Release

2026-10-21用户明确要求以当前本机版本更新GitHub main与Release，上述“未公开”描述仅对应最初本地交付时点。远端main在fetch后为b7c4646，是229bf4d的祖先，相差180提交，普通快进推送至229bf4d；没有强推、删除旧分支/Release或重写历史。本次包对应的v0.10.29 annotated tag固定229bf4d，tag对象552b1639f3fe3b3117bfc7116c49c97986a81031。

北京时间2026-10-21 15:35，[v0.10.29](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.29)已公开且标记Latest。4项上传附件为AcceptCat_0.10.29.exe、对应blockmap、latest.yml与SHA256SUMS.txt；GitHub可见页面的EXE SHA256与桌面包标识一致。公开下载/更新文件已就绪，不代表本机已代安装、客户端真实更新链路或功能验收通过。标签之后main补公开状态与README说明，产品代码和安装包不变。

多次Git TLS失败与CLI GraphQL/REST握手超时后，使用既有CLI权限创建与本地一致的tag对象/ref，Edge现有GitHub会话完成上传和发布。发布按钮观察超时后只重新读取结果，确认Latest、目标提交与附件，没有重复提交。Git外 `D:/deepseek-agent/.runtime/publish-0.10.29-20261021` 保留说明、校验清单、tag请求与发布实拍。未扩大仓库访问权限、飞书试点成员或服务器部署范围；未追加用户已拒绝的产品检查。既有GitHub CI由推送自动触发时仍需按实际结果判断，不声明已通过。
