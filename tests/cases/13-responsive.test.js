'use strict';
/* ⑮ 响应式（任务书测试 15：四种视口截图 + 窗口边界） */
const fs = require('fs');
const path = require('path');
module.exports = {
  name: '13-responsive',
  title: '2048×1152/1440×900/1100×700/768×1024 四视口无溢出、窗口不越界、英文名不断行',
  async run({ t, track, newPage, unlock, http, ROOT }) {
    const shotsDir = path.join(ROOT, 'tests', 'shots');
    fs.mkdirSync(shotsDir, { recursive: true });
    const VIEWPORTS = [
      [2048, 1152], [1440, 900], [1100, 700], [768, 1024],
    ];
    for (const [w, h] of VIEWPORTS) {
      const env = track(await newPage(http, { viewport: { width: w, height: h } }));
      const { page } = env;
      await unlock(page);
      // 打开多个 App 覆盖典型布局
      await page.evaluate(() => {
        window.Apps.open('finder');
        window.Apps.open('mail');
        window.Apps.open('settings');
        window.Apps.open('calculator');
      });
      await page.waitForTimeout(600);
      // 窗口不越界
      const wins = await page.evaluate(() => window.WM.windows.map(x => ({ app: x.appId, ...x.rect })));
      for (const win of wins) {
        t.ok(win.w <= w, `[${w}×${h}] ${win.app} 宽度 ${win.w} ≤ 视口 ${w}`);
        t.ok(win.x + win.w <= w + 80, `[${w}×${h}] ${win.app} 右缘不越界`);
        t.ok(win.y >= 25, `[${w}×${h}] ${win.app} 不被菜单栏遮挡`);
      }
      // 计算器（小窗口）在窄视口下宽度有效
      const calc = wins.find(x => x.app === 'calculator');
      if (calc) t.ok(calc.w <= w - 10, `[${w}×${h}] 计算器宽度有效: ${calc.w}`);
      // 菜单栏与 Dock 正常
      t.ok(await page.isVisible('#menubar'), `[${w}×${h}] 菜单栏可见`);
      t.ok(await page.isVisible('#dock'), `[${w}×${h}] Dock 可见`);
      const dockW = await page.evaluate(() => document.querySelector('#dock .dock-icon').getBoundingClientRect().width);
      if (w <= 640) t.ok(dockW <= 40.5, `[${w}×${h}] Dock 图标缩小: ${dockW}`);
      else if (w <= 1100) t.ok(dockW <= 48.5, `[${w}×${h}] Dock 图标收窄: ${dockW}`);
      // 页面无横向滚动溢出
      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      t.ok(overflowX <= 1, `[${w}×${h}] 页面无水平溢出 (${overflowX}px)`);
      // 锁屏也检查一次（每视口重新锁屏代价高，仅 768 视口验证）
      if (w === 768) {
        await page.evaluate(() => window.Sys.showLock());
        await page.waitForTimeout(400);
        t.ok(await page.isVisible('#lockscreen'), '[768×1024] 锁屏正常显示');
        await page.screenshot({ path: path.join(shotsDir, `lock-${w}x${h}.png`) });
        await page.click('#lockscreen');
        await page.waitForSelector('#desktop:not(.hidden)', { timeout: 5000 });
      }
      await page.screenshot({ path: path.join(shotsDir, `desktop-${w}x${h}.png`) });
      t.eq(env.errors.length, 0, `[${w}×${h}] 无未捕获异常: ` + env.errors.join(' | '));
    }

    // ---- 桌面英文名不在单词中间断行 ----
    const env2 = track(await newPage(http, { viewport: { width: 1440, height: 900 } }));
    await unlock(env2.page);
    await env2.page.evaluate(() => window.FS.write('/Users/guest/Desktop/SuperLongEnglishFileNameDocument.txt', 'x'));
    await env2.page.waitForTimeout(300);
    const nameStyle = await env2.page.evaluate(() => {
      const n = [...document.querySelectorAll('.desk-icon .di-name')].find(x => x.textContent.includes('SuperLong'));
      if (!n) return null;
      const cs = getComputedStyle(n);
      return { wordBreak: cs.wordBreak, overflowWrap: cs.overflowWrap };
    });
    t.ok(nameStyle, '桌面显示长英文名文件');
    t.ok(nameStyle.wordBreak !== 'break-all', '桌面文件名不在单词中间断行');
    await env2.page.evaluate(() => window.FS.trash('/Users/guest/Desktop/SuperLongEnglishFileNameDocument.txt'));
    t.eq(env2.errors.length, 0, '无未捕获异常: ' + env2.errors.join(' | '));
  },
};
