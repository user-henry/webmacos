'use strict';
/* 任务书测试 16：本地 assets 引用完整性（缺失数 = 0） */
const fs = require('fs');
const path = require('path');
module.exports = {
  name: '16-assets',
  title: '源码引用的 assets/ 路径与运行时图标/壁纸/音视频全部存在',
  async run({ t, track, newPage, unlock, http, ROOT }) {
    const missing = [];
    const check = p => {
      if (!p || typeof p !== 'string') { missing.push('(无效引用: ' + p + ')'); return; }
      if (!fs.existsSync(path.join(ROOT, p))) missing.push(p);
    };

    // ---- 静态扫描：html/css/js 中的 assets/ 字面量引用 ----
    const files = ['index.html'];
    ['css', 'js'].forEach(d => fs.readdirSync(path.join(ROOT, d)).forEach(f => files.push(d + '/' + f)));
    const re = /assets\/[\w\-./%]+?\.(?:png|jpg|jpeg|svg|mp3|mp4|webm)/gi;
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf-8');
      const hits = src.match(re) || [];
      hits.forEach(h => check(decodeURIComponent(h)));
    }

    // ---- 运行时数据：应用图标、壁纸、音频、视频、商店页素材 ----
    const env = track(await newPage(http));
    await unlock(env.page);
    const dyn = await env.page.evaluate(() => ({
      appIcons: Object.values(window.Apps.registry).map(a => a.icon),
      wallpapers: window.WALLPAPERS.map(w => w.src),
      tracks: window.MUSIC_TRACKS.map(t => 'assets/audio/' + t.file + '.mp3'),
      videos: window.QT_VIDEOS.map(v => v.file),
      storeHeros: [...document.querySelectorAll('#menubar-left img, .window img')].map(i => i.getAttribute('src')).filter(Boolean),
    }));
    dyn.appIcons.forEach(check);
    dyn.wallpapers.forEach(check);
    dyn.tracks.forEach(check);
    dyn.videos.forEach(v => { check('assets/video/' + v); check('assets/video/' + v.replace('.mp4', '.webm')); });

    t.eq(missing.length, 0, '本地 assets 引用缺失数 = 0，缺失: ' + missing.join(', '));
    t.eq(env.errors.length, 0, '无未捕获异常: ' + env.errors.join(' | '));
  },
};
