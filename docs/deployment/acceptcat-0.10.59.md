# AcceptCat 0.10.59 群聊修复候选

2026-10-26。产品及打包源码 **db11a6d7429db1f5a2060b2fd4293eac61719a61**，[PR120](https://github.com/luoyan96/personal-agent/pull/120)待审。当前批次在fix/group-agent-mentions-and-visibility，从fetch后的main/c3f7d0f新建，普通merge保留PR119及其PR118图片操作依赖，未改main。

同时@多个已入群本地助手、按助手显示群内公开状态；当前群名单含没有加入自己通讯录的同事助手。私有请求详情不共享，已有材料ACL保持。新普通请求预算为每助手16000tokens/90秒，总额最多5份并均分；历史/显式请求与重试预算保持。详见[设计与边界](../development/group-agent-mentions-and-visibility.md)。

## 配套后台

本批新增agentContactIds/可选turns、会话成员公开档案与群内公开状态接口，**contract0.34.0/schema027**。旧单助手发送兼容，新客户端群聊功能需要配套后台。没有数据库结构、密钥或用户材料变更；不能只安装客户端就宣称群聊修复已在线生效。

负责人本轮明确授权升级。**2026-10-26 19:47:04–19:47:26（北京时间）**，API/worker成对从7720ec9b切换到 **research-openim-api:group-agent-mentions-20261026**，镜像 **sha256:63d87995f6ba84595aadf79fe44562d736685e4515beaeb2e5ed04fadee2d4bb**。部署产品 **db11a6d7429db1f5a2060b2fd4293eac61719a61**，**contract0.34.0/schema027**，没有执行数据库迁移。API healthy、worker running、restartCount均为0；公网ready返回0.34/ok，数据库、存储和认证检查正常。没有执行真实模型探测（harness仍not_verified）。

先核对原镜像和完整compose组合，原服务运行时构建隔离镜像并完成93项/8文件无网络合成回归；然后停API、排空请求并停worker，备份并恢复复制库，比较104表和8个原文件的数量/摘要与完整性。恢复库HTTP ready及受保护端点401通过，检查后复制库/启动前运行库均与快照一致。25份配置/密钥输入、API/worker设置和其他6个服务保持，资料集合范围及飞书连接保持，广场同步仍disabled/nextCheckAt=null。备份 **/srv/research-openim-backups/group-agent-mentions-20261026-20261026T114706Z/research.tar.gz**，SHA256 **6abdf06ab898eb7bb34889dae58a94fa1eb434eb6293c97c1f1300c9699b6bf2**。

运维目录 **/opt/research-openim/ops/group-agent-mentions-20261026**，本轮images.yaml追加在task-flow-safe-recovery组合之后。未执行rollback；需要回退时使用原7720ec9b镜像和原完整compose组合，当前数据仍是schema027，不能用旧备份覆盖后续业务写入。

## 检查与交付进度

定向API/契约10项通过；客户端提及、状态、待发恢复和传输35项/5文件通过，renderer/Electron双类型通过。根冻结完整CI（819项/64文件、共享类型与contract0.34、2项生产CLI/HTTP、B0及Web边界）通过，根desktop:win冻结Windows构建、NSIS、既有4项成品入口及更新元数据检查通过（publish never），未代安装器、真实模型、产品UI、私人材料或额外原生验收。

首轮新增测试遗漏同实验室旧群仍需主人单独接受Agent邀请、SQL误用origin物理列、CHAT1端点数量误计，修正合成夹具和断言后通过；首轮renderer响应联合类型未显式声明可选turns，调整类型后通过。首轮完整CI仅Web契约版本断言仍为0.33而失败（818通过/1失败），同步到0.34后重新完整CI通过。原失败日志保留在Git外 **D:/deepseek-agent/.runtime/group-agent-mentions-20261026**，不能当作通过证据。

公开Latest已核对仍v0.10.56；v0.10.59不存在。本批未公开Release、上传Release资产或合main。桌面 **C:/Users/luo/Desktop/AcceptCat_0.10.59.exe**，**88,221,597字节**，SHA256 **9bcba06540bb11256e3c097a53515e725856cbe066a6599519f240cd31c304c5**，与构建目录一致，旧0.10.57/58保留。没有实际安装或自动更新公开。PR120待审，不能把本机包当作Release。

后台完整Git源码归档仍保留；实际上传191207字节运维包，以固定旧生产镜像做129份受控源码覆盖并重编译，565份基线源码和191份编译产物对照通过，保留生产catalog seed。18个角色、38份旧默认精确映射、19个方法及角色digest120edc86均核对。第一次上传NoSuchKey，刷新并恢复既有连接后成功，未在传输失败时停写。首次隔离86项通过、1个suite因运维包遗漏external-wire和synthetic-external-tls两份支持文件而未加载；补传4210字节支持包、逐份摘要校验后完整8文件重跑93项通过。原preparation/isolated-tests/build/source-check等attempt1证据保留在服务器。没有改产品源码或掩盖失败。

PR120/3c1f166已核对三项foundation和Windows package全绿。首次Windows CI的5项失败来自服务状态夹具未登记图片IPC，已补齐并将本批群聊回归接入CI，整组88项/13文件通过。之后只有测试/工作流/文档变化，未重复根完整CI或重打db11a6d产品安装包。

Git外deployment-receipt.server.json与服务器回执逐字节一致（5121字节，SHA256 0d84349b9e87ff42b14e258eea6cd3f8fd8ae7c524c783652256f1df247766e2），另有public-ready.json、receipt-copy-verification.json、ci-test-fix-success.json及deployment-success.png。没有登录客户账号或代验真实模型、实际群聊与安装体验。
