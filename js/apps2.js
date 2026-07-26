/* ============ 媒体应用：照片 / 音乐 / QuickTime / 预览 / Safari ============ */
'use strict';

/* ==================== 照片 ==================== */
Apps.register({
  id: 'photos', name: '照片', icon: 'assets/icons/photos.png',
  w: 820, h: 560, minW: 480, minH: 320,
  menus() { return stdMenus(this, { view: [] }); },
  photos() {
    return WALLPAPERS.map(w => ({ src: w.src, name: w.name, date: '2026年7月' }));
  },
  render(win) {
    const st = win.appState = { idx: 0 };
    win.body.classList.add('photos-body');
    const side = el('div', { class: 'photos-side' },
      el('div', { class: 'fb-side-title', text: '图库' }),
      el('div', { class: 'fb-side-item sel' }, el('span', { class: 'fb-side-ico', text: '🖼' }), el('span', { text: '所有照片' })),
      el('div', { class: 'fb-side-item' }, el('span', { class: 'fb-side-ico', text: '⭐' }), el('span', { text: '个人收藏' })),
      el('div', { class: 'fb-side-item' }, el('span', { class: 'fb-side-ico', text: '🕘' }), el('span', { text: '最近项目' })));
    const grid = el('div', { class: 'photos-grid' });
    win.body.append(side, grid);
    const items = this.photos();
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      const cell = el('div', { class: 'photo-cell', tabindex: '0' });
      const im = iconImg(p.src, '', p.name);
      im.addEventListener('error', () => { cell.classList.add('photo-missing'); cell.innerHTML = ''; cell.append(el('div', { class: 'photo-fallback', text: '🌄' })); }, { once: true });
      cell.append(im, el('div', { class: 'photo-name', text: p.name }));
      cell.addEventListener('click', () => openLightbox(i));
      grid.append(cell);
    }
    const openLightbox = i => {
      st.idx = i;
      const lb = el('div', { class: 'lightbox', tabindex: '0' });
      const counter = el('div', { class: 'lb-counter' });
      const im = el('img', { class: 'lb-img', alt: '' });
      const close = () => lb.remove();
      const show = () => {
        const p = items[st.idx];
        im.src = p.src; im.onerror = () => { im.remove(); lb.append(el('div', { class: 'lb-fallback', text: '图片不可用' })); };
        counter.textContent = `${p.name} — ${st.idx + 1} / ${items.length}`;
      };
      const nav = d => { st.idx = (st.idx + d + items.length) % items.length; show(); };
      lb.append(
        el('button', { class: 'lb-btn lb-close', html: '✕', title: '关闭', onclick: close }),
        el('button', { class: 'lb-btn lb-prev', html: '‹', title: '上一张', onclick: e => { e.stopPropagation(); nav(-1); } }),
        im, counter,
        el('button', { class: 'lb-btn lb-next', html: '›', title: '下一张', onclick: e => { e.stopPropagation(); nav(1); } }));
      lb.addEventListener('click', e => { if (e.target === lb) close(); });
      lb.addEventListener('keydown', e => {
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowLeft') nav(-1);
        if (e.key === 'ArrowRight') nav(1);
      });
      win.body.append(lb);
      show(); lb.focus();
    };
  }
});

