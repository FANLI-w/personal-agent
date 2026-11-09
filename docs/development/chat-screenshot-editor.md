# 聊天截图基本编辑器

2026-11-09，负责人要求参考微信及本机Snipaste的基本操作，同批追加至PR187。旧的聊天内预览弹窗由独立桌面覆盖层替代。

## 已实现

- 点击截图或在AcceptCat聊天窗口按F2：先抓取当前可见屏幕，再打开该显示器上的无边框覆盖层，不隐藏AcceptCat。可切换所抓屏幕的画面。
- 鼠标框选，选区外变暗；工具栏跟随选区并避免越过屏幕边缘。可重新框选。
- 圆圈、方框、箭头、画笔，默认红色，可选颜色；撤销或Ctrl+Z移除上一笔标注。标注会绘入导出PNG。
- ✓或Enter完成：裁出选区，写入系统图片剪贴板，并返回聊天输入框作为待发送图片；不会直接发送。
- ×或Esc取消：返回空结果，不复制、不暂存、不发送；切换聊天/账号或窗口失效同样取消，延迟返回的抓屏结果不能再打开编辑器。

F2只在聊天页面获得焦点时生效，不注册系统全局F2，不接管Windows文件重命名或其他截图软件快捷键。没有实现窗口自动吸附、马赛克、文字标注、贴图等完整Snipaste功能；多屏混合DPI和真实安装体验待验收。

## 实现和边界

不运行或集成本机Snipaste.exe，不读取其history/crashes/splog。目录中没有源码/说明，config.ini仅为少量运行偏好，未修改。此次自行实现基本交互，没有复制第三方二进制或库。

原单次抓屏权限、15秒期限和大小检查保持。编辑器有5分钟取消期限，使用独立BrowserWindow、sandbox、contextIsolation、禁用Node和网络、独立内存session。preload仅暴露完成/取消接口；只有活动编辑器的主frame可提交。完成前再次核对原窗口权限和身份，检查PNG格式、10MiB与像素大小后才复制；外部窗口、子frame和过期结果均拒绝。图片只在内存流转，不自动落盘。

新增editChatScreenshot/cancelChatScreenshot，原captureChatScreens保留为抓屏底层接口。移除已替代的旧Modal框选/裁剪路径。新preload、主进程编辑器和HTML生成模块加入runtimeEntryFiles守卫，防止打包漏带。

## 验证

- renderer/Electron类型检查、build:web通过；实际产物包含preload/screenshotEditor.js、main/screenshotEditorManage.js和utils/screenshotEditorHtml.js，完整dist和4个SDK资源检查通过。
- 截图、编辑器权限/取消、preload/main权限与构建守卫共25项检查通过。新增覆盖外部窗口/子frame拒绝、取消不复制、身份变化拒绝、抓屏未完成即取消不打开迟到覆盖层、并发拒绝和隔离窗口配置。
- 用实际生成的HTML在现有Playwright/headless Edge运行，合成画面1280×800及1024×768验证框选、圆圈、箭头、撤销、完成与Esc；750×480选区导出同尺寸，PNG中检测到红色标注像素，窄屏工具栏不越界，页面异常0。
- 实际ScreenshotAction/ImagePasteTray组件验证F2触发后暂存而不发送、取消不暂存、切会话取消未完成编辑、截图按钮恢复可用。Browser插件/browser skill未列出，按前端检查指引使用现有Playwright。

Electron窗口、屏幕来源、剪贴板和API/SDK在上述测试中为合成边界；没有截取负责人私人桌面、读写其系统剪贴板或运行已安装AcceptCat。原生Windows覆盖层、系统剪贴板和真实DPI体验须随新安装包验收，不以类型/构建或Headless结果代替。

Git外证据D:/deepseek-agent/.runtime/screenshot-editor-20261109：unit.log、build.log、ui-result.json、f2-result.json、selection-annotations.png、selection-narrow.png与检查脚本。首次新增VM夹具的node:path默认导出模拟错误导致4项失败，修正模拟后25项通过；产品模块类型检查无此错误。首次重启UI宿主遇原测试子进程仍占4397，现有宿主已重新编译同一输出，F2检查在该宿主通过；收尾只清理本任务宿主。既有Node模块类型/Tailwind/构建提示保留。

没有后台/契约/迁移/模型提示词变动，未合并、打包或发布；现有0.10.97安装包没有本批截图编辑器。
