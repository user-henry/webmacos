# macos-web 当前行为清单（修改前基线）

> 建立时间：2026-07-16。本文档记录在第二阶段修复开始前，对全部源码（index.html + 5 CSS + 9 JS，共 6087 行）通读后确认的当前行为与缺陷根因。每项缺陷标注精确位置。

## 架构基线
- 纯静态多页签式单页：`index.html` 依次加载 `util → fs → wm → system → apps → apps2 → settings → apps3 → main`，无构建链、无框架，支持 `file://` 直开。
- 全局对象：`$ $$ el esc clamp debounce uid Bus Store`（util.js）；`FS`（fs.js）；`WM UI`（wm.js）；`Sys Notify Spotlight WALLPAPERS DEFAULT_SETTINGS`（system.js）；`Apps stdMenus`（apps.js）+ 各 App；`SettingsApp`；`Launchpad AppStoreApp WeatherApp ClockApp ContactsApp QT_VIDEOS MUSIC_TRACKS`（apps3.js）。
- 窗口对象字段：`{id, appId, app, title, icon, rect, prevRect, minW, minH, state, onClose, data, noResize, el, body, titleEl, timers[], appState, confirmClose?}`。
- 持久化：localStorage 前缀 `macos-web:`，键包括 `fs / settings / notifs / desktop-icons / notes / calendar / clock / weather / reminders / contacts / stickies / mail / messages / safari-favs / appstore-installed`。
- 应用注册：`Apps.register({id,name,icon,w,h,minW,minH,singleton,storeApp,menus(win),render(win,args),onArgs})`；`storeApp` 共 8 个（bear/typora/vscode/keynote/podcasts/news/github/tv），需 App Store 安装。

## 缺陷根因清单（与任务书编号对应）

### ① WM.close 重入（js/wm.js:93-116）
- `close(win)` 无 closing 守卫：`confirmClose` 挂起期间或 150ms 关闭动画期间再次调用会重复进入。
- `doClose` 内 `this.windows.splice(this.windows.indexOf(win), 1)`：若窗口已被移出，`indexOf` 返回 -1，`splice(-1,1)` 会误删数组末尾的另一个窗口（实测：连续两次关闭计算器会连带删掉备忘录窗口）。
- 无 Promise 化，调用方无法等待/区分结果。

### ② 锁屏/睡眠/注销/重启/关机（js/system.js:126-215）
- `showLock()`、`sleep()`、`powerOff()`、`restart()` 均执行 `WM.windows.slice().forEach(w => WM.close(w))`：锁屏/睡眠即销毁全部窗口与未保存内容。
- `powerOff()/restart()` 只确认一次系统级对话框，不等待各窗口 `confirmClose`（文本编辑的存储确认），用户取消脏文档确认也无法中止关机。
- 锁屏前不关闭菜单/控制中心/通知中心/Spotlight/Launchpad 浮层。
- `logout()` 直接 `showLock()`，同样关窗。

### ③ 首次打开 App 菜单失效（js/system.js:377-416 + js/apps.js:42-102）
- `Apps.open` 顺序：`WM.openWindow`（内部 `focus → wm:focus → Sys.setActiveApp → app.menus(win)`，此时 `win.appState===undefined`）→ 之后 `app.render(win)` 才创建 `appState`。
- 各 App 的 `menus(win)` 在调用时刻捕获 `st = win?.appState`（undefined），`disabled/checked/action` 全部固化为无状态值且永不重算 → 首次打开文本编辑，"文件→保存"不响应；Finder 选择变化后菜单项状态不更新。

### ④ Finder 历史记录（js/apps.js:142-147, 338-339, 353）
- `history` 保存"之前的路径"而非完整访问序列，`hi` 语义混乱；连续后退两步后前进会回到错误路径（Desktop→Documents→Downloads，退两步再前进一步仍停在 Desktop）。
- 后退/前进经 `navigate(p,false)` 虽不写历史，但 `render()` 末尾 `if (args.path) st.navigate(args.path)` 会向历史写入重复路径。

### ⑤ Finder 选择渲染（js/apps.js:263-336）
- 单击项目、点空白、右键、⌘A 均调用 `renderList()` → `content.innerHTML=''` 全量重建 DOM；真实双击的第二次点击落在被替换的节点上，双击进入文件夹/打开文件不稳定；重命名输入框、拖拽、Shift/Cmd 多选互相打断。

### ⑥ 桌面重绘（js/main.js:157-162）
- `fs:changed` 监听两个分支都调 `Sys.renderDesktopIcons()`：任何目录（文稿/备忘录/邮件无关操作不触发 fs，但 Documents 写入）都会重建桌面图标，打断拖动与重命名。
- 在 Finder 中重命名桌面项目时，`desktop-icons` Store 中的位置键不同步 → 图标位置丢失。

### ⑦ 终端（js/apps.js:408-451）
- 无 tokenizer：`split(/\s+/)`，`cd "~/Desktop/Sample Folder"`、`cd ~/Desktop/'Sample Folder'` 均失败。
- `mv` 实现是嵌套三元表达式：目标为不存在的文件路径时会执行 IIFE（move+rename）后再执行一次外层 `FS.move` → 源被移动两次，第二次抛错，成功操作也输出错误。
- `cp` 目标为文件路径时只复制到其父目录，丢失目标文件名。
- `rm` 不区分 `-r`，目录可被直接 `rm` 删除；`touch` 不更新已存在文件的 mtime；部分错误输出两次。

