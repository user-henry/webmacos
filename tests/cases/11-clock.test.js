'use strict';
/* ⑬ 秒表与计时器跨标签恢复、endAt 唯一基准、防重复通知（任务书测试 13） */
module.exports = {
  name: '11-clock',
  title: '秒表/计时器跨标签恢复；endAt 唯一基准；结束只通知一次；关闭前提示',
  async run({ t, track, newPage, unlock, http }) {
    const env = track(await newPage(http));
    const { page } = env;
    await unlock(page);
    await page.evaluate(() => window.Apps.open('clock'));
    await page.waitForTimeout(300);
    const go = tab => page.evaluate(tb => {
      const w = window.WM.windowsForApp('clock')[0];
      [...w.body.querySelectorAll('.store-tab')].find(b => b.dataset.tab === tb).click();
    }, tab);
    const swst = () => page.evaluate(() => {
      const w = window.WM.windowsForApp('clock')[0];
      const s = w.appState.sw;
      return {
        running: s.running, laps: s.laps.length,
        btn: w.body.querySelectorAll('.sw-btn')[1] ? w.body.querySelectorAll('.sw-btn')[1].textContent : null,
        disp: w.body.querySelector('.sw-disp') ? w.body.querySelector('.sw-disp').textContent : null,
        lapRows: w.body.querySelectorAll('.sw-lap').length,
      };
    });

    // ---- 秒表：开始 → 切走 → 切回恢复 ----
    await go('sw');
    await page.evaluate(() => { const w = window.WM.windowsForApp('clock')[0]; [...w.body.querySelectorAll('.sw-btn')].find(b => b.textContent === '开始').click(); });
    await page.waitForTimeout(600);
    // 计次两次
    await page.evaluate(() => { const w = window.WM.windowsForApp('clock')[0]; [...w.body.querySelectorAll('.sw-btn')].find(b => b.textContent === '计次').click(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const w = window.WM.windowsForApp('clock')[0]; [...w.body.querySelectorAll('.sw-btn')].find(b => b.textContent === '计次').click(); });
    let s1 = await swst();
    t.eq(s1.laps, 2, '计次 2 次');
    t.eq(s1.btn, '暂停', '运行中按钮为暂停');
    // 切到世界时钟再切回
    await go('world');
    await page.waitForTimeout(700);
    await go('sw');
    await page.waitForTimeout(150);
    s1 = await swst();
    t.eq(s1.btn, '暂停', '切回后按钮恢复为暂停');
    t.eq(s1.lapRows, 2, '切回后计次列表恢复 2 条');
    t.ok(s1.disp && s1.disp !== '00:00.0', '切回后显示当前秒表值: ' + s1.disp);
    // 暂停后切走切回
    await page.evaluate(() => { const w = window.WM.windowsForApp('clock')[0]; [...w.body.querySelectorAll('.sw-btn')].find(b => b.textContent === '暂停').click(); });
    await go('alarm'); await go('sw');
    s1 = await swst();
    t.eq(s1.btn, '继续', '暂停后切回按钮为继续');

    // ---- 计时器：跨标签到点通知且只通知一次 ----
    await go('timer');
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('clock')[0];
      const st = w.appState;
      st.timer.total = 1200; st.timer.left = 1200;
      st.timer.endAt = Date.now() + 1200; st.timer.notified = false; st.timer.running = true;
    });
    await go('world'); // 切走
    await page.waitForTimeout(2500); // 等计时结束（到点检测不依赖当前标签）
    const notifs = await page.evaluate(() => window.Notify.list.filter(n => n.appId === 'clock' && n.title === '计时器').length);
    t.eq(notifs, 1, '切走时到点仍通知，且只通知一次');
    await page.waitForTimeout(1200);
    const notifs2 = await page.evaluate(() => window.Notify.list.filter(n => n.appId === 'clock' && n.title === '计时器').length);
    t.eq(notifs2, 1, '之后不重复通知');
    await go('timer');
    const t1 = await page.evaluate(() => {
      const w = window.WM.windowsForApp('clock')[0];
      const btns = [...w.body.querySelectorAll('.sw-btn')];
      return { btn: btns.find(b => ['开始', '暂停', '继续'].includes(b.textContent)).textContent, disp: w.body.querySelector('.sw-disp').textContent };
    });
    t.eq(t1.btn, '开始', '计时结束后按钮恢复为开始');
    t.eq(t1.disp, '00:00', '计时结束显示 00:00');

    // ---- 运行中关闭窗口弹确认 ----
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('clock')[0];
      const st = w.appState;
      st.timer.total = 60000; st.timer.left = 60000;
      st.timer.endAt = Date.now() + 60000; st.timer.notified = false; st.timer.running = true;
    });
    await page.evaluate(() => { window.WM.close(window.WM.windowsForApp('clock')[0]); });
    await page.waitForSelector('.modal-mask .dialog', { timeout: 3000 });
    t.ok(true, '运行中关闭弹出确认');
    await page.evaluate(() => { [...document.querySelectorAll('.dlg-btns .btn')].find(b => b.textContent === '取消').click(); });
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(() => window.WM.windowsForApp('clock').length), 1, '取消后窗口保留');
    await page.evaluate(() => { window.WM.close(window.WM.windowsForApp('clock')[0]); });
    await page.waitForSelector('.modal-mask .dialog', { timeout: 3000 });
    await page.evaluate(() => { [...document.querySelectorAll('.dlg-btns .btn')].find(b => b.textContent === '关闭').click(); });
    await page.waitForTimeout(400);
    t.eq(await page.evaluate(() => window.WM.windowsForApp('clock').length), 0, '确认后窗口关闭');
    t.eq(env.errors.length, 0, '全程无未捕获异常: ' + env.errors.join(' | '));
  },
};