/* ==================== 音乐 ==================== */
const MUSIC_TRACKS = [
  { file: 'Monkeys Spinning Monkeys', title: 'Monkeys Spinning Monkeys', album: 'Hidden Agenda', dur: 22 },
  { file: 'Fluffing a Duck', title: 'Fluffing a Duck', album: 'Curious', dur: 32 },
  { file: 'Carefree', title: 'Carefree', album: 'Life of Riley', dur: 59 },
  { file: 'Daily Beetle', title: 'Daily Beetle', album: 'Daily Beetle', dur: 38 },
  { file: 'Sneaky Snitch', title: 'Sneaky Snitch', album: 'Mysterioso', dur: 25 },
  { file: 'Wallpaper', title: 'Wallpaper', album: 'Wallpaper', dur: 28 },
];
Apps.register({
  id: 'music', name: '音乐', icon: 'assets/icons/music.png',
  w: 780, h: 520, minW: 520, minH: 360,
  menus(win) {
    const st = win?.appState;
    return stdMenus(this, {
      file: [{ label: '播放', key: '空格', action: () => st?.toggle() }],
    });
  },
  render(win) {
    const st = win.appState = { idx: -1, playing: false, failed: false };
    win.body.classList.add('music-body');
    const side = el('div', { class: 'photos-side music-side' },
      el('div', { class: 'fb-side-title', text: '资料库' }),
      el('div', { class: 'fb-side-item sel' }, el('span', { class: 'fb-side-ico', text: '🎵' }), el('span', { text: '歌曲' })),
      el('div', { class: 'fb-side-item' }, el('span', { class: 'fb-side-ico', text: '💿' }), el('span', { text: '专辑' })),
      el('div', { class: 'fb-side-item' }, el('span', { class: 'fb-side-ico', text: '🎤' }), el('span', { text: '艺人' })),
      el('div', { class: 'music-credit', text: '音乐：Kevin MacLeod\nincompetech.com\nCC-BY 4.0' }));
    const listEl = el('div', { class: 'music-list' });
    const main = el('div', { class: 'music-main' }, listEl);
    const artEl = el('div', { class: 'music-art' }, iconImg(this.icon, '', ''));
    const titleEl = el('div', { class: 'music-now-title', text: '未在播放' });
    const subEl = el('div', { class: 'music-now-sub', text: 'Kevin MacLeod' });
    const prevBtn = el('button', { class: 'music-ctl', html: '⏮', title: '上一首' });
    const playBtn = el('button', { class: 'music-ctl play', html: '▶', title: '播放/暂停' });
    const nextBtn = el('button', { class: 'music-ctl', html: '⏭', title: '下一首' });
    const curT = el('span', { class: 'music-time', text: '0:00' });
    const durT = el('span', { class: 'music-time', text: '--:--' });
    const seek = el('input', { type: 'range', class: 'slider music-seek', min: '0', max: '100', value: '0' });
    const bar = el('div', { class: 'music-bar' },
      el('div', { class: 'music-now' }, artEl, el('div', null, titleEl, subEl)),
      el('div', { class: 'music-center' },
        el('div', { class: 'music-ctls' }, prevBtn, playBtn, nextBtn),
        el('div', { class: 'music-seek-row' }, curT, seek, durT)),
      el('div', { class: 'music-vol' }, (() => {
        // 统一音量模型：App 内滑块即全局音量控制器（与控制中心一致），并随全局变化同步
        const v = el('input', { type: 'range', class: 'slider', min: '0', max: '100', value: String(Math.round(Sys.settings.volume * 100)), title: '音量（全局）' });
        v.style.width = '76px';
        v.style.setProperty('--fill', (Sys.settings.volume * 100) + '%');
        v.addEventListener('input', () => {
          Sys.settings.volume = v.value / 100; Sys.settings.muted = v.value == 0;
          v.style.setProperty('--fill', v.value + '%');
          Sys.applyVolume(); Sys.save();
        });
        win._volUnsub = Bus.on('volume:changed', gv => { v.value = String(Math.round(gv * 100)); v.style.setProperty('--fill', (gv * 100) + '%'); });
        return v;
      })()));
    win.body.append(main, bar);
    const audio = new Audio();
    Sys.registerMedia(audio);
    audio.preload = 'metadata';
    win.onClose = () => { audio.pause(); audio.src = ''; Sys.unregisterMedia(audio); win._volUnsub && win._volUnsub(); };

    const renderList = () => {
      listEl.innerHTML = '';
      const head = el('div', { class: 'music-row music-head' },
        el('span', { text: '' }), el('span', { text: '标题' }), el('span', { text: '专辑' }), el('span', { text: '时长' }));
      listEl.append(head);
      MUSIC_TRACKS.forEach((t, i) => {
        const row = el('div', { class: 'music-row' + (i === st.idx ? ' sel' : '') },
          el('span', { class: 'music-note', text: i === st.idx && st.playing ? '♪' : String(i + 1) }),
          el('span', { class: 'music-t' }, el('b', { text: t.title }), el('small', { text: 'Kevin MacLeod' })),
          el('span', { class: 'music-album', text: t.album }),
          el('span', { class: 'music-dur', text: fmtDur(t.dur) }));
        row.addEventListener('click', () => playAt(i));
        listEl.append(row);
      });
    };
    const setNow = () => {
      const t = MUSIC_TRACKS[st.idx];
      titleEl.textContent = t ? t.title : '未在播放';
      subEl.textContent = t ? `Kevin MacLeod — ${t.album}` : 'Kevin MacLeod';
      artEl.classList.toggle('spin', st.playing);
    };
    const playAt = i => {
      st.idx = i; st.failed = false;
      const t = MUSIC_TRACKS[i];
      audio.src = `assets/audio/${encodeURIComponent(t.file)}.mp3`;
      audio.play().then(() => { st.playing = true; syncUI(); }).catch(() => { st.playing = false; st.failed = true; syncUI(); });
      renderList(); setNow();
    };
    st.toggle = () => {
      if (st.idx < 0) return playAt(0);
      if (audio.paused) audio.play().then(() => { st.playing = true; syncUI(); }).catch(() => { st.failed = true; syncUI(); });
      else { audio.pause(); st.playing = false; syncUI(); }
    };
    const syncUI = () => {
      playBtn.innerHTML = st.playing ? '⏸' : '▶';
      if (st.failed) { titleEl.textContent = '无法播放'; subEl.textContent = '音频文件缺失或加载失败'; }
      renderList(); setNow();
    };
    audio.addEventListener('timeupdate', () => {
      if (!audio.duration) return;
      curT.textContent = fmtDur(audio.currentTime);
      durT.textContent = fmtDur(audio.duration);
      seek.value = String((audio.currentTime / audio.duration) * 100);
      seek.style.setProperty('--fill', seek.value + '%');
    });
    audio.addEventListener('ended', () => playAt((st.idx + 1) % MUSIC_TRACKS.length));
    audio.addEventListener('error', () => { st.playing = false; st.failed = true; syncUI(); });
    seek.addEventListener('input', () => {
      if (audio.duration) { audio.currentTime = (seek.value / 100) * audio.duration; seek.style.setProperty('--fill', seek.value + '%'); }
    });
    prevBtn.addEventListener('click', () => playAt((st.idx - 1 + MUSIC_TRACKS.length) % MUSIC_TRACKS.length));
    nextBtn.addEventListener('click', () => playAt((st.idx + 1) % MUSIC_TRACKS.length));
    playBtn.addEventListener('click', () => st.toggle());
    win.el.addEventListener('keydown', e => { if (e.key === ' ' && !e.target.matches('input,textarea')) { e.preventDefault(); st.toggle(); } });
    renderList();
  }
});