### ⑧ App Store 安装模型（js/fs.js:38-47, js/apps3.js:20-23, js/system.js:781-783）
- `FS.syncApps()` 把全部 32 个注册应用（含未安装的 storeApp）写入 `/Applications`。
- Launchpad 已按 `storeApp && !isInstalled` 过滤，但 Spotlight 未过滤；`/Applications` 目录中提前出现的 `.app` 可通过 Finder/Spotlight 绕过安装拦截打开。
- 旧 localStorage 已被污染的 `fs` 数据无迁移清理；`assets/icons/tv.png` 缺失（Apple TV 图标回退为 ❓）。

### ⑨ 通知（js/system.js:666-724, 12-27, js/settings.js:77-88）
- `DEFAULT_SETTINGS` 无 `notificationsEnabled`；存在 `notifAllow:{}` 但 `Notify.send` 不读取；设置面板的开关写 `S._notifGlobal / S['notif_'+id]`，与 Notify 完全未接线 → 通知开关无一生效。
- `banner()` 调 `markReadLater(id)`：横幅自然消失 6 秒后自动已读、徽标清零。
- 专注模式无"闹钟突破"通道。
- `send/markRead/remove/clearAll` 均 `Sys.renderDock()` 全量重建 Dock（打断悬停放大动画）。
- 通知中心无 Esc / 点外关闭。

### ⑩ 媒体注册与音量（js/system.js:104, js/apps2.js:104-115/209-217, js/apps3.js:1450-1456/1528-1546）
- `registerMedia` 监听 `emptied` 事件自动从集合删除：QuickTime/TV 切换 `<source>`（`innerHTML` 重写 + `load()`）会触发 `emptied` → 视频脱离全局音量控制。
- 无 `unregisterMedia`；音乐/QT 在 `onClose` 里直接 `Sys.mediaEls.delete(...)`，播客/TV 未注销（泄漏）。
- 音乐/QuickTime 的 App 内音量滑块只写 `audio.volume/video.volume`，与全局 `Sys.settings.volume` 两套状态互相覆盖。

### ⑪ 预览（js/apps2.js:272-334）
- `if (!st.path)` 判断在 `args.asset` 之前：`Apps.open('preview', {asset, name})` 因 `path` 为空进入画廊分支并 `return`，`asset` 永远丢失；画廊缩略图点击再次 `Apps.open('preview', {asset...})` → 无限打开画廊窗口，永远看不到大图。

### ⑫ 日期与时区（js/apps.js:692,709,718, js/apps3.js:596,648-670,783, js/settings.js:147-156）
- 日历 `sel`/`goToday`/`todayStr`、提醒事项默认 `due` 使用 `toISOString().slice(0,10)`（UTC 日期）：本地时间上午 8 点前后"今天"会错位一天。
- 世界时钟 `cityTZ` 为固定 UTC 偏移（伦敦恒 0、纽约恒 -5），不处理夏令时。
- 设置的"日期与时间"面板时区下拉无 change 处理、不保存、不影响任何时钟。

### ⑬ 秒表与计时器（js/apps3.js:621-761）
- `go(tab)` 重建 `content.innerHTML`：秒表运行中切走再切回，按钮文字、计次列表、当前值全部重置（状态在 `st.sw` 但 UI 不恢复）；计时器同理丢失进度环与按钮状态。
- 500ms interval 只在 `st.tab` 匹配时 tick：计时器运行中切到其他标签，到点不触发通知；补发逻辑与 `_timerTick` 闭包绑定旧 DOM。
- 计时结束通知无去重标记；窗口关闭即停止计时且无任何提示。

### ⑭ 系统设置（js/settings.js 全文）
- 开关接线不一致：`toggle()` 工厂有完整 aria，但登录项/程序坞/锁定屏幕面板内手写的 `.switch` 只有 click，无 `role/tabindex/aria-checked/键盘`。
- Wi-Fi 已知网络、蓝牙设备的"已连接"状态不持久化；键盘/鼠标滑块不保存；时区不保存（见⑫）；VPN/防火墙/共享/触控板/打印机/触控 ID/控制中心模块等无法影响模拟器的选项未标注"模拟"。
- 搜索仅过滤侧栏（可接受，点击条目可进入对应 pane，将回归验证）。

### ⑮ 响应式与窗口边界（js/wm.js:22-27,214-238,252-266, css/desktop.css:17, css/apps.css:37）
- `openWindow` 中 `clamp(opts.w, minW, u.w-20)`：当视口可用宽度小于 `minW` 时取到 `u.w-20`，但 `startResize` 仍按原始 `minW` 限制 → 小屏窗口被拖出视口。
- 仅 `max-width:1100px` 一档媒体查询；768×1024 下邮件三栏、设置侧栏、天气、信息、Finder 未折叠；Dock 在窄屏不缩小。
- `.desk-icon .di-name` 与 `.icon-view .fi-name` 使用 `word-break:break-all`：英文文件名在单词中间断行。

## 修改前行为确认方式
以上每一项均已通过对照源码确认；后续每修复一组，即在 `tests/cases/` 中新增/更新对应 Playwright 用例并运行（见 `tests/README.md` 的运行命令）。
