'use strict';
/* P0-③ 菜单动态重算 */
module.exports = {
  name: '03-menus',
  title: '首次打开 App 菜单可用；选择/状态变化后菜单同步',
  async run({ t, track, newPage, unlock, http }) {
    const env = track(await newPage(http));
    const { page } = env;
    await unlock(page);

    // ---- 首次打开文本编辑，立即点「文件→保存」必须弹出另存为 ----
    await page.evaluate(() => window.Apps.open('textedit'));
    await page.waitForTimeout(250);
    // 展开菜单栏「文件」
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('#menubar-left .mb-appmenu')];
      items.find(n => n.textContent === '文件').click();
    });
    await page.waitForSelector('.menu-pop', { timeout: 3000 });
    const saveItem = await page.evaluate(() => {
      const mi = [...document.querySelectorAll('.menu-pop .menu-item')].find(n => n.textContent.includes('保存'));
      return mi ? { disabled: mi.classList.contains('disabled') } : null;
    });
    t.ok(saveItem, '菜单中应找到「保存」');
    t.eq(saveItem.disabled, false, '首次打开时「保存」不得禁用');
    await page.evaluate(() => {
      [...document.querySelectorAll('.menu-pop .menu-item')].find(n => n.textContent.trim().startsWith('保存')).click();
    });
    await page.waitForSelector('.modal-mask .dialog input', { timeout: 3000 });
    t.ok(true, '点击保存后弹出另存为对话框');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // ---- Finder 未选择时「移到废纸篓」禁用，选择后重新打开启用 ----
    await page.evaluate(() => window.Apps.open('finder', { path: window.FS.HOME + '/Desktop' }));
    await page.waitForTimeout(300);
    const menuState = async () => {
      // 关闭可能残留的菜单再重新展开
      await page.evaluate(() => window.UI.closeAllMenus());
      await page.evaluate(() => {
        [...document.querySelectorAll('#menubar-left .mb-appmenu')].find(n => n.textContent === '文件').click();
      });
      await page.waitForSelector('.menu-pop', { timeout: 3000 });
      return page.evaluate(() => {
        const mi = [...document.querySelectorAll('.menu-pop .menu-item')].find(n => n.textContent.includes('移到废纸篓'));
        return mi ? mi.classList.contains('disabled') : null;
      });
    };
    t.eq(await menuState(), true, '未选择项目时「移到废纸篓」必须禁用');
    await page.evaluate(() => window.UI.closeAllMenus());
    // 选中 welcome.txt
    await page.evaluate(() => {
      const win = window.WM.windowsForApp('finder').find(w => w.appState.path === window.FS.HOME + '/Desktop');
      win.appState.selection = new Set([window.FS.HOME + '/Desktop/welcome.txt']);
      const el2 = win.body.querySelector(`[data-path="${window.FS.HOME}/Desktop/welcome.txt"]`);
      if (el2) el2.classList.add('sel');
    });
    t.eq(await menuState(), false, '选择项目后重新打开菜单「移到废纸篓」必须启用');
    await page.evaluate(() => window.UI.closeAllMenus());
    t.eq(env.errors.length, 0, '全程无未捕获异常: ' + env.errors.join(' | '));
  },
};
