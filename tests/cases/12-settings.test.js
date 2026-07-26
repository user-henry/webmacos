'use strict';
/* ⑭ 设置接线审计（任务书测试：逐 pane 审计） */
module.exports = {
  name: '12-settings',
  title: '全部 pane 无异常加载；模拟状态持久化恢复；switch 完整 aria；搜索可达',
  async run({ t, track, newPage, unlock, http }) {
    const env = track(await newPage(http));
    const { page } = env;
    await unlock(page);
    await page.evaluate(() => window.Apps.open('settings'));
    await page.waitForTimeout(400);

    // ---- 逐 pane 加载无异常 ----
    const paneIds = await page.evaluate(() => window.SettingsApp.panes.map(p => p.id));
    t.ok(paneIds.length >= 25, `pane 数量 ${paneIds.length} ≥ 25`);
    for (const id of paneIds) {
      const bad = await page.evaluate(pid => {
        const w = window.WM.windowsForApp('settings')[0];
        w.appState.go(pid);
        return w.body.querySelector('.set-content .empty-state') && w.body.querySelector('.set-content .empty-state').textContent.includes('加载失败');
      }, id);
      t.ok(!bad, `pane「${id}」加载无异常`);
    }

    // ---- Wi-Fi 连接状态持久化恢复 ----
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('settings')[0];
      w.appState.go('wifi');
      const rows = [...w.body.querySelectorAll('.set-card .set-row')];
      const r2 = rows.find(r => r.textContent.includes('CoffeeShop_Guest'));
      r2.querySelector('.btn').click();
    });
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('macos-web:settings')).wifiNetwork);
    t.eq(saved, 'CoffeeShop_Guest', 'Wi-Fi 连接状态已保存');
    // 重开设置窗口恢复
    await page.evaluate(() => { window.WM.close(window.WM.windowsForApp('settings')[0]); });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.Apps.open('settings', { pane: 'wifi' }));
    await page.waitForTimeout(400);
    const wifiState = await page.evaluate(() => {
      const w = window.WM.windowsForApp('settings')[0];
      const rows = [...w.body.querySelectorAll('.set-card .set-row')];
      const r2 = rows.find(r => r.textContent.includes('CoffeeShop_Guest'));
      return r2.querySelector('.btn').textContent;
    });
    t.eq(wifiState, '已连接', '重开后 Wi-Fi 连接状态恢复');

    // ---- 蓝牙连接状态持久化恢复 ----
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('settings')[0];
      w.appState.go('bluetooth');
      const rows = [...w.body.querySelectorAll('.set-card .set-row')];
      const r2 = rows.find(r => r.textContent.includes('MX Master 3S'));
      r2.querySelector('.btn').click();
    });
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('macos-web:settings')).btDevices['MX Master 3S']);
    t.eq(saved, true, '蓝牙连接状态已保存');
    await page.evaluate(() => { window.WM.close(window.WM.windowsForApp('settings')[0]); });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.Apps.open('settings', { pane: 'bluetooth' }));
    await page.waitForTimeout(400);
    const btState = await page.evaluate(() => {
      const w = window.WM.windowsForApp('settings')[0];
      const rows = [...w.body.querySelectorAll('.set-card .set-row')];
      return rows.find(r => r.textContent.includes('MX Master 3S')).querySelector('.btn').textContent;
    });
    t.eq(btState, '已连接', '重开后蓝牙连接状态恢复');

    // ---- 键盘滑块持久化 ----
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('settings')[0];
      w.appState.go('keyboard');
      const r = w.body.querySelector('input[type=range]');
      r.value = '3'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true }));
    });
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('macos-web:settings')).kbRepeat);
    t.eq(saved, 3, '键盘滑块值已保存');

    // ---- 时区选择器接线 ----
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('settings')[0];
      w.appState.go('datetime');
      const sel = [...w.body.querySelectorAll('select')].pop();
      sel.value = 'Asia/Tokyo';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('macos-web:settings')).timezone);
    t.eq(saved, 'Asia/Tokyo', '时区选择已保存');
    const mbTxt = await page.evaluate(() => window.Sys._mbClock.textContent);
    const expectTK = await page.evaluate(() => fmtMenuClock(new Date(), window.Sys.settings.h24, 'Asia/Tokyo'));
    t.eq(mbTxt, expectTK, '菜单栏时钟已应用东京时区');
    await page.evaluate(() => { window.Sys.settings.timezone = 'local'; window.Sys.save(); window.Sys.tickClock(); });

    // ---- switch 完整 aria ----
    const aria = await page.evaluate(() => {
      const w = window.WM.windowsForApp('settings')[0];
      w.appState.go('dock');
      const switches = [...w.body.querySelectorAll('.set-content .switch')];
      return switches.map(s => ({
        role: s.getAttribute('role'), tabindex: s.getAttribute('tabindex'),
        checked: s.getAttribute('aria-checked'),
      }));
    });
    t.ok(aria.length > 0, 'dock pane 有 switch');
    for (const a of aria) {
      t.eq(a.role, 'switch', 'role=switch');
      t.eq(a.tabindex, '0', 'tabindex=0');
      t.ok(a.checked === 'true' || a.checked === 'false', 'aria-checked 为布尔串');
    }
    // 键盘触发翻转
    const kbFlip = await page.evaluate(() => {
      const w = window.WM.windowsForApp('settings')[0];
      const sw = [...w.body.querySelectorAll('.set-content .switch')][0];
      const before = sw.getAttribute('aria-checked');
      sw.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      return { before, after: sw.getAttribute('aria-checked') };
    });
    t.ok(kbFlip.before !== kbFlip.after, '键盘 Enter 可翻转 switch');

    // ---- 「模拟」标注存在 ----
    for (const [pane, label] of [['keyboard', '键盘'], ['mouse', '鼠标'], ['trackpad', '触控板'], ['vpn', 'VPN']]) {
      const has = await page.evaluate(pid => {
        const w = window.WM.windowsForApp('settings')[0];
        w.appState.go(pid);
        return w.body.querySelector('.set-content').textContent.includes('模拟');
      }, pane);
      t.ok(has, `「${label}」pane 标注了模拟`);
    }

    // ---- 搜索可达 pane ----
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('settings')[0];
      const search = w.body.querySelector('.set-search');
      search.value = '墙纸';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('settings')[0];
      [...w.body.querySelectorAll('.set-nav-item')].find(n => n.textContent.includes('墙纸')).click();
    });
    await page.waitForTimeout(200);
    const curPane = await page.evaluate(() => window.WM.windowsForApp('settings')[0].appState.pane);
    t.eq(curPane, 'wallpaper', '搜索「墙纸」并点击进入对应 pane');
    t.eq(env.errors.length, 0, '全程无未捕获异常: ' + env.errors.join(' | '));
  },
};