/* ==================== QuickTime Player ==================== */
const QT_VIDEOS = [
  { file: 'flower.mp4', title: '花朵', src: 'CC0 / MDN' },
  { file: 'friday.mp4', title: '星期五', src: 'CC0 / MDN' },
  { file: 'big-buck-bunny.mp4', title: '大雄兔', src: 'CC-BY / Blender' },
];
Apps.register({
  id: 'quicktime', name: 'QuickTime Player', icon: 'assets/icons/quicktime.svg',
  w: 720, h: 500, minW: 420, minH: 300,
  menus(win) {
    const st = win?.appState;
    return stdMenus(this, {
      file: [
        { label: '播放/暂停', key: '空格', action: () => st?.toggle() },
        { label: '下一个视频', action: () => st?.nav(1) },
        { label: '上一个视频', action: () => st?.nav(-1) },
      ]
    });
  },
  render(win) {
    const st = win.appState = { idx: 0 };
    win.body.classList.add('qt-body');
    const video = el('video', { class: 'qt-video', playsinline: '' });
    const errBox = el('div', { class: 'qt-error hidden' },
      el('div', { class: 'es-icon', text: '🎬' }),
      el('div', { text: '无法播放此视频' }),
      el('div', { class: 'qt-error-sub', text: '文件缺失或格式不受支持' }));
    const stage = el('div', { class: 'qt-stage' }, video, errBox);
    const playBtn = el('button', { class: 'qt-btn', html: '▶', title: '播放/暂停' });
    const prevBtn = el('button', { class: 'qt-btn', html: '⏮', title: '上一个' });
    const nextBtn = el('button', { class: 'qt-btn', html: '⏭', title: '下一个' });
    const curT = el('span', { class: 'music-time', text: '0:00' });
    const durT = el('span', { class: 'music-time', text: '--:--' });
    const seek = el('input', { type: 'range', class: 'slider qt-seek', min: '0', max: '100', value: '0' });
    const vol = el('input', { type: 'range', class: 'slider qt-vol', min: '0', max: '100', value: String(Math.round(Sys.settings.volume * 100)), title: '音量' });
    const fsBtn = el('button', { class: 'qt-btn', html: '⛶', title: '全屏' });
    const nameEl = el('div', { class: 'qt-name' });
    const controls = el('div', { class: 'qt-controls' },
      playBtn, prevBtn, nextBtn, curT, seek, durT,
      (() => { const i = el('span', { class: 'qt-vol-ico', text: '🔊' }); return i; })(), vol, fsBtn);
    win.body.append(stage, controls);
    Sys.registerMedia(video);
    win.onClose = () => { video.pause(); video.src = ''; Sys.unregisterMedia(video); win._volUnsub && win._volUnsub(); };

    const load = () => {
      const v = QT_VIDEOS[st.idx];
      WM.setTitle(win, `${v.title} — QuickTime Player`);
      nameEl.textContent = '';
      errBox.classList.add('hidden');
      video.classList.remove('hidden');
      video.innerHTML = `<source src="assets/video/${v.file}" type="video/mp4"><source src="assets/video/${v.file.replace('.mp4', '.webm')}" type="video/webm">`;
      video.load();
      video.play().catch(() => syncPlay());
    };
    const syncPlay = () => { playBtn.innerHTML = video.paused ? '▶' : '⏸'; };
    st.toggle = () => { video.paused ? video.play().catch(() => {}) : video.pause(); };
    st.nav = d => { st.idx = (st.idx + d + QT_VIDEOS.length) % QT_VIDEOS.length; load(); };
    video.addEventListener('play', syncPlay);
    video.addEventListener('pause', syncPlay);
    video.addEventListener('timeupdate', () => {
      if (!video.duration) return;
      curT.textContent = fmtDur(video.currentTime);
      durT.textContent = fmtDur(video.duration);
      seek.value = String((video.currentTime / video.duration) * 100);
      seek.style.setProperty('--fill', seek.value + '%');
    });
    video.addEventListener('ended', () => st.nav(1));
    video.addEventListener('error', () => {
      video.classList.add('hidden');
      errBox.classList.remove('hidden');
    });
    stage.addEventListener('click', () => st.toggle());
    seek.addEventListener('input', () => { if (video.duration) video.currentTime = (seek.value / 100) * video.duration; });
    vol.addEventListener('input', () => {
      // 统一音量模型：直写全局设置，applyVolume 会作用于全部已注册媒体
      Sys.settings.volume = vol.value / 100; Sys.settings.muted = vol.value == 0;
      vol.style.setProperty('--fill', vol.value + '%');
      Sys.applyVolume(); Sys.save();
    });
    win._volUnsub = Bus.on('volume:changed', gv => { vol.value = String(Math.round(gv * 100)); vol.style.setProperty('--fill', (gv * 100) + '%'); });
    playBtn.addEventListener('click', () => st.toggle());
    prevBtn.addEventListener('click', () => st.nav(-1));
    nextBtn.addEventListener('click', () => st.nav(1));
    fsBtn.addEventListener('click', () => { stage.requestFullscreen ? stage.requestFullscreen().catch(() => {}) : null; });
    win.el.addEventListener('keydown', e => { if (e.key === ' ' && !e.target.matches('input')) { e.preventDefault(); st.toggle(); } });
    load();
  }
});

