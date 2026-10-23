# Windows 0.10.36：共享包依赖与可重复构建修复

2026-10-23，北京时间。负责人提供同事对0.10.35构建环境、构建顺序与安装器问题的反馈。核对干净main、提交和远端并fetch后，从主仓库main **6c73af66cd7ba41bbee4c897415984fa8150e377**另开 **fix/desktop-build-reproducibility**。受打包源码 **62d73f61f7da123aac36f747fab13c0bb08a883d**，后续交付文档不改变成品。保留同事聊天、资料、课题组和已合并PR91功能。

## 已确认的问题与判断边界

- 原客户端两个共享依赖均为`file:../../packages/...`，安装位置为pnpm目录快照；新模块或重建后替换的输出可能未进入已安装目录。原CONTRIBUTING只要求构建contracts，遗漏research-skills及其Electron使用的`dist/import.cjs`。
- 原Windows构建入口不自动构建这两个共享包，未在成品中阻断缺失的CommonJS入口。原Foundation CI只检查根工程，不构建Windows客户端；它通过不能证明安装包依赖完整。
- 原环境实际Electron22.3.27、builder/app-builder-lib23.6.0；没有证据证明当前组件混用，也未复现NSIS“无法关闭”循环。`--force`会重新安装/刷新依赖，但不能据此确认该安装器问题的唯一根因。旧暂存目录实际已有import.cjs，也不足以证明旧安装器内容正常。
- 用户附件0.10.35为87,439,273字节，SHA256 `c0f9c5743a37c994efb54213ca96bb0409554284e64160ee8bb60f6bb9ab2ebd`；原桌面交付为87,409,212字节，SHA256 `c575ba661e12d3548a9262f8fa91a630dabe0b7318cac94c90a4c0a89dfebe1c`。二者不同，附件是成功重建还是故障版本尚待负责人说明。本批未执行或提取旧安装器，保留两文件。

pnpm语义参考官方[link说明](https://pnpm.io/10.x/cli/link)和[install/force说明](https://pnpm.io/10.x/cli/install)。本修复依据实际目录和构建路径，不声称所有`file:`内容修改都必然不刷新。

## 修复范围

根入口`corepack pnpm@11.21.0 run desktop:win`按根冻结安装、两个共享包构建、客户端冻结安装、校验及Windows打包执行；`desktop:prepare`只准备环境。显式选择根pnpm11.21.0/客户端10.28.0，避免从根使用`--dir`仍选到根版本。客户端Web/Electron入口再次确保两包当前产物存在，守卫新增契约模块、CommonJS导入和内置Skill文本。

客户端依赖改为`link:`直连本仓库输出，根冻结安装负责链接包自身依赖；运行装配复制共享包manifest/dist/README与实际运行依赖，生成精确版本的独立manifest，不把开发链接、源码或其node_modules带入成品。仅调整本地依赖及锁文件对应记录，固定现有Electron22.3.27/builder23.6.0，没有升级第三方解析版本。打包前检查builder内部精确依赖，装配后验证入口不逃出目录，Windows构建完成后实际核对app.asar中的HTML、主进程、Skill CJS及YAML共4个入口。

客户端上游Husky仅在它自身为独立Git仓库时安装hooks，嵌入主仓库及CI跳过，避免干净clone安装时寻找不存在的客户端`.git`。不跳过Electron/esbuild/koffi正常安装，也不修改主仓库hooks。SDK资源检查接入正式Electron构建入口。

新增`.github/workflows/desktop.yml`：Windows干净checkout执行冻结准备、双类型、构建守卫、NSIS、成品入口及更新清单核对，保存7天CI附件，`contents: read`、`--publish never`，不会创建公开Release。GitHub实际执行结果应另查回执；本机成功不代替新工作流已经成功。

本批不改业务接口/契约定义、数据库迁移、科研逻辑、Skill内容、聊天或权限。原共享包与科研API完整CI沿既有基线记录；未重复本地762项检查。

## 实际执行与失败保留

Windows/Node24.19.0，本机Git外证据 **D:/deepseek-agent/.runtime/desktop-build-20261023**。独立本地clone与主目录只共享Git对象；每次最初均无项目node_modules/共享dist，复用既有全局pnpm与Electron下载缓存，没有清空全局缓存或force安装。

1. 首次全新目录`clean`完整命令在客户端Husky“找不到.git”退出，保留`clean-build.log`与目录；修正后提交525804c。
2. 第二个全新目录`clean-v2`完成前端、55运行包与NSIS，随后新ASAR守卫因Windows路径分隔符误报。保留`clean-v2-build.log`、失败状态及`attempt-v2-artifacts`；实际入口存在，不将误报当成包缺失。
3. 修正守卫使用本机路径分隔符并补嵌套路径测试，提交62d73f6。在同一隔离目录普通快进后复跑根完整`desktop:win`，最终退出0，`clean-v2-final.log`与`.exit`留存。该最终复跑已有项目依赖，不称“干净clone第一次一次成功”。
4. 最终隔离目录renderer与Electron类型检查通过；13项检查通过（8构建守卫、2 service、3 auth），覆盖同版本旧快照、新增模块/CJS缺失、旧Skill文本、builder混用、运行文件越界、真实ASAR嵌套/缺失入口、命令参数和Husky。记录`clean-client-types.log`、`clean-electron-types.log`、`clean-client-tests.log`。
5. 生产Web及4份SDK资源、55独立运行包、NSIS、成品ASAR4入口通过；更新清单版本/大小/SHA512、blockmap和公开更新源配置通过。暂存CJS在宿主Node下实际加载通过，不能代替Electron22原生启动。记录`installer-update-check.json`、`archive-path-diagnostic.log`和`commonjs-load.json`。

未代安装或原生启动，未进行真实账号、用户材料、真实模型、界面/双机联网或安装后验收；未复现NSIS关闭循环，不能说已验证其消失。原用户验收安排保持。最终文档按仓库要求执行内容与diff检查，结果见本批日志。

## 本机交付及部署/发布状态

| 项目 | 实际状态 |
| --- | --- |
| 桌面安装包 | `C:/Users/luo/Desktop/AcceptCat_0.10.36.exe` |
| 大小 | 87,411,073字节 |
| SHA256 | `16bb950c2741c5b9037576b573b8770875398e2af883ea20bf2437f8c9a9eeca` |
| 源码 | 62d73f61f7da123aac36f747fab13c0bb08a883d，独立修复分支 |
| 本机证据 | Git外desktop-build-20261023，含原失败/最终复跑、哈希与delivery.json |
| main | [PR93](https://github.com/luoyan96/personal-agent/pull/93)已提交/挂接，开放、无冲突，尚未合并 |
| 公开Release | 重新读取Latest仍[v0.10.34](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.34)，0.10.36未公开发布 |
| 后台 | 沿已部署0.30/schema026/2677f693记录，本批未操作、重启、迁移或新增探测 |

复制桌面前确认新目标不存在，复制后核对SHA256一致，不覆盖0.10.35或用户附件。安装包/运行证据不进入Git。注册超时未定因、飞书本人试点、广场同步关闭及资料直连/NAT边界沿既有状态。

PR93创建后首次读回head ec8755b，三项Foundation与新Windows打包工作流均IN_PROGRESS，未结束不计通过；`pr93-initial.json`保留回执，后续状态以PR检查和相应head为准。公开安装包未上传，新工作流生成的是CI附件。
