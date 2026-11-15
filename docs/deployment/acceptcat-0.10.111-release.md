# AcceptCat 0.10.111 正式发布回执

工作台可从聊天、任务和团队资料入口接续对应任务会话，同时带入已核实的讨论、资料版本和允许使用的个人习惯。科研编辑与文件工作副本继续由内置 dsh-research-workbench 0.4.0 提供。

[PR #225](https://github.com/luoyan96/personal-agent/pull/225) 四项检查通过。正式构建与标签指向 f2f4dd7bd6bdbebb8f203cd621a6324698bf3086，合并提交 b3c3f5bbe5e8b3d7286e74a33f29339db8f20068 与构建提交的源码树一致。

试用批次通过 996 项仓库测试、653 项桌面回归、21 项浏览器检查和 23 项插件测试。正式复核修正两处 Windows 短路径测试断言。最终构建通过三组 Foundation CI、Windows 打包检查、本地隔离启动、更新清单核对和成品运行时会话测试。隔离测试使用替代模型，用户日常 Office/WPS 编辑仍待实机试用。

从 EXE 逐一核验 137 项编译资源。桌面副本 C:\Users\luo\Desktop\AcceptCat_0.10.111.exe，421274889 字节，SHA256 `46b9382160b7e4d2b79fd911b477383466de1386975dcf50e5365ef025c575e6`。四个发布附件的 GitHub 摘要与本地相同。

[公开 Release](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.111)。后台沿用 0.49/039。本机证据目录 D:/deepseek-agent/.runtime/release-0.10.111-20261115 保留打包、首轮失败、最终检查和公开附件核验记录。
