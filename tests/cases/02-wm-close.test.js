'use strict';
/* P0-① WM.close 重入；P0-② 锁屏/睡眠/关机状态机 */
module.exports = {
  name: '02-wm-close',
  title: 'WM.close 重入不连删、锁屏/睡眠保留窗口、关机脏文档可中止',
  async run({ t, track, newPage, unlock, http }) {
    const env = track(await newPage(http));
    const { page } = env;
    await unlock(page);

    // ---- ① 同时打开计算器和备忘录，连续两次关闭计算器 ----
    await page.evaluate(() => { window.Apps.open('calculator'); window.Apps.open('notes'); });
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(() => window.WM.windows.length), 2, '应打开 2 个窗口');
    // 连续两次关闭计算器（第二次发生在 150ms 关闭动画期间）
    const results = await page.evaluate(async () => {
      const calc = window.WM.windowsForApp('calculator')[0];
      const r1 = window.WM.close(calc);
      const r2 = window.WM.close(calc); // 重入
      const r3 = window.WM.close(calc); // 再重入
      return Promise.all([r1, r2, r3]);
    });
    await page.waitForTimeout(300);
    t.eq(results[0], 'closed', '首次关闭应 closed');
    t.eq(results[1], 'closed', '重入应复用同一 Promise 返回 closed');
    const remain = await page.evaluate(() => window.WM.windows.map(w => w.appId));
    t.eq(remain.length, 1, '最终只剩 1 个窗口');
    t.eq(remain[0], 'notes', '留下的必须是备忘录（计算器未连删其他窗口）');
    const r4 = await page.evaluate(() => { const w = window.WM.windowsForApp('calculator')[0]; return w ? 'exists' : 'gone'; });
    t.eq(r4, 'gone', '计算器确实关闭');

    // ---- ① confirmClose 重入 + 取消 ----
    await page.evaluate(() => window.Apps.open('textedit'));
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('textedit')[0];
      w.body.querySelector('textarea').value = '未保存的内容';
      w.body.querySelector('textarea').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.evaluate(() => { window.WM.close(window.WM.windowsForApp('textedit')[0]); });
    await page.waitForSelector('.modal-mask .dialog', { timeout: 3000 });
    // 确认框挂起期间再次关闭 → 不得出现第二个确认框
    await page.evaluate(() => { window.WM.close(window.WM.windowsForApp('textedit')[0]); });
    await page.waitForTimeout(300);
    t.eq(await page.$$eval('.modal-mask', n => n.length), 1, '保存确认期间重入不得产生第二个模态框');
    // 点取消 → 窗口仍在
    await page.evaluate(() => { [...document.querySelectorAll('.dlg-btns .btn')].find(b => b.textContent === '取消').click(); });
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(() => window.WM.windowsForApp('textedit').length), 1, '取消关闭后文本编辑仍在');
    t.eq(await page.$$eval('.modal-mask', n => n.length), 0, '取消后无残留模态框');

    // ---- ② 锁屏再解锁：窗口与内容保留、无隐藏模态框 ----
    await page.evaluate(() => window.Sys.showLock());
    await page.waitForSelector('#lockscreen:not(.hidden)', { timeout: 3000 });
    t.eq(await page.evaluate(() => window.WM.windows.length), 2, '锁屏不得关闭窗口');
    await page.click('#lockscreen');
    await page.waitForSelector('#desktop:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(() => window.WM.windowsForApp('textedit').length), 1, '解锁后文本编辑仍在');
    const txt = await page.evaluate(() => window.WM.windowsForApp('textedit')[0].body.querySelector('textarea').value);
    t.eq(txt, '未保存的内容', '解锁后未保存内容仍在');
    t.eq(await page.$$eval('.modal-mask', n => n.length), 0, '解锁后没有隐藏模态框');

    // ---- ② 睡眠唤醒保留窗口 ----
    await page.evaluate(() => window.Sys.sleep());
    await page.waitForTimeout(900);
    await page.mouse.click(700, 450); // 唤醒
    await page.waitForSelector('#lockscreen:not(.hidden)', { timeout: 3000 });
    t.eq(await page.evaluate(() => window.WM.windows.length), 2, '睡眠不得关闭窗口');
    await page.click('#lockscreen');
    await page.waitForSelector('#desktop:not(.hidden)', { timeout: 5000 });

    // ---- ② 脏文档关机点取消 → 不得进入关机画面 ----
    await page.evaluate(() => { window.Sys.powerOff(); });
    await page.waitForSelector('.modal-mask .dialog', { timeout: 3000 });
    // 系统确认：点"关机"
    await page.evaluate(() => { [...document.querySelectorAll('.dlg-btns .btn')].find(b => b.textContent === '关机').click(); });
    // 脏文档确认弹出：点"取消"中止
    await page.waitForSelector('.modal-mask .dialog', { timeout: 3000 });
    await page.evaluate(() => { [...document.querySelectorAll('.dlg-btns .btn')].find(b => b.textContent === '取消').click(); });
    await page.waitForTimeout(400);
    t.ok(await page.evaluate(() => document.querySelector('#poweroff').classList.contains('hidden')), '取消脏文档确认后不得进入关机画面');
    t.eq(await page.evaluate(() => window.WM.windowsForApp('textedit').length), 1, '中止关机后脏窗口仍在');

    // ---- ② 同意保存后正常关机 ----
    await page.evaluate(() => { window.Sys.powerOff(); });
    await page.waitForSelector('.modal-mask .dialog', { timeout: 3000 });
    await page.evaluate(() => { [...document.querySelectorAll('.dlg-btns .btn')].find(b => b.textContent === '关机').click(); });
    await page.waitForSelector('.modal-mask .dialog', { timeout: 3000 });
    await page.evaluate(() => { [...document.querySelectorAll('.dlg-btns .btn')].find(b => b.textContent === '不存储').click(); });
    await page.waitForSelector('#poweroff:not(.hidden)', { timeout: 5000 });
    t.ok(true, '确认后进入关机画面');
    t.eq(await page.evaluate(() => window.WM.windows.length), 0, '关机后所有窗口已关闭');
    t.eq(env.errors.length, 0, '全程无未捕获异常: ' + env.errors.join(' | '));
  },
};
