# AcceptCat 0.10.106 发布回执

北京时间2026-11-14 01:28:43，Windows 0.10.106 已公开并设为Latest。[Release](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.106)，固定tag为main/0fff9b693e4ae8463d15e96dd51884329ad3ac89。

PR213/3f48884四项检查成功，以7abfd5a普通合并；发布PR214/565cc35四项检查成功，以0fff9b6普通合并。构建自受审版本提交，Git树与最终main完全一致，核对1747份输入及EXE内135份构建资源。平台助理从聊天、规划和评审反馈归纳表达与工作习惯，私聊和规划可复用，纠正可修订，群内按发言人与群隔离。学习异步调用用户配置模型，产生额外用量，真实模型效果待验收。

本地安装包在本工作目录clients/openim/release/Base/0.10.106/AcceptCat_0.10.106.exe，桌面副本C:/Users/luo/Desktop/AcceptCat_0.10.106.exe，421242186字节，SHA256为942638cb0b0fd3362e6b832380855eb2c22d002e6bdca963df54b74e0977559e。四个公开附件大小和GitHub digest均与本地一致。实际EXE、原DSH/插件/截图/任务/资料、本地缓存载荷和新交流习惯界面核验通过；更新清单、隔离成品启动、禁网跨进程缓存和客户端类型检查通过。原根CI958项通过。未代安装或用真实账号/模型验收。

后台公网ready实测0.46.0三项ok，上一批部署回执记录035。本批因电脑锁屏阻止进入Workbench，尚未备份、运行036或改变生产容器；反馈学习尚未上线。已准备完整链部署脚本、静止备份、恢复副本两次迁移及所有旧表/原件摘要保全核验。036后旧035镜像无法通过严格迁移校验，故障优先兼容前滚。

失败记录包括pnpm无TTY中止后CI模式重试成功、gh短SHA合并参数拒绝后完整SHA成功、切换main造成发布文档CRLF变化后核对Git树一致并重做成品审计。证据目录D:/deepseek-agent/.runtime/release-0.10.106-20261114，含windows-build-attempt1.log、installer-main-audit-attempt1.log、installer-audit.json、desktop-copy.json、release-public-verified.json等。未覆盖旧版本附件。
