# 同组本机资料互传：后台升级记录

2026-10-23（北京时间）。用户明确授权“后台可以升级”。本批部署 PR91 的配套 API/worker；没有合并 main、公开 Release、更换静态网页或代安装客户端。

## 实际版本

- 产品源码：`09ffb44053dacf32c7626fc75e7ec7fb8b2b25d0`，`feat/peer-local-library` / [PR91](https://github.com/luoyan96/personal-agent/pull/91)，仍未合并。
- 原生产镜像：`research-openim-api:lab-membership-20261022-v2` / `sha256:0212513c5e9d4109cba892462c4953f9c440e96dc13007178635aca6c58395fb`。
- 新生产镜像：`research-openim-api:peer-library-20261023` / `sha256:2677f6936ae5ff05c229a88a8a5c161c0f06570cb77096d57f60349d4304423c`。以原生产镜像为基础，叠加11份本次运行源码，保留既有运营种子等差异；不是将整个 Git 树覆盖到线上。
- 配对 API/worker：contract **0.30.0**、schema **026**；DSH **0.2.1-rc.2**、Cordis **4.0.5**保持。
- 正式迁移切换窗口：**08:49:02—08:49:23**（UTC 00:49:02—00:49:23）。这是最终成功切换窗口；此前一次副本检查失败后恢复旧服务，另有短暂停服，不能把21秒称为本批总中断时间。

数据库026仅新增 `peer_library_devices`、`peer_library_requests`、`peer_library_signals` 三表及索引。后台保存获准文件元数据、请求权限与WebRTC连接协商；原件由两端直接传输，不进入平台云资料库。能力及边界见[实现说明](../development/peer-local-library.md)。

## 构建和数据保全

先核对既有阿里云 Workbench 同一 ECS 会话、两容器实际镜像和健康状态、完整 Compose 叠加链及磁盘余量。离线构建使用既有依赖，无新增包；107份基线源码守卫、11份变更源码和164份规范化编译结果核对通过。Linux隔离网络下，资料互传、成员和飞书资料的 **37项/3文件**检查通过；账户、材料和HTTP均为合成数据，没有模型调用。

停止API入口，排空 execution/chat 后停止worker。一致备份、SHA256校验、独立恢复核对及副本026迁移通过，再迁移正式数据库。迁移前 **100张旧表**的结构和全行哈希、**7份原件**的内容/权限与旧001—025迁移历史逐份保持；新增3表后共 **103表**，integrity和外键检查正常。

**16份**既有配置/密钥文件在服务器内备份，哈希与权限保持；API/worker环境、挂载、端口、命令和重启策略保持，其他 **6个服务**的容器ID/镜像/状态不变。个人模型Key密文/默认值、飞书连接/资料源/私人范围和目录缓存保持；既有1个飞书库仍 `owner_private`。密钥、数据库、用户材料及完整逐表校验没有下载或提交Git。

正式备份：`/srv/research-openim-backups/peer-library-20261023-20261023T004905Z/research.tar.gz`，SHA256 **d305b1449e26f8741b9a473554a29ac5ec580c84a6f8c4a2af70e52d89a44553**。同目录保留配置输入副本/校验清单和独立恢复副本；仍是同ECS备份，不称异地备份或整栈灾备。

## 线上检查与首轮失败

正式启动后，两容器使用上述新镜像，running/restart0、API healthy；公网ready200，contract0.30.0，database/storage/authentication为ok，Harness仍 **not_verified**。原成员、飞书和模型接口及带有效合成设备标识的新请求接口，未登录均返回401。广场实际 `enabled=false / state=disabled / nextCheckAt=null`，缓存11条目录/19个候选保持；原提醒和科研调度配置保持。

首轮运维副本探测遗漏 `GET /peer-library/requests` 必填 `deviceId`，契约校验返回400，而脚本预期401。部署守卫在**正式迁移之前**中止并恢复旧025 API/worker，未还原数据库快照。保留首轮包/日志/备份，另建v2运维目录，补有效合成参数；先在原恢复副本复核ready/401及全部旧行/原件不变通过，再重新一致备份和正式升级。产品镜像不变，不以重复完整测试掩盖这次运维错误。

当前有效 Compose 在原47c42ac基础/production与private images、community/key-preview/feishu/harness/bitable/http400/library-sharing/lab-membership链末尾追加 `/opt/research-openim/ops/peer-library-20261023-v2/images.yaml`；原current指针和Nginx/静态网页保持。026产生新写入后，不能直接换回025旧镜像或回灌旧快照；保全新数据，前向修复或单独协调兼容恢复。脚本只允许在新服务尚未尝试启动时恢复停写数据库；本次正式迁移成功，没有触发该恢复分支。

## 交付范围和证据

服务器首轮证据 `/opt/research-openim/ops/peer-library-20261023`，最终 `/opt/research-openim/ops/peer-library-20261023-v2`（包含 `deployment-summary.json`）；本机Git外 `D:/deepseek-agent/.runtime/peer-library-20261023` 保留升级包、脚本、失败说明、脱敏摘要和截图。逐表/配置私密记录留在服务器。

客户端仍为已制作的 `C:/Users/luo/Desktop/AcceptCat_0.10.35.exe`，87,409,212字节，SHA256 `c575ba661e12d3548a9262f8fa91a630dabe0b7318cac94c90a4c0a89dfebe1c`，本批没有重打或代安装。公开Latest重新读取仍v0.10.34，PR91保持待审阅，无新标签/公开附件/更新源。

依用户安排，未追加浏览器产品、原生启动、安装载荷/安装后体验、真实用户/私人材料/模型或双设备WebRTC联网验收。双方须安装新客户端、运行并切换到同组；专用目录需本人授权。默认STUN、无TURN/云原件兜底，实际校园网/NAT直连仍待用户验证；注册超时根因和飞书本人试点边界没有变化。
