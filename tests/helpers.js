/* 测试公共助手：静态服务器 / 浏览器 / 启动解锁 / 错误收集
 * 仅测试代码依赖 Node 与 Playwright；生产页面不依赖 Node。 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/kimi/.npm-global/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const FILE_URL = 'file://' + path.join(ROOT, 'index.html');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8',
};

/* 极简静态文件服务器（Node 原生实现，避免依赖 python）；端口占用时自动递增重试 */
function serveStatic(port = 8177) {
  const tryListen = p => new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const file = path.normalize(path.join(ROOT, u));
        if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found: ' + u); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    server.once('error', e => { if (e.code === 'EADDRINUSE' && p < 8200) resolve(tryListen(p + 1)); else reject(e); });
    server.listen(p, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${p}/index.html`, port: p, close: () => new Promise(r => server.close(r)),
    }));
  });
  return tryListen(port);
}

let _browser = null;
async function browser() {
  if (!_browser) _browser = await chromium.launch({
    // 沙箱环境 /dev/shm 仅 64M，需改用 /tmp 避免 renderer 崩溃
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  return _browser;
}
async function closeBrowser() { if (_browser) { await _browser.close(); _browser = null; } }

/* 打开一个全新上下文页面，并收集未捕获异常与 console.error */
async function newPage(url, { viewport = { width: 1440, height: 900 } } = {}) {
  const b = await browser();
  const ctx = await b.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      // 忽略 favicon/资源 404 的网络层噪音（另有资源完整性专项测试）
      if (/Failed to load resource/i.test(t)) return;
      errors.push('[console.error] ' + t);
    }
  });
  await page.goto(url);
  return { ctx, page, errors };
}

/* 等待开机完成并进入锁屏，然后解锁进入桌面 */
async function bootToLock(page) {
  await page.waitForSelector('#lockscreen:not(.hidden)', { timeout: 12000 });
}
async function unlock(page) {
  await bootToLock(page);
  await page.click('#lockscreen');
  await page.waitForSelector('#desktop:not(.hidden)', { timeout: 8000 });
  await page.waitForTimeout(200);
}

/* 在页面上下文打开应用并等待窗口出现 */
async function openApp(page, appId, args) {
  await page.evaluate(([id, a]) => window.Apps.open(id, a), [appId, args || null]);
  await page.waitForSelector(`.window`, { timeout: 5000 });
  await page.waitForTimeout(120);
}

/* 关闭当前活动窗口（点红灯） */
async function closeActiveWindow(page) {
  await page.evaluate(() => { const w = window.WM.activeWin; if (w) window.WM.close(w); });
}

/* 读取窗口状态 */
const winCount = page => page.evaluate(() => window.WM.windows.length);
const winTitles = page => page.evaluate(() => window.WM.windows.map(w => w.appId + ':' + w.title));

module.exports = {
  ROOT, FILE_URL, serveStatic, browser, closeBrowser, newPage,
  bootToLock, unlock, openApp, closeActiveWindow, winCount, winTitles,
};
