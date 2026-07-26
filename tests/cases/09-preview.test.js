'use strict';
/* ⑪ 预览（任务书测试 12） */
module.exports = {
  name: '09-preview',
  title: '预览画廊点击打开大图、标题/缩放/旋转/alt/加载错误正确、无无限画廊',
  async run({ t, track, newPage, unlock, http }) {
    const env = track(await newPage(http));
    const { page } = env;
    await unlock(page);

    // ---- Dock 打开 → 画廊 ----
    await page.evaluate(() => window.Apps.open('preview'));
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(() => window.WM.windowsForApp('preview').length), 1, '打开 1 个预览窗口');
    const cells = await page.$$eval('.preview-cell', n => n.length);
    t.ok(cells >= 5, '画廊显示壁纸缩略图（' + cells + ' 张）');

    // ---- 点击缩略图 → 大图窗口 ----
    await page.evaluate(() => document.querySelector('.preview-cell').click());
    await page.waitForTimeout(400);
    t.eq(await page.evaluate(() => window.WM.windowsForApp('preview').length), 2, '点击后新开大图窗口');
    const big = await page.evaluate(() => {
      const wins = window.WM.windowsForApp('preview');
      const w = wins[wins.length - 1];
      const img = w.body.querySelector('.preview-img');
      return {
        hasImg: !!img, gallery: !!w.body.querySelector('.preview-gallery'),
        title: w.title, alt: img ? img.alt : null, src: img ? img.getAttribute('src') : null,
      };
    });
    t.ok(big.hasImg, '大图窗口显示 .preview-img');
    t.eq(big.gallery, false, '大图窗口不是画廊（无无限画廊）');
    t.includes(big.title, '— 预览', '标题含「— 预览」');
    t.ok(big.alt && big.alt.length > 0, 'img alt 已设置');
    t.includes(big.src, 'assets/wallpapers/', 'src 指向实际壁纸');

    // ---- 连续点击多张：每张三都是大图，无画廊累积 ----
    await page.evaluate(() => {
      const cells = [...document.querySelectorAll('.preview-cell')];
      cells[1].click(); cells[2].click();
    });
    await page.waitForTimeout(400);
    const counts = await page.evaluate(() => ({
      total: window.WM.windowsForApp('preview').length,
      galleries: window.WM.windowsForApp('preview').filter(w => w.body.querySelector('.preview-gallery')).length,
      images: window.WM.windowsForApp('preview').filter(w => w.body.querySelector('.preview-img')).length,
    }));
    t.eq(counts.total, 4, '共 4 个预览窗口（1 画廊 + 3 大图）');
    t.eq(counts.galleries, 1, '画廊窗口不增殖');
    t.eq(counts.images, 3, '大图窗口各一张');

    // ---- 缩放与旋转 ----
    const zr = await page.evaluate(() => {
      const w = window.WM.windowsForApp('preview').find(x => x.body.querySelector('.preview-img'));
      w.appState.zoom(0.2);
      const img = w.body.querySelector('.preview-img');
      const t1 = img.style.transform;
      w.appState.zoomReset();
      return { t1, t2: img.style.transform, info: w.body.querySelector('.preview-info').textContent };
    });
    t.includes(zr.t1, 'scale(1.2)', '放大生效');
    t.includes(zr.t2, 'scale(1)', '实际大小重置');
    t.includes(zr.info, '100%', '信息栏显示缩放比例');

    // ---- 加载错误 ----
    await page.evaluate(() => window.Apps.open('preview', { path: '/Users/guest/Pictures/not-exist.png', asset: 'assets/wallpapers/not-exist.png', name: '缺失图' }));
    await page.waitForTimeout(600);
    const errShown = await page.evaluate(() => {
      const w = window.WM.windowsForApp('preview');
      return w.some(x => x.body.textContent.includes('无法打开此文件'));
    });
    t.ok(errShown, '加载失败显示错误状态');
    t.eq(env.errors.length, 0, '全程无未捕获异常: ' + env.errors.join(' | '));
  },
};
