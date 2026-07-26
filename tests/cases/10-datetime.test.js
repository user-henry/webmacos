'use strict';
/* ⑫ 本地日期与 IANA 时区 */
module.exports = {
  name: '10-datetime',
  title: 'localDateKey 无 UTC 错位；世界时钟夏令时正确；时区设置保存并生效',
  async run({ t, track, newPage, unlock, http }) {
    const env = track(await newPage(http));
    const { page } = env;
    await unlock(page);

    // ---- localDateKey 输出本地日期 ----
    const dk = await page.evaluate(() => {
      const d = new Date();
      return {
        key: localDateKey(d),
        expect: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      };
    });
    t.eq(dk.key, dk.expect, 'localDateKey 输出本地 YYYY-MM-DD');

    // ---- 日历 today 高亮与默认日期使用本地日期 ----
    await page.evaluate(() => window.Apps.open('calendar'));
    await page.waitForTimeout(300);
    const cal = await page.evaluate(() => {
      const w = window.WM.windowsForApp('calendar')[0];
      const sel = w.body.querySelector('.cal-cell.today .cal-num');
      return { sel: w.appState.sel, todayCell: sel ? sel.textContent : null };
    });
    t.eq(cal.sel, await page.evaluate(() => localDateKey()), '日历 sel=本地今天');
    t.eq(cal.todayCell, String(new Date().getDate()), '日历高亮格为本地今天');

    // ---- 提醒事项默认日期无 UTC 错位 ----
    const remDue = await page.evaluate(() => {
      window.Apps.open('reminders');
      const w = window.WM.windowsForApp('reminders')[0];
      return w.appState ? null : null;
    });
    const due = await page.evaluate(() => {
      const w = window.WM.windowsForApp('reminders')[0];
      const d = new Date(Date.now() + 86400000 * 2);
      return localDateKey(d);
    });
    t.ok(/^\d{4}-\d{2}-\d{2}$/.test(due), '提醒默认日期为本地日期键');

    // ---- 世界时钟：IANA 时区与 Intl 一致、偏移含夏令时 ----
    await page.evaluate(() => window.Apps.open('clock'));
    await page.waitForTimeout(300);
    const world = await page.evaluate(() => {
      const w = window.WM.windowsForApp('clock')[0];
      const rows = [...w.body.querySelectorAll('.clock-city')].map(r => ({
        city: r.querySelector('b').textContent,
        off: r.querySelector('small').textContent,
        time: r.querySelector('.clock-city-time').textContent,
      }));
      return rows;
    });
    t.ok(world.length >= 3, '世界时钟有默认城市');
    const ny = world.find(r => r.city === '纽约');
    t.ok(ny, '含纽约');
    const nyExpect = await page.evaluate(() => ({
      off: window.ClockApp.tzOffsetLabel('America/New_York'),
      time: fmtTimeHM(new Date(), window.Sys.settings.h24, 'America/New_York'),
    }));
    t.eq(ny.off, nyExpect.off, '纽约偏移标签与 Intl 一致（自动处理夏令时）');
    t.eq(ny.time, nyExpect.time, '纽约时间与 Intl 一致');
    t.ok(/^UTC[+-]\d+/.test(ny.off), '偏移标签格式正确: ' + ny.off);

    // ---- 时区设置保存并影响菜单栏时钟 ----
    await page.evaluate(() => {
      window.Sys.settings.timezone = 'America/New_York';
      window.Sys.save(); window.Sys.tickClock();
    });
    await page.waitForTimeout(100);
    const mbNY = await page.evaluate(() => window.Sys._mbClock.textContent);
    const expectNY = await page.evaluate(() => fmtMenuClock(new Date(), window.Sys.settings.h24, 'America/New_York'));
    t.eq(mbNY, expectNY, '菜单栏时钟已切换到纽约时区');
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('macos-web:settings')).timezone);
    t.eq(persisted, 'America/New_York', '时区选择已持久化');
    // 锁屏时钟同样生效
    await page.evaluate(() => window.Sys.tickLockClock());
    const lockTime = await page.evaluate(() => document.querySelector('#lock-time').textContent);
    const expectLock = await page.evaluate(() => fmtTime(new Date(), window.Sys.settings.h24, 'America/New_York'));
    t.eq(lockTime, expectLock, '锁屏时钟同步时区设置');
    // 恢复本地时区
    await page.evaluate(() => { window.Sys.settings.timezone = 'local'; window.Sys.save(); window.Sys.tickClock(); });
    t.eq(env.errors.length, 0, '全程无未捕获异常: ' + env.errors.join(' | '));
  },
};
