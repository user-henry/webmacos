# macos-web 回归测试

可复现的 Playwright 端到端测试。**生产页面不依赖 Node**；仅测试代码依赖 Node 与 Playwright。

## 环境要求

- Node.js ≥ 18
- Playwright（本环境为全局安装：`/home/kimi/.npm-global/lib/node_modules/playwright`，helpers.js 按此绝对路径 require；如安装位置不同请修改 helpers.js 第 9 行）
- Chromium（`npx playwright install chromium`）

## 运行

```bash
cd macos-web

# 全部用例（16 组）
node tests/run.js

# 按名称/标题过滤，例如：
node tests/run.js 07        # 只跑 07-notify
node tests/run.js 锁屏      # 按标题关键字过滤
```

测试自带静态文件服务器（端口 8177，占用时自动递增），HTTP 与 file:// 两种冷启动均覆盖；每个用例独立浏览器上下文（localStorage 隔离）。

## 用例清单（对应修复任务书编号）

| 文件 | 覆盖 |
|---|---|
| 01-boot | file:// / HTTP 冷启动到锁屏并解锁；控制台无未捕获异常（任务书测试 1/2/3） |
| 02-wm-close | ①WM.close 重入不连删、confirmClose 防重入、取消保留；②锁屏/睡眠保留窗口与内容、关机脏文档确认可中止（任务书测试 7/8） |
| 03-menus | ③首次打开 App 菜单可用；选择变化后重开菜单状态同步 |
| 04-finder | ④历史前进后退/index 语义；⑤双击进入/打开、Cmd/Shift 多选、重命名、复制移动、废纸篓还原；⑥桌面重绘限制（任务书测试 4） |
| 05-terminal | ⑦引号/转义 tokenizer、cp/mv 目标语义、rm -r、touch mtime、错误不重复 |
| 06-appstore | ⑧安装前三处不可见、安装后出现、旧数据迁移不删用户文件、tv.png（任务书测试 9） |
| 07-notify | ⑨总开关/App 开关/专注模式/未读语义/Dock 局部更新/Esc 与点外关闭（任务书测试 10） |
| 08-media | ⑩切源后全局音量仍生效、关闭注销、App 内滑块与全局一致（任务书测试 11） |
| 09-preview | ⑪画廊点击开大图、无无限画廊、标题/缩放/alt/加载错误（任务书测试 12） |
| 10-datetime | ⑫localDateKey、世界时钟 IANA 夏令时、时区设置保存生效 |
| 11-clock | ⑬秒表/计时器跨标签恢复、endAt 唯一基准、只通知一次、关闭前提示（任务书测试 13） |
| 12-settings | ⑭全部 pane 无异常加载、模拟状态持久化恢复、switch 完整 aria、搜索可达 |
| 13-responsive | ⑮四视口截图（tests/shots/）、窗口不越界、Dock 收窄、英文不断行（任务书测试 15） |
| 14-textedit | 文本编辑保存/另存为/取消关闭不落盘/跨 App 同步（任务书测试 5） |
| 15-persistence | 刷新后文件/图标位置/主题/便笺恢复；localStorage 损坏回退（任务书测试 14） |
| 16-assets | 本地 assets 引用缺失数 = 0（任务书测试 16） |

## 注意

- headless Chromium 无 H.264 解码，视频用例依赖 WebM 回退源。
- `evaluate` 调用会 await 返回的 Promise：对会弹出对话框的 API（如 `WM.close`、`Sys.powerOff`、`appState.save`），测试中必须以语句形式调用（`() => { ... }`），不可直接返回其 Promise，否则 Playwright 会挂起等待用户点击。