/* ==================== 预览 ==================== */
Apps.register({
  id: 'preview', name: '预览', icon: 'assets/icons/preview.svg',
  w: 720, h: 540, minW: 380, minH: 280, singleton: false,
  menus(win) {
    const st = win?.appState;
    return stdMenus(this, {
      view: [
        { label: '放大', key: '⌘+', action: () => st?.zoom(0.2) },
        { label: '缩小', key: '⌘−', action: () => st?.zoom(-0.2) },
        { label: '实际大小', key: '⌘0', action: () => st?.zoomReset() },
      ]
    });
  },
  render(win, args) {
    const st = win.appState = { scale: 1, rot: 0, path: args.path || null };
    win.body.classList.add('preview-body');
    const zOut = el('button', { class: 'fb-btn', text: '−', title: '缩小' });
    const zIn = el('button', { class: 'fb-btn', text: '＋', title: '放大' });
    const rotBtn = el('button', { class: 'fb-btn', html: '⟳', title: '旋转' });
    const infoEl = el('span', { class: 'preview-info' });
    const toolbar = el('div', { class: 'fb-toolbar preview-toolbar' }, zOut, zIn, rotBtn, infoEl);
    const stage = el('div', { class: 'preview-stage' });
    win.body.append(toolbar, stage);
    st.zoom = d => { st.scale = clamp(st.scale + d, 0.2, 4); apply(); };
    st.zoomReset = () => { st.scale = 1; st.rot = 0; apply(); };
    zIn.addEventListener('click', () => st.zoom(0.2));
    zOut.addEventListener('click', () => st.zoom(-0.2));
    rotBtn.addEventListener('click', () => { st.rot = (st.rot + 90) % 360; apply(); });
    let contentEl = null;
    const apply = () => { if (contentEl) contentEl.style.transform = `scale(${st.scale}) rotate(${st.rot}deg)`; infoEl.textContent = `缩放 ${Math.round(st.scale * 100)}%` + (st.isPdf ? ' · 第 1 页，共 1 页' : ''); };
    const showError = msg => {
      stage.innerHTML = '';
      stage.append(el('div', { class: 'empty-state' }, el('div', { class: 'es-icon', text: '🚫' }), el('div', { text: '无法打开此文件' }), el('div', { class: 'preview-err-sub', text: msg })));
      infoEl.textContent = '';
    };
    // args.asset 优先于「无 path 显示画廊」：壁纸缩略图点击后必须打开实际大图
    if (args.asset) st.path = args.asset;
    if (!st.path) {
      // 从 Dock 打开：显示内置图片集
      const gallery = el('div', { class: 'preview-gallery' });
      WALLPAPERS.forEach(w => {
        const im = iconImg(w.src, '', w.name);
        const cell = el('div', { class: 'preview-cell' }, im, el('div', { class: 'photo-name', text: w.name }));
        cell.addEventListener('click', () => { Apps.open('preview', { asset: w.src, name: w.name }); });
        gallery.append(cell);
      });
      stage.append(gallery);
      infoEl.textContent = '点击查看大图';
      WM.setTitle(win, '图片集 — 预览');
      return;
    }
    const asset = args.asset || null; // asset 已与 st.path 归一
    const ext = (st.path.split('.').pop() || '').toLowerCase();
    if (asset || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
      const src = asset || st.path;
      contentEl = el('img', { class: 'preview-img', alt: args.name || FS.baseName(src) });
      contentEl.addEventListener('error', () => showError('图片数据不可用（虚拟文件或资源缺失）。'));
      contentEl.src = src;
      stage.append(el('div', { class: 'preview-canvas' }, contentEl));
      WM.setTitle(win, (args.name || FS.baseName(src)) + ' — 预览');
      apply();
    } else if (ext === 'pdf') {
      contentEl = el('div', { class: 'preview-pdf' },
        el('div', { class: 'preview-pdf-badge', text: 'PDF' }),
        el('div', { class: 'preview-pdf-name', text: FS.baseName(st.path) }),
        el('div', { class: 'preview-pdf-sub', text: '虚拟 PDF 文档 · 第 1 页，共 1 页' }));
      st.isPdf = true;
      stage.append(el('div', { class: 'preview-canvas' }, contentEl));
      apply();
    } else {
      // 文本类
      try {
        const txt = FS.read(st.path);
        contentEl = el('pre', { class: 'preview-text', text: txt });
        stage.append(el('div', { class: 'preview-canvas' }, contentEl));
        apply();
      } catch (e) { showError(e.message); }
    }
  }
});

