# AcceptCat 0.10.71 合并、后台与发布回执

负责人明确授权将两次修改一起合并、更新后台并发布新版。2026-10-29 **12:03:05（北京时间）**，整合 [PR137](https://github.com/luoyan96/personal-agent/pull/137) 普通合入 main/`081f418f28603224d5af2c5b712ca10304069f74`；PR135和PR136随之MERGED。合并树与受测head `a5746c6590f6798749452095ef61270f1a39e9ae` 一致，Linux Node22.19、Linux Node24、Windows Node24和Windows打包四项远端检查全成功。

## 功能与安装包

本地文件优先、按版本取用共享资料、明确范围后归档成果贯通；共享原件支持512 MiB与分块恢复，本地材料采用流式复制。DSH入口改为工作台，恢复原生Flash/Pro与Off/Low/High/Max菜单，继续使用AcceptCat账号。任务页面保持独立。详见[本地材料](../development/local-material-workflow.md)、[大文件](../development/large-originals.md)、[模型设置](../development/workbench-model-settings.md)。

安装器产品源码/发布标签为 `93d668a657793839db1442e025613e337a39f033`；至受审head只增加部署准备脚本，没有客户端运行代码变化。包内包含DSH0.2.1-rc.3完整固定发行树。版本、任务/材料IPC、原生账号模型配置、运行树、更新SHA512及隔离成品启动通过，未代安装用户客户端。

2026-10-29 **12:04:46（北京时间）**公开稳定Latest [v0.10.71](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.71)，Release ID **427450655**。四附件远端大小与SHA256逐项一致，匿名Latest、公开更新清单/校验文件及标签解析核验通过，旧版本保留。

| 附件 | 字节数 | SHA256 |
| --- | --- | --- |
| AcceptCat_0.10.71.exe | 366907501 | `8bbc634e3656037d539115906e72f8c2f6988a2d9d9d87513a8f8b52c42bdff3` |
| AcceptCat_0.10.71.exe.blockmap | 379892 | `19d03f2fa7b96708be3ab8a305a8d6fd94a338b6bacce0d2448d5845671567ef` |
| latest.yml | 341 | `2ccd9b36a894e9a97fdff6fcaec8a3c19e901b6dffa3c49d6079a4c4441f8aba` |
| SHA256SUMS.txt | 262 | `212fde202d2b0fa4a52edf762d4bec526646dd17af836b96e9a406917c3ce76c` |

## 后台更新

**12:03:21–12:03:46（北京时间）**完成API/worker配对更新，部署脚本退出0。旧镜像3162c814变为 `sha256:eccc1d9d1f7aa43ce197c314a6ea3bda0b2667ce7a74b46e861ad50056ef95b`，标签 `research-openim-api:materials-workbench-20261029`。后台产品来自 `1a10529c44041dcfe2d5fa22a471f3632b72b569`，与安装器产品相比只有部署脚本差异；后来摘要校准改动也仅在部署工具内。contract **0.38.0**，schema **030**，**无数据库迁移**。云端DSH rc.2与Windows内置rc.3仍分别管理。

沿用实际生产镜像和完整Compose叠加链，仅覆盖8份必要源码/契约文件，394份基线文件保全。排空队列、停止API/worker后备份，恢复副本的完整性、外键、新接口及原行为检查通过，再启动新服务；111张表、9个原件、30份配置/密钥输入及资料范围逐项保全，其余6服务不变，目录自动同步继续禁用。凭据与私人材料只在服务器核验，没有下载。

- 部署目录：`/opt/research-openim/ops/materials-workbench-20261029`。
- 静止备份：`/srv/research-openim-backups/materials-workbench-20261029-20261029T040324Z/research.tar.gz`。
- 备份SHA256：`51eef6118c96268a8125e3740d6caffba3363f085a8b5394bff840da2339874a`。
- 上线复查：API healthy、worker running，同镜像、重启均0；公网ready为0.38、数据库/存储/认证ok，新上传接口及旧资料接口匿名401。worker无独立健康探针，ready的harness仍not_verified。

如已产生大原件，不能直接回切不能解析大元数据的0.37业务镜像。保留0.38的资料读取与分块兼容逻辑前滚修复，不用部署前数据库覆盖新写入。部署脚本在新API启动后失败时保留/重启新镜像；尚未启动新API的阶段才允许恢复旧服务。没有在生产执行回退演习；本机备份恢复已验证，不等于异地灾备。

## 检查与失败记录

整合后根CI862项/68文件、生产3项/B0/Web、客户端37项DSH/材料/团队加14项资料下载/服务/账号检查、双类型通过。NSIS、包内入口/固定DSH树、原生模型配置、更新守卫、隔离成品启动通过。服务器实际新镜像另有26项/4文件隔离检查通过。前批真实DSH加合成模型、300 MiB实际HTTP原件流转等证据继续保留；不将其称为私人PPT内容、付费模型或多人真机验收。

PR135最初的Windows打包失败是短路径和规范路径的测试字符串比较，改为实际解析路径后37项和远端完整打包通过。部署准备曾因重复传输造成源码压缩包校验失败，停止传输后在独立目录重新下载并通过gzip校验；基线守卫随后拒绝历史编译摘要，按固定生产镜像及一致的换行规范校准后通过，源码摘要约束保持。失败均在正式切换前，未操作生产数据库。包内检查首次沿用旧“资料与成果”标签失败，核对新源代码后按“文件与归档”和新增IPC校验通过。既有electron-log重复initialize警告保留。

Git外证据：`D:/deepseek-agent/.runtime/release-0.10.71-20261029`，含CI、检查/合并快照、成品检查、部署截图、公网与Release回执及完整安装器。服务器保留备份、配置保全、源文件核验、隔离测试及正式部署日志。用户正在使用的客户端及原桌面开发目录未修改。
