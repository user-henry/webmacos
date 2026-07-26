'use strict';
/* ⑨ 通知设置（任务书测试 10） */
module.exports = {
  name: '07-notify',
  title: '通知总开关、App 开关、专注模式、未读语义、Dock 局部更新、通知中心关闭',
  async run({ t, track, newPage, unlock, http }) {
    const env = track(await newPage(http));
    const { page } = env;
    await unlock(page);
    const S = expr => page.evaluate(e => {
      const s = window.Sys.settings; return eval(e);
    }, expr);

    // ---- 总开关关闭：无横幅/记录/徽标 ----
    await page.evaluate(() => { window.Sys.settings.notificationsEnabled = false; });
    const r1 = await page.evaluate(() => window.Notify.send({ appId: 'mail', title: '测试', body: 'x' }));
    t.eq(r1, null, '总开关关闭时 send 返回 null');
    t.eq(await page.evaluate(() => window.Notify.list.length), 0, '总开关关闭时不产生记录');

    // ---- App 开关关闭 ----
    await page.evaluate(() => { window.Sys.settings.notificationsEnabled = true; window.Sys.settings.notifAllow.mail = false; });
    const r2 = await page.evaluate(() => window.Notify.send({ appId: 'mail', title: '测试', body: 'x' }));
    t.eq(r2, null, 'App 开关关闭时该 App 静默');
    t.eq(await page.evaluate(() => window.Notify.list.length), 0, 'App 关闭不产生记录');
    await page.evaluate(() => { window.Sys.settings.notifAllow.calendar = true; });
    const r3 = await page.evaluate(() => window.Notify.send({ appId: 'calendar', title: '日历提醒', body: '会议' }));
    t.ok(r3 && r3.id, '其他 App 仍可发送');
    t.eq(await page.evaluate(() => window.Notify.list.length), 1, '记录已加入');

    // ---- 专注模式：仍记录未读，不显示横幅 ----
    // 先清掉上一条横幅，避免干扰计数
    await page.evaluate(() => { document.querySelectorAll('.banner').forEach(b => b.remove()); window.Sys.settings.focus = true; });
    await page.evaluate(() => window.Notify.send({ appId: 'calendar', title: '专注下', body: '不应有横幅' }));
    await page.waitForTimeout(300);
    t.eq(await page.$$eval('.banner', n => n.length), 0, '专注模式不显示横幅');
    t.eq(await page.evaluate(() => window.Notify.badgeCount('calendar')), 2, '专注模式仍保存未读');
    // 闹钟突破专注模式
    await page.evaluate(() => window.Notify.send({ appId: 'clock', title: '闹钟', body: '起床', breakthrough: true }));
    await page.waitForTimeout(300);
    t.ok(await page.$$eval('.banner', n => n.length) >= 1, '闹钟可突破专注模式显示横幅');
    await page.evaluate(() => { window.Sys.settings.focus = false; document.querySelectorAll('.banner').forEach(b => b.remove()); });

    // ---- 横幅自然消失不得自动已读 ----
    const before = await page.evaluate(() => window.Notify.badgeCount('calendar'));
    await page.evaluate(() => window.Notify.send({ appId: 'calendar', title: '自然消失', body: '等 6 秒' }));
    await page.waitForTimeout(6300); // 横幅 5.2s 开始退出 + 动画
    t.eq(await page.$$eval('.banner', n => n.length), 0, '横幅已自然消失');
    t.eq(await page.evaluate(() => window.Notify.badgeCount('calendar')), before + 1, '横幅消失后未读保持');

    // ---- Dock 徽标局部更新（不重建 Dock）----
    const dockStable = await page.evaluate(() => {
      window.Sys.settings.notifAllow.mail = true; // 恢复 mail 开关
      const first = document.querySelector('#dock .dock-icon');
      window.__dockRef = first;
      window.Notify.send({ appId: 'mail', title: '徽标', body: 'x' });
      return document.querySelector('#dock .dock-icon') === first;
    });
    t.ok(dockStable, '更新徽标时 Dock 节点保持同一引用（局部更新）');
    const badge = await page.evaluate(() => {
      const ic = [...document.querySelectorAll('#dock .dock-icon')].find(n => n.dataset.app === 'mail');
      return ic && ic.querySelector('.dock-badge') ? ic.querySelector('.dock-badge').textContent : null;
    });
    t.eq(badge, '1', 'mail 徽标计数正确');

    // ---- 点击通知中心条目 → 已读 ----
    await page.evaluate(() => { window.Notify.showCenter(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const item = [...document.querySelectorAll('#notification-center .nc-notif')].find(n => n.textContent.includes('徽标'));
      item.click();
    });
    await page.waitForTimeout(200);
    t.eq(await page.evaluate(() => window.Notify.badgeCount('mail')), 0, '点击通知后已读、徽标清除');

    // ---- Esc 关闭通知中心；再打开后点外部关闭 ----
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    t.eq(await page.evaluate(() => document.querySelector('#notification-center').classList.contains('nc-hidden')), true, 'Esc 关闭通知中心');
    await page.evaluate(() => window.Notify.showCenter());
    await page.waitForTimeout(150);
    await page.mouse.click(300, 500); // 点击桌面空白
    await page.waitForTimeout(200);
    t.eq(await page.evaluate(() => document.querySelector('#notification-center').classList.contains('nc-hidden')), true, '点击外部关闭通知中心');
    t.eq(env.errors.length, 0, '全程无未捕获异常: ' + env.errors.join(' | '));
  },
};