/* ==================== Safari ==================== */
Apps.register({
  id: 'safari', name: 'Safari 浏览器', icon: 'assets/icons/safari.png',
  w: 900, h: 600, minW: 560, minH: 380,
  menus(win) {
    const st = win?.appState;
    return stdMenus(this, {
      file: [
        { label: '新建窗口', key: '⌘N', action: () => Apps.open('safari') },
        { label: '重新载入页面', key: '⌘R', action: () => st?.reload() },
      ],
      view: [
        { label: '后退', key: '⌘[', disabled: !st?.canBack(), action: () => st?.back() },
        { label: '前进', key: '⌘]', disabled: !st?.canFwd(), action: () => st?.fwd() },
      ]
    });
  },
  builtinPages: {
    'macos://weather': { title: '天气 - 内置页', build: box => WeatherApp.renderInline(box) },
    'macos://news': {
      title: '科技新闻 - 内置页',
      build: box => {
        box.append(el('h2', { text: '科技要闻' }));
        [
          ['macOS 网页版发布', '完全在浏览器中运行的桌面体验，支持虚拟文件系统与窗口管理。'],
          ['本地优先的软件设计兴起', '越来越多的应用选择将数据保存在本地，兼顾隐私与离线可用性。'],
          ['Web 平台能力持续增强', '通知、文件系统访问与硬件加速让网页应用接近原生体验。'],
          ['开源社区年度盘点', '来自全球的开发者为桌面模拟器项目贡献了图标、壁纸与音视频素材。'],
        ].forEach(([t, d]) => box.append(el('div', { class: 'sf-news-item' }, el('b', { text: t }), el('p', { text: d }))));
      }
    },
    'macos://baike': {
      title: '百科 - 内置页',
      build: box => {
        box.append(el('h2', { text: 'macOS' }));
        box.append(el('p', { text: 'macOS 是苹果公司为 Mac 系列电脑开发的操作系统，以图形用户界面、UNIX 内核与深度软硬件整合著称。本页面由 Safari 内置百科提供，离线可读。' }));
        box.append(el('h3', { text: '版本沿革' }));
        box.append(el('p', { text: 'Cheetah、Puma、Jaguar、Panther、Tiger、Leopard、Snow Leopard、Lion、Mountain Lion、Mavericks、Yosemite、El Capitan、Sierra、High Sierra、Mojave、Catalina、Big Sur、Monterey、Ventura、Sonoma、Sequoia。' }));
        box.append(el('h3', { text: '特色功能' }));
        box.append(el('p', { text: '访达、程序坞、聚焦搜索、控制中心、通知中心、启动台、调度中心等。' }));
      }
    },
    'macos://github': {
      title: '代码仓库 - 内置页',
      build: box => {
        box.append(el('h2', { text: 'macos-web' }));
        box.append(el('p', { text: '一个纯静态的 macOS 桌面模拟器。' }));
        box.append(el('pre', { class: 'sf-code', text: ['macos-web/', '├── index.html', '├── css/          # 样式', '├── js/           # 系统与应用', '└── assets/       # 图标 / 壁纸 / 音视频'].join('\n') }));
        box.append(el('p', { text: '许可：MIT。素材来源：Kevin MacLeod (CC-BY)、Blender 基金会 (CC-BY)、MDN (CC0)。' }));
      }
    },
  },
  render(win, args) {
    const st = win.appState = { hist: [], hi: -1, loading: false };
    const favs = Store.get('safari-favs', [
      { name: '天气', url: 'macos://weather', ico: '🌤' },
      { name: '科技新闻', url: 'macos://news', ico: '📰' },
      { name: '百科', url: 'macos://baike', ico: '📚' },
      { name: '代码仓库', url: 'macos://github', ico: '💻' },
    ]);
    win.body.classList.add('safari-body');
    const backBtn = el('button', { class: 'fb-btn', html: '‹', title: '后退' });
    const fwdBtn = el('button', { class: 'fb-btn', html: '›', title: '前进' });
    const reloadBtn = el('button', { class: 'fb-btn', html: '⟳', title: '重新载入' });
    const addr = el('input', { class: 'text-input sf-addr', type: 'text', placeholder: '搜索或输入网站地址', spellcheck: 'false', 'aria-label': '地址栏' });
    const progress = el('div', { class: 'sf-progress' });
    const toolbar = el('div', { class: 'fb-toolbar sf-toolbar' }, backBtn, fwdBtn, reloadBtn,
      el('div', { class: 'sf-addr-wrap' }, addr, progress));
    const page = el('div', { class: 'sf-page' });
    win.body.append(toolbar, page);
    st.canBack = () => st.hi > 0;
    st.canFwd = () => st.hi < st.hist.length - 1;
    const syncNav = () => { backBtn.disabled = !st.canBack(); fwdBtn.disabled = !st.canFwd(); };
    const setLoading = on => {
      st.loading = on;
      progress.style.width = on ? '70%' : '100%';
      progress.style.opacity = on ? '1' : '0';
      if (on) setTimeout(() => { if (st.loading) { progress.style.transition = 'width 2s ease'; progress.style.width = '92%'; } }, 60);
      else { progress.style.transition = 'width .2s ease'; setTimeout(() => progress.style.width = '0', 240); }
    };
    const showStart = () => {
      page.innerHTML = '';
      WM.setTitle(win, '起始页 — Safari 浏览器');
      addr.value = '';
      const wrap = el('div', { class: 'sf-start' }, el('h2', { text: '个人收藏' }));
      const grid = el('div', { class: 'sf-fav-grid' });
      favs.forEach(f => {
        const c = el('div', { class: 'sf-fav' },
          el('div', { class: 'sf-fav-ico', text: f.ico }),
          el('div', { class: 'sf-fav-name', text: f.name }));
        c.addEventListener('click', () => navigate(f.url));
        grid.append(c);
      });
      wrap.append(grid, el('p', { class: 'sf-tip', text: '在地址栏输入 macos://weather 等内置地址，或输入网址查看离线回退页。' }));
      page.append(wrap);
    };
    const showOffline = url => {
      page.innerHTML = '';
      WM.setTitle(win, '无法连接 — Safari 浏览器');
      const engine = Sys.settings.searchEngine === 'baidu' ? '百度' : 'Bing';
      page.append(el('div', { class: 'sf-offline' },
        el('div', { class: 'sf-offline-globe', text: '🌐' }),
        el('h3', { text: 'Safari 浏览器无法打开页面' }),
        el('p', { text: `你的 Mac 当前处于离线环境，无法连接到“${url.replace(/^https?:\/\//, '').slice(0, 60)}”。` }),
        el('p', { class: 'sf-offline-sub', text: '内置页面（天气、新闻、百科）仍可离线访问；也可以在系统浏览器中新标签页打开该地址。' }),
        el('div', { class: 'sf-offline-btns' },
          el('button', { class: 'btn primary', text: '在新标签页打开', onclick: () => window.open(url, '_blank', 'noopener') }),
          el('button', { class: 'btn', text: '返回起始页', onclick: () => navigate('macos://start') })),
        el('p', { class: 'sf-offline-sub', text: `当前搜索引擎：${engine}（可在 系统设置 › Safari 中修改）` })));
    };
    const navigate = (url, push = true) => {
      url = (url || '').trim();
      if (!url) return showStart();
      setLoading(true);
      setTimeout(() => {
        setLoading(false);
        if (push) { st.hist = st.hist.slice(0, st.hi + 1); st.hist.push(url); st.hi++; }
        syncNav();
        if (url === 'macos://start') return showStart();
        const bp = Apps.get('safari').builtinPages[url];
        if (bp) {
          page.innerHTML = '';
          addr.value = url;
          WM.setTitle(win, bp.title);
          const box = el('div', { class: 'sf-builtin' });
          try { bp.build(box); } catch (e) { box.append(el('p', { text: '页面加载失败。' })); }
          page.append(box);
          return;
        }
        if (/^https?:\/\//i.test(url)) { addr.value = url; return showOffline(url); }
        // 视为搜索
        const q = encodeURIComponent(url);
        const su = Sys.settings.searchEngine === 'baidu' ? `https://www.baidu.com/s?wd=${q}` : `https://www.bing.com/search?q=${q}`;
        addr.value = su;
        showOffline(su);
      }, 380);
    };
    st.back = () => { if (st.canBack()) { st.hi--; const u = st.hist[st.hi]; navigate(u, false); } };
    st.fwd = () => { if (st.canFwd()) { st.hi++; const u = st.hist[st.hi]; navigate(u, false); } };
    st.reload = () => { const u = st.hist[st.hi] || 'macos://start'; navigate(u, false); };
    backBtn.addEventListener('click', () => st.back());
    fwdBtn.addEventListener('click', () => st.fwd());
    reloadBtn.addEventListener('click', () => st.reload());
    addr.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        let v = addr.value.trim();
        if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v) && !v.includes(' ')) v = 'https://' + v;
        navigate(v);
      }
    });
    navigate(args.url || 'macos://start', true);
  }
});
window.MUSIC_TRACKS = MUSIC_TRACKS; window.QT_VIDEOS = QT_VIDEOS;
