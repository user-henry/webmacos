'use strict';
/* 任务书测试 14：刷新持久化（文件、图标位置、主题、便笺）；localStorage 损坏回退 */
module.exports = {
  name: '15-persistence',
  title: '刷新后文件/桌面图标位置/深色模式/便笺均恢复；损坏数据安全回退',
  async run({ t, track, newPage, unlock, http }) {
    const env = track(await newPage(http));
    const { page } = env;
    await unlock(page);

    // ---- 制造状态 ----
    await page.evaluate(() => {
      window.FS.write('/Users/guest/Documents/keep-me.txt', '持久化内容');
      // 深色模式
      window.Sys.set('appearance', 'dark');
      window.Sys.save(); window.Sys.applyAll();
      // 桌面图标位置
      const icons = window.Store.get('desktop-icons', {});
      icons['/Users/guest/Desktop/welcome.txt'] = { x: 333, y: 222 };
      window.Store.set('desktop-icons', icons);
      window.Sys.renderDesktopIcons();
    });
    await page.waitForTimeout(300);
    // 便笺（contenteditable div，openAll 异步 spawn，保存有 400ms debounce）
    await page.evaluate(() => window.Apps.open('stickies'));
    await page.waitForSelector('.sticky-win .sticky-body', { timeout: 5000 });
    await page.evaluate(() => {
      const area = document.querySelector('.sticky-win .sticky-body');
      area.textContent = '便笺内容-持久化';
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(700); // 等 debounce 落盘
    await page.evaluate(() => window.WM.windowsForApp('stickies').forEach(w => window.WM.close(w)));
    await page.waitForTimeout(300);

    // ---- 刷新 ----
    await page.reload();
    await page.waitForSelector('#lockscreen:not(.hidden)', { timeout: 12000 });
    await page.click('#lockscreen');
    await page.waitForSelector('#desktop:not(.hidden)', { timeout: 8000 });
    await page.waitForTimeout(300);

    t.eq(await page.evaluate(() => window.FS.read('/Users/guest/Documents/keep-me.txt')), '持久化内容', '文件内容恢复');
    t.eq(await page.evaluate(() => window.Sys.settings.appearance), 'dark', '深色模式恢复');
    t.eq(await page.evaluate(() => document.body.classList.contains('dark')), true, '深色样式生效');
    const iconPos = await page.evaluate(() => {
      const ic = [...document.querySelectorAll('.desk-icon')].find(n => n.dataset.path === '/Users/guest/Desktop/welcome.txt');
      return ic ? { left: ic.style.left, top: ic.style.top } : null;
    });
    t.ok(iconPos && iconPos.left === '333px' && iconPos.top === '222px', '桌面图标位置恢复: ' + JSON.stringify(iconPos));
    // 便笺内容恢复（重新打开便笺）
    await page.evaluate(() => window.Apps.open('stickies'));
    await page.waitForSelector('.sticky-win .sticky-body', { timeout: 5000 });
    const sticky = await page.evaluate(() => document.querySelector('.sticky-win .sticky-body').textContent);
    t.eq(sticky, '便笺内容-持久化', '便笺内容恢复');
    // 清理
    await page.evaluate(() => { window.FS.trash('/Users/guest/Documents/keep-me.txt'); window.WM.windowsForApp('stickies').forEach(w => window.WM.close(w)); });

    // ---- localStorage 损坏回退 ----
    const env2 = track(await newPage(http));
    await env2.page.evaluate(() => {
      localStorage.setItem('macos-web:settings', '{broken json!!');
      localStorage.setItem('macos-web:fs', 'not-json-at-all');
    });
    await env2.page.goto(http); // 重新加载
    await env2.page.waitForSelector('#lockscreen:not(.hidden)', { timeout: 12000 });
    await env2.page.click('#lockscreen');
    await env2.page.waitForSelector('#desktop:not(.hidden)', { timeout: 8000 });
    t.ok(await env2.page.isVisible('#menubar'), '损坏数据下系统仍可启动');
    t.ok(env2.errors.length === 0, '损坏回退无未捕获异常: ' + env2.errors.join(' | '));
  },
};
