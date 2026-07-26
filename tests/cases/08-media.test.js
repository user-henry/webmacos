'use strict';
/* ⑩ 媒体注册与全局音量（任务书测试 11） */
module.exports = {
  name: '08-media',
  title: '切源后媒体仍受全局音量控制；关闭时注销；App 内滑块与全局一致',
  async run({ t, track, newPage, unlock, http }) {
    const env = track(await newPage(http));
    const { page } = env;
    await unlock(page);
    const mediaSize = () => page.evaluate(() => window.Sys.mediaEls.size);

    // ---- 音乐：注册 + 全局音量 ----
    await page.evaluate(() => window.Apps.open('music'));
    await page.waitForTimeout(300);
    const m0 = await mediaSize();
    t.eq(m0, 1, '音乐打开后注册 1 个媒体');
    await page.evaluate(() => { window.Sys.settings.volume = 0.25; window.Sys.settings.muted = false; window.Sys.applyVolume(); });
    const v1 = await page.evaluate(() => {
      const w = window.WM.windowsForApp('music')[0];
      return w.appState.audio ? null : null; // music 的 audio 在闭包中，改从集合取
    });
    const volOfFirst = () => page.evaluate(() => [...window.Sys.mediaEls][0].volume);
    t.eq(await volOfFirst(), 0.25, '全局音量实时作用于音乐');

    // ---- 音乐切歌（换 src）后仍在集合且音量保留 ----
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('music')[0];
      const rows = [...w.body.querySelectorAll('.music-row')].filter(r => r.querySelector('.m-play') || r.dataset);
      // 直接操作第二行的播放按钮
      const btns = [...w.body.querySelectorAll('.music-row button')];
      if (btns[1]) btns[1].click();
    });
    await page.waitForTimeout(300);
    t.eq(await mediaSize(), 1, '切歌后媒体集合大小不变（emptied 不再注销）');
    t.eq(await volOfFirst(), 0.25, '切歌后音量保留全局值');

    // ---- QuickTime：切源后仍受控 ----
    await page.evaluate(() => window.Apps.open('quicktime', { idx: 0 }));
    await page.waitForTimeout(400);
    t.eq(await mediaSize(), 2, 'QuickTime 注册后 2 个媒体');
    const qtWin = () => page.evaluate(() => window.WM.windowsForApp('quicktime')[0].appState.idx);
    await page.evaluate(() => window.WM.windowsForApp('quicktime')[0].appState.nav(1)); // 切到下一个视频
    await page.waitForTimeout(400);
    t.eq(await qtWin(), 1, 'QuickTime 已切到第 2 个源');
    t.eq(await mediaSize(), 2, 'QuickTime 切源后媒体集合大小不变');
    const vols = await page.evaluate(() => [...window.Sys.mediaEls].map(m => m.volume));
    t.ok(vols.every(v => v === 0.25), '切源后全部媒体音量=全局值');

    // ---- App 内滑块与全局一致 ----
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('quicktime')[0];
      const vol = w.body.querySelector('.qt-vol');
      vol.value = '70';
      vol.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(150);
    t.eq(await page.evaluate(() => window.Sys.settings.volume), 0.7, 'App 内滑块直写全局音量');
    t.eq(await volOfFirst(), 0.7, '全局设置实时作用于音乐');

    // ---- 关闭时注销 ----
    await page.evaluate(() => { window.WM.close(window.WM.windowsForApp('quicktime')[0]); });
    await page.waitForTimeout(300);
    t.eq(await mediaSize(), 1, '关闭 QuickTime 后注销其媒体');
    await page.evaluate(() => { window.WM.close(window.WM.windowsForApp('music')[0]); });
    await page.waitForTimeout(300);
    t.eq(await mediaSize(), 0, '关闭音乐后媒体集合清空');
    t.eq(env.errors.length, 0, '全程无未捕获异常: ' + env.errors.join(' | '));
  },
};
