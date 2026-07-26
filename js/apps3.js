/* ============ 扩展应用 A：启动台 / 地图 / App Store / 活动监视器 / 天气 / 时钟 ============ */
'use strict';

/* ==================== 启动台 ==================== */
Apps.register({
  id: 'launchpad', name: '启动台', icon: 'assets/icons/launchpad.png',
  menus() { return stdMenus(this); },
  render() { /* 不走 WM 窗口 */ },
  open() { Launchpad.show(); }
});
const Launchpad = {
  overlay: null,
  show() {
    if (this.overlay) return this.hide();
    const ov = el('div', { class: 'launchpad', tabindex: '0' });
    const search = el('input', { class: 'lp-search', type: 'search', placeholder: '搜索 App' });
    const grid = el('div', { class: 'lp-grid' });
    ov.append(el('div', { class: 'lp-search-wrap' }, search), grid);
    const renderGrid = q => {
      grid.innerHTML = '';
      const apps = Object.values(Apps.registry)
        .filter(a => a.id !== 'launchpad' && (!a.storeApp || AppStoreApp.isInstalled(a.id)))
        .filter(a => !q || a.name.toLowerCase().includes(q.toLowerCase()));
      if (!apps.length) grid.append(el('div', { class: 'lp-empty', text: '没有匹配的 App' }));
      apps.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')).forEach(app => {
        const c = el('div', { class: 'lp-cell' }, iconImg(app.icon, '', app.name), el('div', { class: 'lp-name', text: app.name }));
        c.addEventListener('click', () => { this.hide(); Apps.open(app.id); });
        grid.append(c);
      });
    };
    renderGrid('');
    search.addEventListener('input', () => renderGrid(search.value.trim()));
    search.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') this.hide(); });
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') this.hide(); });
    ov.addEventListener('click', e => { if (e.target === ov) this.hide(); });
    document.body.append(ov);
    this.overlay = ov;
    setTimeout(() => { ov.classList.add('show'); search.focus(); }, 10);
  },
  hide() {
    if (!this.overlay) return;
    const ov = this.overlay;
    this.overlay = null;
    ov.classList.remove('show');
    setTimeout(() => ov.remove(), 250);
  }
};
window.Launchpad = Launchpad;
const _origAppsOpen = Apps.open.bind(Apps);
Apps.open = function (id, args) {
  if (id === 'launchpad') { Launchpad.show(); return null; }
  if (id === 'stickies' && !(args && args.noteId)) { Apps.get('stickies').openAll(); return null; }
  const app = this.get(id);
  if (app && app.storeApp && !AppStoreApp.isInstalled(id)) {
    UI.alert('尚未安装', `请先在 App Store 中获取“${app.name}”。`, 'assets/icons/appstore.png');
    return null;
  }
  return _origAppsOpen(id, args);
};

/* ==================== 地图（离线设计版） ==================== */
const MAP_POIS = [
  { name: '天安门广场', x: 0.50, y: 0.52, kind: 'landmark' },
  { name: '故宫博物院', x: 0.50, y: 0.45, kind: 'landmark' },
  { name: '王府井大街', x: 0.56, y: 0.50, kind: 'shopping' },
  { name: '北海公园', x: 0.44, y: 0.42, kind: 'park' },
  { name: '颐和园', x: 0.18, y: 0.18, kind: 'park' },
  { name: '北京站', x: 0.60, y: 0.62, kind: 'transit' },
  { name: '中关村', x: 0.30, y: 0.25, kind: 'shopping' },
  { name: '三里屯', x: 0.68, y: 0.42, kind: 'shopping' },
  { name: '奥林匹克公园', x: 0.52, y: 0.20, kind: 'park' },
  { name: '北京西站', x: 0.32, y: 0.66, kind: 'transit' },
  { name: '国贸 CBD', x: 0.66, y: 0.56, kind: 'landmark' },
  { name: '南锣鼓巷', x: 0.50, y: 0.40, kind: 'landmark' },
];
Apps.register({
  id: 'maps', name: '地图', icon: 'assets/icons/maps.png',
  w: 860, h: 580, minW: 520, minH: 360,
  menus(win) {
    const st = win?.appState;
    return stdMenus(this, {
      view: [
        { label: '标准', checked: st?.mode === 'std', action: () => st?.setMode('std') },
        { label: '卫星', checked: st?.mode === 'sat', action: () => st?.setMode('sat') },
        { sep: true },
        { label: '放大', key: '⌘+', action: () => st?.zoomBy(1) },
        { label: '缩小', key: '⌘−', action: () => st?.zoomBy(-1) },
      ]
    });
  },
  render(win) {
    const st = win.appState = { mode: 'std', zoom: 3, cx: 0.5, cy: 0.48, pin: null };
    win.body.classList.add('maps-body');
    const search = el('input', { class: 'text-input maps-search', type: 'search', placeholder: '搜索地点或地址' });
    const results = el('div', { class: 'maps-results hidden' });
    const seg = el('div', { class: 'segmented maps-seg' },
      el('button', { text: '标准', class: 'on', onclick: () => { st.setMode('std'); seg.children[0].classList.add('on'); seg.children[1].classList.remove('on'); } }),
      el('button', { text: '卫星', onclick: () => { st.setMode('sat'); seg.children[1].classList.add('on'); seg.children[0].classList.remove('on'); } }));
    const zIn = el('button', { class: 'maps-zoom', text: '＋', title: '放大' });
    const zOut = el('button', { class: 'maps-zoom', text: '−', title: '缩小' });
    const locate = el('button', { class: 'maps-locate', html: '◎', title: '我的位置' });
    const canvas = el('canvas', { class: 'maps-canvas' });
    const offlineTag = el('div', { class: 'maps-offline-tag', text: '离线地图 · 北京市（示意图）' });
    win.body.append(canvas, el('div', { class: 'maps-top' }, search), results, seg,
      el('div', { class: 'maps-zoom-col' }, zIn, zOut), locate, offlineTag);
    const ctx = canvas.getContext('2d');
    st.setMode = m => { st.mode = m; draw(); };
    st.zoomBy = d => { st.zoom = clamp(st.zoom + d, 1, 6); draw(); };
    zIn.addEventListener('click', () => st.zoomBy(1));
    zOut.addEventListener('click', () => st.zoomBy(-1));
    locate.addEventListener('click', () => { st.cx = 0.5; st.cy = 0.52; st.pin = { name: '我的位置', x: 0.5, y: 0.52 }; draw(); });
    canvas.addEventListener('wheel', e => { e.preventDefault(); st.zoomBy(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    // 拖动平移
    canvas.addEventListener('pointerdown', e => {
      const sx = e.clientX, sy = e.clientY, ox = st.cx, oy = st.cy;
      const scale = Math.pow(1.7, st.zoom - 1);
      const move = ev => {
        st.cx = clamp(ox - (ev.clientX - sx) / (canvas.width * scale / 2), 0, 1);
        st.cy = clamp(oy - (ev.clientY - sy) / (canvas.height * scale / 2), 0, 1);
        draw();
      };
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    });
    const toScreen = (px, py) => {
      const scale = Math.pow(1.7, st.zoom - 1);
      return [canvas.width / 2 + (px - st.cx) * canvas.width * scale / 2,
              canvas.height / 2 + (py - st.cy) * canvas.height * scale / 2];
    };
    const draw = () => {
      const W = canvas.width = canvas.clientWidth * devicePixelRatio;
      const H = canvas.height = canvas.clientHeight * devicePixelRatio;
      const sat = st.mode === 'sat';
      ctx.fillStyle = sat ? '#1c2418' : '#e8e4da';
      ctx.fillRect(0, 0, W, H);
      const scale = Math.pow(1.7, st.zoom - 1);
      // 水面（护城河/湖泊）
      ctx.fillStyle = sat ? '#16202e' : '#a8c8e8';
      const lake = (cx, cy, rx, ry) => { const [x, y] = toScreen(cx, cy); ctx.beginPath(); ctx.ellipse(x, y, rx * W * scale / 2, ry * W * scale / 2, 0, 0, Math.PI * 2); ctx.fill(); };
      lake(0.44, 0.42, 0.05, 0.035); lake(0.17, 0.17, 0.045, 0.05); lake(0.52, 0.21, 0.035, 0.03);
      // 公园绿地
      ctx.fillStyle = sat ? '#22331f' : '#b8d9a8';
      const park = (cx, cy, r) => { const [x, y] = toScreen(cx, cy); ctx.beginPath(); ctx.arc(x, y, r * W * scale / 2, 0, Math.PI * 2); ctx.fill(); };
      park(0.44, 0.42, 0.045); park(0.52, 0.20, 0.05); park(0.18, 0.18, 0.05);
      // 路网
      const road = (x1, y1, x2, y2, w, color) => {
        const [ax, ay] = toScreen(x1, y1), [bx, by] = toScreen(x2, y2);
        ctx.strokeStyle = color; ctx.lineWidth = w * devicePixelRatio * (0.6 + st.zoom * 0.3);
        ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      };
      const main = sat ? '#4a4640' : '#ffffff', ring = sat ? '#57534b' : '#f8d67c';
      for (let i = 1; i < 9; i++) road(i / 9, 0.05, i / 9, 0.95, 3, main);
      for (let j = 1; j < 8; j++) road(0.05, j / 8, 0.95, j / 8, 3, main);
      road(0.1, 0.52, 0.9, 0.52, 6, ring); // 长安街
      road(0.5, 0.08, 0.5, 0.92, 5, ring); // 中轴线
      // 环路
      ctx.strokeStyle = ring; ctx.lineWidth = 4 * devicePixelRatio;
      const [ccx, ccy] = toScreen(0.5, 0.5);
      ctx.beginPath(); ctx.arc(ccx, ccy, 0.16 * W * scale / 2, 0, Math.PI * 2); ctx.stroke();
      // 路名
      if (st.zoom >= 3) {
        ctx.fillStyle = sat ? '#b8b2a4' : '#8a8578';
        ctx.font = `${11 * devicePixelRatio}px sans-serif`;
        const roadName = (t, x, y) => { const [sx, sy] = toScreen(x, y); ctx.fillText(t, sx, sy); };
        roadName('长安街', 0.42, 0.505); roadName('中轴路', 0.505, 0.3);
        roadName('二环路', 0.63, 0.36);
      }
      // POI
      MAP_POIS.forEach(p => {
        const [x, y] = toScreen(p.x, p.y);
        if (x < -60 || y < -60 || x > W + 60 || y > H + 60) return;
        ctx.fillStyle = { park: '#3f9d4e', transit: '#3a7bd5', shopping: '#c86dd7', landmark: '#d5663a' }[p.kind];
        ctx.beginPath(); ctx.arc(x, y, 5 * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
        if (st.zoom >= 2) {
          ctx.fillStyle = sat ? '#e8e4da' : '#3a372f';
          ctx.font = `${10.5 * devicePixelRatio}px sans-serif`;
          ctx.fillText(p.name, x + 8 * devicePixelRatio, y + 4 * devicePixelRatio);
        }
      });
      // 大头针
      if (st.pin) {
        const [x, y] = toScreen(st.pin.x, st.pin.y);
        ctx.fillStyle = '#ff453a';
        ctx.beginPath(); ctx.arc(x, y - 14 * devicePixelRatio, 8 * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 6 * devicePixelRatio, y - 9 * devicePixelRatio);
        ctx.lineTo(x, y + 2 * devicePixelRatio); ctx.lineTo(x + 6 * devicePixelRatio, y - 9 * devicePixelRatio); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${11 * devicePixelRatio}px sans-serif`;
        ctx.fillText(st.pin.name, x + 12 * devicePixelRatio, y - 10 * devicePixelRatio);
      }
    };
    win.timers.push(setInterval(() => { if (canvas.width !== canvas.clientWidth * devicePixelRatio) draw(); }, 500));
    setTimeout(draw, 30);
    // 搜索
    search.addEventListener('input', debounce(() => {
      const q = search.value.trim();
      results.innerHTML = '';
      if (!q) { results.classList.add('hidden'); return; }
      const hits = MAP_POIS.filter(p => p.name.includes(q));
      results.classList.remove('hidden');
      if (!hits.length) results.append(el('div', { class: 'maps-result', text: '本地结果中没有“' + q + '”（离线地图）' }));
      hits.forEach(p => {
        const r = el('div', { class: 'maps-result' }, el('b', { text: p.name }), el('small', { text: { park: '公园', transit: '车站', shopping: '商圈', landmark: '地标' }[p.kind] }));
        r.addEventListener('click', () => {
          st.cx = p.x; st.cy = p.y; st.zoom = Math.max(st.zoom, 4); st.pin = p;
          results.classList.add('hidden'); search.value = p.name; draw();
        });
        results.append(r);
      });
    }, 200));
    search.addEventListener('keydown', e => e.stopPropagation());
  }
});

/* ==================== App Store ==================== */
const STORE_CATALOG = [
  { id: 'bear', name: '熊掌记', cat: '效率', desc: '优雅的 Markdown 笔记', icon: 'assets/icons/bear.png' },
  { id: 'typora', name: 'Typora', cat: '效率', desc: '所见即所得 Markdown 编辑器', icon: 'assets/icons/typora.png' },
  { id: 'vscode', name: 'VS Code Web', cat: '开发', desc: '轻量代码编辑器', icon: 'assets/icons/vscode.png' },
  { id: 'keynote', name: 'Keynote 讲演', cat: '效率', desc: '制作精美演示文稿', icon: 'assets/icons/keynote.png' },
  { id: 'podcasts', name: '播客', cat: '娱乐', desc: '收听你喜爱的节目', icon: 'assets/icons/podcasts.png' },
  { id: 'news', name: 'Apple News', cat: '阅读', desc: '精选科技资讯', icon: 'assets/icons/news.png' },
  { id: 'github', name: 'GitHub Desktop', cat: '开发', desc: '浏览与管理代码仓库', icon: 'assets/icons/github.png' },
  { id: 'tv', name: 'Apple TV', cat: '娱乐', desc: '观看影片与节目', icon: 'assets/icons/tv.png' },
];
const AppStoreApp = {
  id: 'appstore', name: 'App Store', icon: 'assets/icons/appstore.png',
  w: 860, h: 600, minW: 600, minH: 420,
  installed() { return Store.get('appstore-installed', []); },
  isInstalled(id) { return this.installed().includes(id); },
  setInstalled(id) {
    const l = this.installed();
    if (!l.includes(id)) { l.push(id); Store.set('appstore-installed', l); FS.syncApps(); Bus.emit('appstore:changed'); }
  },
  menus(win) {
    return stdMenus(this, {
      store: [
        { label: '发现', action: () => win?.appState?.go('discover') },
        { label: '分类', action: () => win?.appState?.go('cats') },
        { label: '更新', action: () => win?.appState?.go('updates') },
      ]
    });
  },
  onArgs(args, win) { if (args.tab) win.appState?.go(args.tab); },
  render(win) {
    const st = win.appState = { tab: 'discover', q: '' };
    win.body.classList.add('store-body');
    const tabs = [['discover', '发现'], ['cats', '分类'], ['arcade', '搜索'], ['updates', '更新']];
    const tabbar = el('div', { class: 'store-tabs' });
    const search = el('input', { class: 'text-input store-search', type: 'search', placeholder: '搜索 App' });
    const content = el('div', { class: 'store-content' });
    win.body.append(el('div', { class: 'store-top' }, tabbar, search), content);
    const btnFor = item => {
      const installed = this.isInstalled(item.id);
      const b = el('button', { class: 'btn store-get' + (installed ? '' : ' primary'), text: installed ? '打开' : '获取' });
      b.addEventListener('click', () => {
        if (this.isInstalled(item.id)) { Apps.open(item.id); return; }
        b.disabled = true; b.textContent = '安装中…'; b.classList.add('installing');
        setTimeout(() => {
          this.setInstalled(item.id);
          b.textContent = '打开'; b.disabled = false; b.classList.remove('installing', 'primary');
          Notify.send({ appId: 'appstore', title: 'App Store', body: `“${item.name}”已安装，可在启动台与应用程序文件夹中找到。` });
        }, 1200 + Math.random() * 1200);
      });
      return b;
    };
    const cardFor = (item, big) => {
      const c = el('div', { class: 'store-card' + (big ? ' big' : '') },
        iconImg(item.icon, 'store-icon', ''),
        el('div', { class: 'store-info' },
          el('div', { class: 'store-name', text: item.name }),
          el('div', { class: 'store-desc', text: item.desc }),
          el('div', { class: 'store-cat', text: item.cat })),
        btnFor(item));
      return c;
    };
    st.go = tab => {
      st.tab = tab;
      $$('.store-tab', tabbar).forEach(n => n.classList.toggle('on', n.dataset.tab === tab));
      content.innerHTML = '';
      if (tab === 'discover') {
        content.append(el('h2', { class: 'store-h', text: '编辑推荐' }));
        const hero = el('div', { class: 'store-hero' },
          el('div', null, el('div', { class: 'store-hero-tag', text: '今日 App' }), el('div', { class: 'store-hero-name', text: '熊掌记' }), el('div', { class: 'store-hero-desc', text: '记录灵感，优雅如斯。' }),
            el('div', { class: 'store-card hero-get', style: { background: 'transparent', border: 'none', padding: '10px 0 0' } }, btnFor(STORE_CATALOG[0]))),
          iconImg('assets/icons/bear.png', ''));
        content.append(hero, el('h2', { class: 'store-h', text: '热门 App' }));
        const grid = el('div', { class: 'store-grid' });
        STORE_CATALOG.slice(1).forEach(i => grid.append(cardFor(i)));
        content.append(grid);
      } else if (tab === 'cats') {
        const cats = [...new Set(STORE_CATALOG.map(i => i.cat))];
        cats.forEach(cat => {
          content.append(el('h2', { class: 'store-h', text: cat }));
          const grid = el('div', { class: 'store-grid' });
          STORE_CATALOG.filter(i => i.cat === cat).forEach(i => grid.append(cardFor(i)));
          content.append(grid);
        });
      } else if (tab === 'arcade') {
        content.append(el('h2', { class: 'store-h', text: '搜索 App' }));
        const grid = el('div', { class: 'store-grid' });
        const hits = STORE_CATALOG.filter(i => !st.q || (i.name + i.desc + i.cat).toLowerCase().includes(st.q.toLowerCase()));
        if (!hits.length) content.append(el('div', { class: 'empty-state', style: { height: '120px' }, text: '没有找到相关 App' }));
        hits.forEach(i => grid.append(cardFor(i)));
        content.append(grid);
      } else if (tab === 'updates') {
        const inst = STORE_CATALOG.filter(i => this.isInstalled(i.id));
        if (!inst.length) content.append(el('div', { class: 'empty-state', style: { height: '200px' } }, el('div', { class: 'es-icon', text: '✅' }), el('div', { text: '全部 App 均为最新版本' })));
        else {
          content.append(el('h2', { class: 'store-h', text: '已安装' }));
          const grid = el('div', { class: 'store-grid' });
          inst.forEach(i => grid.append(cardFor(i)));
          content.append(grid, el('p', { class: 'set-note', text: '所有已安装 App 均为最新版本。' }));
        }
      }
    };
    tabs.forEach(([id, name]) => {
      const b = el('button', { class: 'store-tab', text: name, dataset: { tab: id } });
      b.addEventListener('click', () => st.go(id));
      tabbar.append(b);
    });
    search.addEventListener('input', debounce(() => { st.q = search.value.trim(); st.go('arcade'); }, 200));
    search.addEventListener('keydown', e => e.stopPropagation());
    win._unsub = Bus.on('appstore:changed', () => { if (document.body.contains(win.el)) st.go(st.tab); });
    win.onClose = () => win._unsub && win._unsub();
    st.go('discover');
  }
};
Apps.register(AppStoreApp);
window.AppStoreApp = AppStoreApp;

/* ==================== 活动监视器 ==================== */
Apps.register({
  id: 'activitymonitor', name: '活动监视器', icon: 'assets/icons/activitymonitor.svg',
  w: 720, h: 480, minW: 520, minH: 320,
  menus() { return stdMenus(this); },
  baseProcs: [
    { name: 'kernel_task', sys: true }, { name: 'WindowServer', sys: true }, { name: 'Dock', sys: true },
    { name: 'Finder', sys: true }, { name: 'SystemUIServer', sys: true }, { name: 'loginwindow', sys: true },
    { name: 'mds', sys: true }, { name: 'cfprefsd', sys: true },
  ],
  render(win) {
    const st = win.appState = { sort: 'cpu', desc: true, q: '', rows: [] };
    win.body.classList.add('am-body');
    const search = el('input', { class: 'text-input am-search', type: 'search', placeholder: '搜索进程' });
    const quitBtn = el('button', { class: 'btn', text: '✕ 结束进程', disabled: true });
    const table = el('div', { class: 'am-table' });
    win.body.append(el('div', { class: 'fb-toolbar' }, el('span', { class: 'am-title', text: '进程' }), quitBtn, search), table);
    let selName = null;
    let lastKey = '';
    const jitter = (v, amp, min, max) => clamp(v + (Math.random() - 0.5) * amp, min, max);
    const collect = () => {
      const procs = this.baseProcs.map(p => ({ name: p.name, sys: true }));
      [...new Set(WM.windows.map(w => w.appId))].forEach(id => {
        const app = Apps.get(id); if (app) procs.push({ name: app.name, sys: false, appId: id });
      });
      for (const p of procs) {
        const old = st.rows.find(r => r.name === p.name);
        p.cpu = old ? jitter(old.cpu, 2.2, 0.1, p.sys ? 12 : 28) : Math.random() * 5;
        p.mem = old ? jitter(old.mem, 8, 18, 900) : 40 + Math.random() * 300;
        p.energy = old ? jitter(old.energy, 0.8, 0.1, 20) : Math.random() * 6;
      }
      st.rows = procs;
    };
    const sortedRows = () => {
      let rows = st.rows.filter(r => !st.q || r.name.toLowerCase().includes(st.q.toLowerCase()));
      rows.sort((a, b) => {
        const k = st.sort;
        const v = k === 'name' ? a.name.localeCompare(b.name) : a[k] - b[k];
        return st.desc ? -v : v;
      });
      return rows;
    };
    const rowElFor = p => {
      const r = el('div', { class: 'am-row' + (selName === p.name ? ' sel' : ''), dataset: { proc: p.name } },
        el('span', { class: 'am-col am-name', text: p.name }),
        el('span', { class: 'am-col am-cpu', text: p.cpu.toFixed(1) }),
        el('span', { class: 'am-col am-mem', text: p.mem.toFixed(0) + ' MB' }),
        el('span', { class: 'am-col am-energy', text: p.energy.toFixed(1) }));
      r.addEventListener('click', () => {
        selName = p.name; quitBtn.disabled = false;
        $$('.am-row', table).forEach(n => n.classList.toggle('sel', n.dataset.proc === selName));
      });
      return r;
    };
    const render = () => {
      collect();
      const rows = sortedRows();
      const key = rows.map(r => r.name).join('|') + '#' + st.sort + st.desc + st.q;
      if (key !== lastKey) {
        lastKey = key;
        table.innerHTML = '';
        const head = el('div', { class: 'am-row am-head' });
        [['名称', 'name'], ['CPU %', 'cpu'], ['内存', 'mem'], ['能耗', 'energy']].forEach(([label, k2]) => {
          const h = el('span', { class: 'am-col', text: label + (st.sort === k2 ? (st.desc ? ' ↓' : ' ↑') : '') });
          h.addEventListener('click', () => { if (st.sort === k2) st.desc = !st.desc; else { st.sort = k2; st.desc = true; } render(); });
          head.append(h);
        });
        table.append(head);
        rows.forEach(p => table.append(rowElFor(p)));
      } else {
        // 仅更新数值，避免 DOM 重建打断交互
        for (const p of rows) {
          const rEl = table.querySelector(`.am-row[data-proc="${CSS.escape(p.name)}"]`);
          if (!rEl) continue;
          rEl.querySelector('.am-cpu').textContent = p.cpu.toFixed(1);
          rEl.querySelector('.am-mem').textContent = p.mem.toFixed(0) + ' MB';
          rEl.querySelector('.am-energy').textContent = p.energy.toFixed(1);
        }
      }
      if (selName && !st.rows.some(r => r.name === selName)) { selName = null; quitBtn.disabled = true; }
    };
    quitBtn.addEventListener('click', async () => {
      const sel = st.rows.find(r => r.name === selName);
      if (!sel) return;
      if (sel.sys) { UI.alert('无法结束此进程', `“${sel.name}”是系统关键进程，结束它可能导致系统不稳定。`, this.icon); return; }
      if (await UI.confirm('结束此进程？', `“${sel.name}”的所有窗口将被关闭。`, { ok: '结束', danger: true, icon: this.icon })) {
        Apps.quit(sel.appId); selName = null; quitBtn.disabled = true; render();
      }
    });
    search.addEventListener('input', debounce(() => { st.q = search.value.trim(); render(); }, 200));
    search.addEventListener('keydown', e => e.stopPropagation());
    win.timers.push(setInterval(() => { if (!document.body.contains(table)) return; render(); }, 2000));
    render();
  }
});

/* ==================== 天气 ==================== */
const WMO = {
  0: ['晴', '☀️'], 1: ['大部晴朗', '🌤'], 2: ['局部多云', '⛅'], 3: ['阴', '☁️'],
  45: ['雾', '🌫'], 48: ['雾凇', '🌫'], 51: ['小毛毛雨', '🌦'], 53: ['毛毛雨', '🌦'], 55: ['大毛毛雨', '🌦'],
  61: ['小雨', '🌧'], 63: ['中雨', '🌧'], 65: ['大雨', '🌧'], 66: ['冻雨', '🌨'], 67: ['冻雨', '🌨'],
  71: ['小雪', '🌨'], 73: ['中雪', '🌨'], 75: ['大雪', '❄️'], 77: ['雪粒', '❄️'],
  80: ['小阵雨', '🌦'], 81: ['阵雨', '🌧'], 82: ['强阵雨', '🌧'], 85: ['阵雪', '🌨'], 86: ['强阵雪', '❄️'],
  95: ['雷暴', '⛈'], 96: ['雷暴伴冰雹', '⛈'], 99: ['强雷暴', '⛈'],
};
const WEATHER_CITIES = {
  '北京': [39.9042, 116.4074], '上海': [31.2304, 121.4737], '广州': [23.1291, 113.2644],
  '深圳': [22.5431, 114.0579], '成都': [30.5728, 104.0668], '杭州': [30.2741, 120.1551],
  '西安': [34.3416, 108.9398], '哈尔滨': [45.8038, 126.5349], '拉萨': [29.6520, 91.1721],
  '香港': [22.3193, 114.1694], '三亚': [18.2528, 109.5119], '乌鲁木齐': [43.8256, 87.6168],
};
const WeatherApp = {
  id: 'weather', name: '天气', icon: 'assets/icons/weather.svg',
  w: 780, h: 560, minW: 520, minH: 400,
  menus() { return stdMenus(this); },
  store: {
    get() { return Store.get('weather', { cities: ['北京', '上海'], cur: '北京', cache: {} }); },
    set(v) { Store.set('weather', v); }
  },
  desc(code) { return (WMO[code] || ['多云', '⛅']); },
  /* 确定性模拟数据（离线回退） */
  simulate(city) {
    let seed = 0; for (const c of city) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    const base = 18 + Math.round(rnd() * 14) - 4;
    const codes = [0, 1, 2, 3, 61, 80, 95];
    const hourly = [], daily = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) hourly.push({ t: new Date(now.getTime() + i * 3600000).getHours(), temp: base + Math.round(Math.sin(i / 3) * 4), code: codes[Math.floor(rnd() * 3)] });
    const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    for (let d = 0; d < 7; d++) daily.push({ day: d === 0 ? '今天' : wd[(now.getDay() + d) % 7], hi: base + 3 + Math.round(rnd() * 4), lo: base - 5 - Math.round(rnd() * 3), code: codes[Math.floor(rnd() * codes.length)] });
    return { temp: base, code: codes[Math.floor(rnd() * 3)], hourly, daily, simulated: true, ts: Date.now() };
  },
  async fetchCity(city) {
    const ll = WEATHER_CITIES[city];
    if (!ll) return this.simulate(city);
    const cache = this.store.get().cache[city];
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 5000);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${ll[0]}&longitude=${ll[1]}&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`;
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) throw new Error('http ' + res.status);
      const j = await res.json();
      const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const data = {
        temp: Math.round(j.current.temperature_2m), code: j.current.weather_code,
        hourly: j.hourly.time.slice(0, 12).map((t, i) => ({ t: new Date(t).getHours(), temp: Math.round(j.hourly.temperature_2m[i]), code: j.hourly.weather_code[i] })),
        daily: j.daily.time.map((t, i) => ({ day: i === 0 ? '今天' : wd[new Date(t).getDay()], hi: Math.round(j.daily.temperature_2m_max[i]), lo: Math.round(j.daily.temperature_2m_min[i]), code: j.daily.weather_code[i] })),
        ts: Date.now(),
      };
      const st = this.store.get(); st.cache[city] = data; this.store.set(st);
      return data;
    } catch (e) {
      if (cache) return Object.assign({ stale: true }, cache);
      return this.simulate(city);
    }
  },
  widgetData() {
    const st = this.store.get();
    const d = st.cache[st.cur] || st.cache[st.cities[0]];
    if (!d) return null;
    const [txt] = this.desc(d.code);
    return { city: st.cur, temp: d.temp, desc: txt, hi: d.daily?.[0]?.hi ?? d.temp, lo: d.daily?.[0]?.lo ?? d.temp };
  },
  renderInline(box) {
    const st = this.store.get();
    const d = st.cache[st.cur];
    if (!d) { box.append(el('p', { text: '天气数据尚未加载，请先打开天气 App。' })); return; }
    const [txt, ico] = this.desc(d.code);
    box.append(el('h2', { text: `${st.cur} ${d.temp}° ${ico}` }),
      el('p', { text: `${txt}。今日最高 ${d.daily[0].hi}°，最低 ${d.daily[0].lo}°。` }),
      el('p', { text: '逐日预报：' + d.daily.map(x => `${x.day} ${x.lo}~${x.hi}°`).join('；') }));
  },
  render(win) {
    const st = win.appState = { data: this.store.get(), loading: false };
    win.body.classList.add('weather-body');
    const side = el('div', { class: 'weather-side' });
    const search = el('input', { class: 'text-input weather-search', type: 'search', placeholder: '搜索城市' });
    const sug = el('div', { class: 'weather-sug hidden' });
    const main = el('div', { class: 'weather-main' });
    win.body.append(el('div', { class: 'weather-left' }, search, sug, side), main);
    const save = () => this.store.set(st.data);
    const renderSide = () => {
      side.innerHTML = '';
      st.data.cities.forEach(c => {
        const d = st.data.cache[c];
        const row = el('div', { class: 'weather-city' + (c === st.data.cur ? ' sel' : '') },
          el('div', null, el('b', { text: c }), el('small', { text: d ? this.desc(d.code)[0] : '—' })),
          el('span', { class: 'weather-city-temp', text: d ? d.temp + '°' : '…' }),
          el('button', { class: 'weather-del', text: '✕', title: '删除城市', onclick: e => {
            e.stopPropagation();
            st.data.cities = st.data.cities.filter(x => x !== c);
            if (st.data.cur === c) st.data.cur = st.data.cities[0] || '北京';
            save(); renderAll();
          } }));
        row.addEventListener('click', () => { st.data.cur = c; save(); renderAll(); });
        side.append(row);
      });
    };
    const renderMain = async () => {
      const c = st.data.cur;
      main.innerHTML = '';
      main.append(el('div', { class: 'empty-state', style: { height: '160px' } }, el('div', { class: 'es-icon', text: '⏳' }), el('div', { text: `正在更新${c}的天气…` })));
      const d = await this.fetchCity(c);
      if (st.data.cur !== c || !document.body.contains(main)) return;
      st.data.cache[c] = d; save();
      main.innerHTML = '';
      const [txt, ico] = this.desc(d.code);
      main.append(el('div', { class: 'weather-now' },
        el('div', { class: 'weather-now-city', text: c + (d.simulated ? '（模拟数据）' : d.stale ? '（缓存）' : '') }),
        el('div', { class: 'weather-now-temp', text: d.temp + '°' }),
        el('div', { class: 'weather-now-desc', text: `${ico} ${txt}` }),
        el('div', { class: 'weather-now-hl', text: `最高 ${d.daily[0].hi}°  最低 ${d.daily[0].lo}°` })));
      const strip = el('div', { class: 'weather-strip' });
      d.hourly.forEach((h, i) => strip.append(el('div', { class: 'weather-hour' },
        el('span', { text: i === 0 ? '现在' : h.t + '时' }),
        el('span', { class: 'weather-hour-ico', text: this.desc(h.code)[1] }),
        el('b', { text: h.temp + '°' }))));
      main.append(el('div', { class: 'weather-card' }, el('div', { class: 'cc-title', text: '逐小时预报' }), strip));
      const list = el('div', { class: 'weather-days' });
      d.daily.forEach(x => {
        list.append(el('div', { class: 'weather-day' },
          el('span', { class: 'weather-day-name', text: x.day }),
          el('span', { text: this.desc(x.code)[1] }),
          el('span', { class: 'weather-lo', text: x.lo + '°' }),
          el('div', { class: 'weather-range' }, el('div', { class: 'weather-range-fill', style: { left: '20%', width: '60%' } })),
          el('span', { class: 'weather-hi', text: x.hi + '°' })));
      });
      main.append(el('div', { class: 'weather-card' }, el('div', { class: 'cc-title', text: '7 日预报' }), list));
    };
    const renderAll = () => { renderSide(); renderMain(); };
    search.addEventListener('input', debounce(() => {
      const q = search.value.trim();
      sug.innerHTML = '';
      if (!q) { sug.classList.add('hidden'); return; }
      const hits = Object.keys(WEATHER_CITIES).filter(c => c.includes(q) && !st.data.cities.includes(c));
      sug.classList.remove('hidden');
      if (!hits.length) sug.append(el('div', { class: 'maps-result', text: '无匹配城市' }));
      hits.slice(0, 6).forEach(c => {
        const r = el('div', { class: 'maps-result', text: c });
        r.addEventListener('click', () => {
          st.data.cities.push(c); st.data.cur = c; save();
          search.value = ''; sug.classList.add('hidden'); renderAll();
        });
        sug.append(r);
      });
    }, 200));
    search.addEventListener('keydown', e => e.stopPropagation());
    renderAll();
  }
};
Apps.register(WeatherApp);
window.WeatherApp = WeatherApp;

/* ==================== 时钟 ==================== */
const ClockApp = {
  id: 'clock', name: '时钟', icon: 'assets/icons/clock.svg',
  w: 680, h: 480, minW: 480, minH: 360,
  menus() { return stdMenus(this); },
  store: {
    get() { return Store.get('clock', { cities: ['上海', '东京', '伦敦', '纽约'], alarms: [{ id: 'a1', h: 8, m: 30, label: '起床', on: false }] }); },
    set(v) { Store.set('clock', v); }
  },
  /* 世界时钟使用 IANA 时区 + Intl.DateTimeFormat，自动正确处理夏令时 */
  cityTZ: {
    '北京': 'Asia/Shanghai', '上海': 'Asia/Shanghai', '东京': 'Asia/Tokyo', '伦敦': 'Europe/London',
    '巴黎': 'Europe/Paris', '纽约': 'America/New_York', '洛杉矶': 'America/Los_Angeles', '悉尼': 'Australia/Sydney',
    '迪拜': 'Asia/Dubai', '新加坡': 'Asia/Singapore',
  },
  tzOffsetLabel(tz) {
    try {
      const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
        .formatToParts(new Date()).find(p => p.type === 'timeZoneName');
      return part ? part.value.replace('GMT', 'UTC').replace(/^UTC$/, 'UTC+0') : '';
    } catch (e) { return ''; }
  },
  beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.setValueAtTime(Sys.settings.muted ? 0 : Sys.settings.volume * 0.3, ctx.currentTime);
      o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
      o.stop(ctx.currentTime + 1.3);
    } catch (e) {}
  },
  tick() {
    const st = this.store.get();
    const now = new Date();
    const hm = now.getHours() * 60 + now.getMinutes();
    for (const a of st.alarms) {
      if (!a.on) continue;
      const key = '_fired_' + a.id + '_' + now.toDateString();
      if (a.h * 60 + a.m === hm && !this[key]) {
        this[key] = true;
        Notify.send({ appId: 'clock', title: '闹钟', body: `${a.label || '闹钟'} ${String(a.h).padStart(2, '0')}:${String(a.m).padStart(2, '0')}` });
        this.beep();
      }
    }
  },
  render(win) {
    const st = win.appState = { tab: 'world', data: this.store.get(), sw: { running: false, t0: 0, acc: 0, laps: [] }, timer: { left: 0, running: false, total: 0 } };
    win.body.classList.add('clock-body');
    const tabbar = el('div', { class: 'store-tabs clock-tabs' });
    const content = el('div', { class: 'clock-content' });
    win.body.append(tabbar, content);
    const save = () => this.store.set(st.data);
    const tabs = [['world', '世界时钟'], ['alarm', '闹钟'], ['sw', '秒表'], ['timer', '计时器']];
    tabs.forEach(([id, name]) => {
      const b = el('button', { class: 'store-tab', text: name, dataset: { tab: id } });
      b.addEventListener('click', () => go(id));
      tabbar.append(b);
    });
    const go = id => {
      st.tab = id;
      $$('.store-tab', tabbar).forEach(n => n.classList.toggle('on', n.dataset.tab === id));
      content.innerHTML = '';
      this['render_' + id](content, st, save);
    };
    win.timers.push(setInterval(() => {
      if (!document.body.contains(content)) return;
      if (st.tab === 'world') this.render_world(content, st, save, true);
      // 秒表/计时器的到点检测不依赖当前标签；UI 同步仅在对应标签可见时发生
      if (st.sw.running && this._swTick) this._swTick();
      if (st.timer.running && this._timerTick) this._timerTick();
    }, 500));
    /* 关闭窗口即停止计时，先明确提示（产品定义：计时随窗口生命周期结束） */
    win.confirmClose = (done, cancel) => {
      if (!st.sw.running && !st.timer.running) return done();
      const what = st.timer.running ? '计时器正在运行，关闭窗口将停止计时。' : '秒表正在运行，关闭窗口将停止计时。';
      UI.dialog({ icon: this.icon, title: '关闭时钟？', msg: what, buttons: ['取消', '关闭'] })
        .then(r => { r.index === 1 ? done() : cancel(); });
    };
    go('world');
  },
  render_world(box, st, save, soft) {
    const now = new Date();
    if (!soft) {
      box.innerHTML = '';
      const sel = el('select', { class: 'text-input' }, el('option', { text: '添加城市…', value: '' }),
        ...Object.keys(this.cityTZ).filter(c => !st.data.cities.includes(c)).map(c => el('option', { text: c, value: c })));
      sel.addEventListener('change', () => { if (sel.value) { st.data.cities.push(sel.value); save(); this.render_world(box, st, save); } });
      const list = el('div', { class: 'clock-cities' });
      box.append(el('div', { class: 'clock-addrow' }, sel), list);
    }
    const list = box.querySelector('.clock-cities');
    list.innerHTML = '';
    st.data.cities.forEach(c => {
      const tz = this.cityTZ[c];
      if (!tz) return;
      const row = el('div', { class: 'clock-city' },
        el('div', null, el('b', { text: c }), el('small', { text: this.tzOffsetLabel(tz) })),
        el('span', { class: 'clock-city-time', text: fmtTimeHM(now, Sys.settings.h24, tz) }),
        el('button', { class: 'weather-del', text: '✕', title: '删除', onclick: () => { st.data.cities = st.data.cities.filter(x => x !== c); save(); this.render_world(box, st, save); } }));
      list.append(row);
    });
  },
  render_alarm(box, st, save) {
    box.innerHTML = '';
    const list = el('div', { class: 'alarm-list' });
    const renderList = () => {
      list.innerHTML = '';
      if (!st.data.alarms.length) list.append(el('div', { class: 'empty-state', style: { height: '120px' }, text: '没有闹钟' }));
      st.data.alarms.forEach(a => {
        const sw = el('div', { class: 'switch' + (a.on ? ' on' : ''), role: 'switch', 'aria-checked': String(!!a.on), tabindex: '0', 'aria-label': `闹钟 ${a.h}` });
        const flipSw = () => { a.on = !a.on; sw.classList.toggle('on', a.on); sw.setAttribute('aria-checked', String(!!a.on)); save(); };
        sw.addEventListener('click', flipSw);
        sw.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipSw(); } });
        const row = el('div', { class: 'alarm-row' },
          el('div', { class: 'alarm-time', text: `${String(a.h).padStart(2, '0')}:${String(a.m).padStart(2, '0')}` }),
          el('div', { class: 'alarm-label', text: a.label || '闹钟' }),
          sw,
          el('button', { class: 'weather-del', text: '✕', title: '删除闹钟', onclick: () => { st.data.alarms = st.data.alarms.filter(x => x !== a); save(); renderList(); } }));
        list.append(row);
      });
    };
    const hIn = el('input', { class: 'text-input', type: 'number', min: '0', max: '23', value: '8', style: { width: '64px' } });
    const mIn = el('input', { class: 'text-input', type: 'number', min: '0', max: '59', value: '0', style: { width: '64px' } });
    const lIn = el('input', { class: 'text-input', type: 'text', placeholder: '标签', value: '闹钟' });
    const add = el('button', { class: 'btn primary', text: '添加闹钟' });
    add.addEventListener('click', () => {
      const h = clamp(+hIn.value || 0, 0, 23), m = clamp(+mIn.value || 0, 0, 59);
      st.data.alarms.push({ id: uid(), h, m, label: lIn.value.trim() || '闹钟', on: true });
      save(); renderList();
    });
    box.append(el('div', { class: 'clock-addrow' }, hIn, el('span', { text: ':' }), mIn, lIn, add), list);
    renderList();
  },
  render_sw(box, st) {
    box.innerHTML = '';
    const disp = el('div', { class: 'sw-disp' });
    const startBtn = el('button', { class: 'btn primary sw-btn' });
    const lapBtn = el('button', { class: 'btn sw-btn', text: '计次' });
    const resetBtn = el('button', { class: 'btn sw-btn', text: '复位' });
    const laps = el('div', { class: 'sw-laps' });
    box.append(disp, el('div', { class: 'sw-btns' }, lapBtn, startBtn, resetBtn), laps);
    const fmtT = ms => {
      const t = Math.floor(ms / 100);
      return `${String(Math.floor(t / 600)).padStart(2, '0')}:${String(Math.floor(t / 10) % 60).padStart(2, '0')}.${t % 10}`;
    };
    const cur = () => st.sw.acc + (st.sw.running ? Date.now() - st.sw.t0 : 0);
    const renderLaps = () => {
      laps.innerHTML = '';
      st.sw.laps.forEach((lp, i) => laps.prepend(el('div', { class: 'sw-lap' }, el('span', { text: `计次 ${i + 1}` }), el('span', { text: fmtT(lp) }))));
    };
    const syncUI = () => {
      disp.textContent = fmtT(cur());
      startBtn.textContent = st.sw.running ? '暂停' : (st.sw.acc > 0 ? '继续' : '开始');
      lapBtn.disabled = !st.sw.running;
      resetBtn.disabled = st.sw.running || st.sw.acc === 0;
    };
    this._swTick = () => { if (disp.isConnected) disp.textContent = fmtT(cur()); };
    startBtn.addEventListener('click', () => {
      st.sw.running = !st.sw.running;
      if (st.sw.running) st.sw.t0 = Date.now();
      else st.sw.acc += Date.now() - st.sw.t0;
      syncUI();
    });
    lapBtn.addEventListener('click', () => { st.sw.laps.push(cur()); renderLaps(); });
    resetBtn.addEventListener('click', () => { st.sw = { running: false, t0: 0, acc: 0, laps: [] }; renderLaps(); syncUI(); });
    renderLaps(); syncUI(); // 跨标签切换后恢复：当前值、按钮文字、计次列表
  },
  render_timer(box, st) {
    box.innerHTML = '';
    const mIn = el('input', { class: 'text-input', type: 'number', min: '0', max: '180', value: '5', style: { width: '72px' } });
    const sIn = el('input', { class: 'text-input', type: 'number', min: '0', max: '59', value: '0', style: { width: '72px' } });
    const disp = el('div', { class: 'sw-disp', text: '05:00' });
    const startBtn = el('button', { class: 'btn primary sw-btn' });
    const resetBtn = el('button', { class: 'btn sw-btn', text: '复位' });
    const ring = el('div', { class: 'timer-ring' }, disp);
    box.append(el('div', { class: 'clock-addrow' }, mIn, el('span', { text: '分' }), sIn, el('span', { text: '秒' })),
      ring, el('div', { class: 'sw-btns' }, resetBtn, startBtn));
    const fmtT = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
    /* endAt 是唯一时间基准；left 仅是暂停时的快照 */
    const left = () => st.timer.running ? Math.max(0, st.timer.endAt - Date.now()) : st.timer.left;
    const sync = () => {
      const l = left();
      disp.textContent = fmtT(l);
      ring.style.setProperty('--p', st.timer.total ? String(1 - l / st.timer.total) : '0');
      startBtn.textContent = st.timer.running ? '暂停' : (st.timer.left > 0 ? '继续' : '开始');
      mIn.disabled = sIn.disabled = st.timer.running;
    };
    this._timerTick = () => {
      if (!st.timer.running) return;
      if (st.timer.endAt - Date.now() <= 0) {
        st.timer.running = false; st.timer.left = 0;
        if (!st.timer.notified) { // 一次计时结束只通知一次
          st.timer.notified = true;
          Notify.send({ appId: 'clock', title: '计时器', body: '时间到！', breakthrough: true });
          this.beep();
        }
      } else st.timer.left = st.timer.endAt - Date.now();
      if (disp.isConnected) sync();
    };
    startBtn.addEventListener('click', () => {
      if (st.timer.running) { st.timer.left = Math.max(0, st.timer.endAt - Date.now()); st.timer.running = false; sync(); return; }
      if (st.timer.left <= 0) {
        st.timer.total = ((+mIn.value || 0) * 60 + (+sIn.value || 0)) * 1000;
        if (st.timer.total <= 0) return;
        st.timer.left = st.timer.total;
      }
      st.timer.endAt = Date.now() + st.timer.left;
      st.timer.notified = false;
      st.timer.running = true;
      sync();
    });
    resetBtn.addEventListener('click', () => {
      st.timer = { left: 0, running: false, total: 0, notified: false };
      sync();
      disp.textContent = fmtT(((+mIn.value || 0) * 60 + (+sIn.value || 0)) * 1000);
    });
    mIn.addEventListener('input', () => { if (!st.timer.running && st.timer.left <= 0) disp.textContent = fmtT(((+mIn.value || 0) * 60 + (+sIn.value || 0)) * 1000); });
    sIn.addEventListener('input', () => mIn.dispatchEvent(new Event('input')));
    sync(); // 跨标签切换后恢复：剩余时间、按钮文字、进度环
  }
};
Apps.register(ClockApp);
window.ClockApp = ClockApp;

/* ============ 扩展应用 B：提醒事项 / 通讯录 / 便笺 / 邮件 / 信息 / FaceTime / 商店应用 ============ */

/* ==================== 提醒事项 ==================== */
Apps.register({
  id: 'reminders', name: '提醒事项', icon: 'assets/icons/reminders.png',
  w: 720, h: 500, minW: 520, minH: 340,
  menus(win) {
    const st = win?.appState;
    return stdMenus(this, { file: [{ label: '新建提醒事项', key: '⌘N', action: () => st?.focusNew() }] });
  },
  colors: ['#0a84ff', '#ff9f0a', '#ff453a', '#32d74b', '#bf5af2'],
  store: {
    get() {
      return Store.get('reminders', {
        lists: [{ id: 'l1', name: '提醒', color: '#0a84ff' }, { id: 'l2', name: '工作', color: '#ff9f0a' }, { id: 'l3', name: '家庭', color: '#32d74b' }],
        items: [
          { id: uid(), list: 'l1', title: '体验 macOS 网页版', due: '', done: false },
          { id: uid(), list: 'l2', title: '周五前提交周报', due: localDateKey(new Date(Date.now() + 86400000 * 2)), done: false },
          { id: uid(), list: 'l3', title: '买牛奶和鸡蛋', due: '', done: true },
        ]
      });
    },
    set(v) { Store.set('reminders', v); }
  },
  render(win) {
    const st = win.appState = { data: this.store.get(), cur: 'l1' };
    win.body.classList.add('rem-body');
    const side = el('div', { class: 'rem-side' });
    const listEl = el('div', { class: 'rem-items' });
    const newIn = el('input', { class: 'text-input rem-new', type: 'text', placeholder: '添加提醒事项，回车确认' });
    const main = el('div', { class: 'rem-main' }, listEl, el('div', { class: 'rem-new-row' }, newIn));
    win.body.append(side, main);
    const save = () => this.store.set(st.data);
    st.focusNew = () => newIn.focus();
    const renderSide = () => {
      side.innerHTML = '';
      side.append(el('div', { class: 'fb-side-title', text: '我的列表' }));
      st.data.lists.forEach(l => {
        const row = el('div', { class: 'fb-side-item' + (st.cur === l.id ? ' sel' : '') },
          el('span', { class: 'rem-color', style: { background: l.color } }),
          el('span', { class: 'rem-lname', text: l.name }),
          el('span', { class: 'rem-count', text: String(st.data.items.filter(i => i.list === l.id && !i.done).length) }));
        row.addEventListener('click', () => { st.cur = l.id; renderAll(); });
        side.append(row);
      });
      const addList = el('button', { class: 'btn rem-addlist', text: '＋ 添加列表' });
      addList.addEventListener('click', async () => {
        const name = await UI.prompt('新建列表', '列表名称：', '新列表');
        if (!name) return;
        const color = this.colors[st.data.lists.length % this.colors.length];
        st.data.lists.push({ id: uid(), name, color }); save(); renderSide();
      });
      side.append(addList);
    };
    const renderItems = () => {
      listEl.innerHTML = '';
      const items = st.data.items.filter(i => i.list === st.cur);
      const open = items.filter(i => !i.done), done = items.filter(i => i.done);
      const mkRow = it => {
        const cb = el('button', { class: 'rem-check' + (it.done ? ' done' : ''), 'aria-label': it.done ? '标记为未完成' : '标记为完成' });
        cb.addEventListener('click', () => { it.done = !it.done; save(); renderAll(); });
        const titleIn = el('input', { class: 'rem-title' + (it.done ? ' done' : ''), value: it.title });
        titleIn.addEventListener('change', () => { it.title = titleIn.value.trim() || it.title; save(); renderAll(); });
        const dueIn = el('input', { class: 'rem-due', type: 'date', value: it.due || '' });
        dueIn.addEventListener('change', () => { it.due = dueIn.value; save(); });
        const del = el('button', { class: 'weather-del', text: '✕', title: '删除', onclick: () => { st.data.items = st.data.items.filter(x => x !== it); save(); renderAll(); } });
        return el('div', { class: 'rem-row' }, cb, titleIn, dueIn, del);
      };
      open.forEach(it => listEl.append(mkRow(it)));
      if (done.length) {
        listEl.append(el('div', { class: 'fb-side-title', text: `已完成（${done.length}）` }));
        done.forEach(it => listEl.append(mkRow(it)));
      }
      if (!items.length) listEl.append(el('div', { class: 'empty-state', style: { height: '140px' }, text: '此列表为空' }));
    };
    newIn.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && newIn.value.trim()) {
        st.data.items.push({ id: uid(), list: st.cur, title: newIn.value.trim(), due: '', done: false });
        newIn.value = ''; save(); renderAll();
      }
    });
    const renderAll = () => { renderSide(); renderItems(); };
    renderAll();
  }
});

/* ==================== 通讯录 ==================== */
const ContactsApp = {
  id: 'contacts', name: '通讯录', icon: 'assets/icons/contacts.png',
  w: 760, h: 520, minW: 560, minH: 360,
  menus(win) {
    const st = win?.appState;
    return stdMenus(this, { file: [{ label: '新建联系人', key: '⌘N', action: () => st?.edit(null) }] });
  },
  store: {
    get() {
      return Store.get('contacts', [
        { id: uid(), name: '王小明', phone: '138 0000 1234', email: 'xiaoming@example.com', note: '大学同学' },
        { id: uid(), name: '李思颖', phone: '139 1111 5678', email: 'siying.li@example.com', note: '产品经理' },
        { id: uid(), name: '张伟', phone: '137 2222 9012', email: 'zhangwei@example.com', note: '' },
        { id: uid(), name: '陈静', phone: '136 3333 3456', email: 'chenjing@example.com', note: '设计团队' },
        { id: uid(), name: '刘洋', phone: '135 4444 7890', email: 'liuyang@example.com', note: '周末球友' },
      ]);
    },
    set(v) { Store.set('contacts', v); }
  },
  render(win) {
    const st = win.appState = { data: this.store.get(), cur: null, q: '' };
    win.body.classList.add('contacts-body');
    const search = el('input', { class: 'text-input notes-search', type: 'search', placeholder: '搜索' });
    const addBtn = el('button', { class: 'fb-btn', html: '＋', title: '新建联系人' });
    const listEl = el('div', { class: 'notes-list' });
    const detail = el('div', { class: 'contact-detail' });
    win.body.append(el('div', { class: 'notes-side' }, el('div', { class: 'notes-side-bar' }, search, addBtn), listEl), detail);
    const save = () => this.store.set(st.data);
    const initials = n => n.slice(0, 1);
    const renderList = () => {
      listEl.innerHTML = '';
      const items = st.data.filter(c => !st.q || (c.name + c.phone + c.email).toLowerCase().includes(st.q.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
      if (!items.length) listEl.append(el('div', { class: 'empty-state', style: { height: '120px' }, text: '没有联系人' }));
      items.forEach(c => {
        const row = el('div', { class: 'note-row contact-row' + (c === st.cur ? ' sel' : '') },
          el('span', { class: 'contact-avatar', text: initials(c.name) }),
          el('div', null, el('div', { class: 'note-title', text: c.name }), el('div', { class: 'note-sub', text: c.phone })));
        row.addEventListener('click', () => { st.cur = c; renderDetail(); });
        listEl.append(row);
      });
    };
    const renderDetail = () => {
      renderList();
      detail.innerHTML = '';
      if (!st.cur) { detail.append(el('div', { class: 'empty-state' }, el('div', { class: 'es-icon', text: '👤' }), el('div', { text: '选择联系人' }))); return; }
      const c = st.cur;
      const mail = el('button', { class: 'btn', text: '✉️ 发邮件' });
      mail.addEventListener('click', () => Apps.open('mail', { compose: { to: c.email, name: c.name } }));
      const ft = el('button', { class: 'btn', text: '📹 FaceTime' });
      ft.addEventListener('click', () => Apps.open('facetime', { call: c }));
      const edit = el('button', { class: 'btn', text: '编辑' });
      edit.addEventListener('click', () => st.edit(c));
      const del = el('button', { class: 'btn danger', text: '删除' });
      del.addEventListener('click', async () => {
        if (!await UI.confirm('删除联系人？', `将删除“${c.name}”。`, { ok: '删除', danger: true })) return;
        st.data = st.data.filter(x => x !== c); st.cur = null; save(); renderDetail();
      });
      detail.append(
        el('div', { class: 'contact-card' },
          el('div', { class: 'contact-big-avatar', text: initials(c.name) }),
          el('div', { class: 'contact-name', text: c.name }),
          c.note ? el('div', { class: 'contact-note', text: c.note }) : null,
          el('div', { class: 'contact-fields' },
            el('div', { class: 'contact-field' }, el('span', { class: 'cf-label', text: '电话' }), el('span', { text: c.phone })),
            el('div', { class: 'contact-field' }, el('span', { class: 'cf-label', text: '邮箱' }), el('span', { text: c.email }))),
          el('div', { class: 'contact-actions' }, mail, ft, edit, del)));
    };
    st.edit = c => {
      const isNew = !c;
      const data = c ? { ...c } : { id: uid(), name: '', phone: '', email: '', note: '' };
      const mask = el('div', { class: 'modal-mask' });
      const nameIn = el('input', { class: 'text-input dlg-input', placeholder: '姓名', value: data.name });
      const phoneIn = el('input', { class: 'text-input dlg-input', placeholder: '电话', value: data.phone });
      const emailIn = el('input', { class: 'text-input dlg-input', placeholder: '邮箱', value: data.email });
      const noteIn = el('input', { class: 'text-input dlg-input', placeholder: '备注', value: data.note });
      const dlg = el('div', { class: 'dialog', style: { width: '300px' } },
        el('div', { class: 'dlg-title', text: isNew ? '新建联系人' : '编辑联系人' }),
        nameIn, phoneIn, emailIn, noteIn,
        el('div', { class: 'dlg-btns row' },
          el('button', { class: 'btn', text: '取消', onclick: () => mask.remove() }),
          el('button', {
            class: 'btn primary', text: '存储', onclick: () => {
              if (!nameIn.value.trim()) { nameIn.focus(); return; }
              Object.assign(data, { name: nameIn.value.trim(), phone: phoneIn.value.trim(), email: emailIn.value.trim(), note: noteIn.value.trim() });
              if (isNew) st.data.push(data);
              else Object.assign(c, data);
              st.cur = data; save(); mask.remove(); renderDetail();
            }
          })));
      mask.append(dlg); document.body.append(mask);
      nameIn.focus();
    };
    search.addEventListener('input', debounce(() => { st.q = search.value.trim(); renderList(); }, 200));
    addBtn.addEventListener('click', () => st.edit(null));
    renderDetail();
  }
};
Apps.register(ContactsApp);
window.ContactsApp = ContactsApp;

/* ==================== 便笺 ==================== */
Apps.register({
  id: 'stickies', name: '便笺', icon: 'assets/icons/stickies.svg',
  w: 260, h: 240, minW: 200, minH: 160, singleton: false,
  colors: { yellow: '#fff7ae', blue: '#cfe8ff', green: '#d9f7c4', pink: '#ffd6e8', purple: '#e8d9ff' },
  store: {
    get() { return Store.get('stickies', [{ id: 's1', text: '双击便笺即可编辑。\n通过菜单可以更换颜色。', color: 'yellow', x: null, y: null }]); },
    set(v) { Store.set('stickies', v); }
  },
  menus(win) {
    const st = win?.appState;
    return stdMenus(this, {
      file: [
        { label: '新建便笺', key: '⌘N', action: () => this.spawn() },
        { label: '删除此便笺', key: '⌘⌫', action: () => st?.removeSelf() },
      ],
      format: Object.entries(this.colors).map(([k, v]) => ({
        label: { yellow: '黄色', blue: '蓝色', green: '绿色', pink: '粉色', purple: '紫色' }[k],
        checked: st?.note.color === k,
        action: () => st?.setColor(k),
      }))
    });
  },
  spawn(note) {
    const data = this.store.get();
    if (!note) { note = { id: uid(), text: '', color: 'yellow', x: null, y: null }; data.push(note); this.store.set(data); }
    const win = Apps.open('stickies', { noteId: note.id });
    return win;
  },
  openAll() {
    const data = this.store.get();
    if (!data.length) return this.spawn();
    data.forEach((n, i) => setTimeout(() => this.spawn(n), i * 120));
  },
  render(win, args) {
    const data = this.store.get();
    const note = data.find(n => n.id === args.noteId) || data[0];
    const st = win.appState = { note };
    win.el.classList.add('sticky-win');
    win.body.classList.add('no-chrome');
    win.el.style.background = this.colors[note.color] || '#fff7ae';
    const area = el('div', { class: 'sticky-body', contenteditable: 'true', 'aria-label': '便笺内容' });
    area.textContent = note.text;
    win.body.append(area);
    area.addEventListener('input', debounce(() => {
      const all = this.store.get();
      const n = all.find(x => x.id === note.id);
      if (n) { n.text = area.textContent; this.store.set(all); }
    }, 400));
    st.setColor = k => {
      note.color = k;
      const all = this.store.get();
      const n = all.find(x => x.id === note.id);
      if (n) { n.color = k; this.store.set(all); }
      win.el.style.background = this.colors[k];
    };
    st.removeSelf = () => {
      const all = this.store.get().filter(x => x.id !== note.id);
      this.store.set(all);
      win.confirmClose = null;
      WM.close(win);
    };
    win.el.addEventListener('contextmenu', e => {
      e.preventDefault();
      UI.contextMenu([
        { label: '新建便笺', action: () => this.spawn() },
        { label: '删除便笺', action: () => st.removeSelf() },
        { sep: true },
        ...Object.entries(this.colors).map(([k]) => ({ label: { yellow: '黄色', blue: '蓝色', green: '绿色', pink: '粉色', purple: '紫色' }[k], checked: note.color === k, action: () => st.setColor(k) })),
      ], e);
    });
    WM.setTitle(win, '便笺');
    setTimeout(() => area.focus(), 60);
  }
});

/* ==================== 邮件 ==================== */
Apps.register({
  id: 'mail', name: '邮件', icon: 'assets/icons/mail.png',
  w: 900, h: 580, minW: 640, minH: 420,
  menus(win) {
    const st = win?.appState;
    return stdMenus(this, {
      file: [{ label: '新邮件', key: '⌘N', action: () => st?.compose({}) }],
    });
  },
  store: {
    get() {
      return Store.get('mail', {
        inbox: [
          { id: uid(), from: 'Apple', addr: 'no-reply@apple.com', subject: '欢迎使用 macOS 网页版', body: '谢谢你选择 macOS 网页版！\n\n这是一封预置邮件，你可以将它标为已读、加星标或删除。\n\n—— Apple 团队', ts: Date.now() - 3600000 * 5, read: false, star: true },
          { id: uid(), from: '王小明', addr: 'xiaoming@example.com', subject: '周末聚餐', body: '周六晚上老地方，七点不见不散！\n记得带上 Switch。', ts: Date.now() - 3600000 * 26, read: false, star: false },
          { id: uid(), from: 'GitHub', addr: 'notifications@github.com', subject: '[macos-web] 新的 Star', body: '你的仓库 macos-web 获得了新的 Star！\n\n当前 Star 数：1024', ts: Date.now() - 86400000 * 2, read: true, star: false },
          { id: uid(), from: '李思颖', addr: 'siying.li@example.com', subject: '设计评审纪要', body: '今天评审的结论：\n1. Dock 放大效果再调一版\n2. 深色模式对比度提升\n3. 下周二前出高保真\n\n辛苦大家！', ts: Date.now() - 86400000 * 3, read: true, star: false },
        ],
        sent: [], trash: []
      });
    },
    set(v) { Store.set('mail', v); }
  },
  onArgs(args, win) { if (args.compose) win.appState?.compose(args.compose); },
  render(win) {
    const st = win.appState = { data: this.store.get(), box: 'inbox', cur: null, q: '' };
    win.body.classList.add('mail-body');
    const boxes = [['inbox', '收件箱', '📥'], ['sent', '已发送', '📤'], ['trash', '废纸篓', '🗑']];
    const sideEl = el('div', { class: 'mail-side' });
    const listEl = el('div', { class: 'mail-list' });
    const detailEl = el('div', { class: 'mail-detail' });
    const newBtn = el('button', { class: 'fb-btn', html: '✏️', title: '新邮件' });
    const search = el('input', { class: 'text-input notes-search', type: 'search', placeholder: '搜索邮件' });
    win.body.append(
      el('div', { class: 'notes-side mail-col1' }, el('div', { class: 'notes-side-bar' }, search, newBtn), sideEl),
      listEl, detailEl);
    const save = () => this.store.set(st.data);
    const renderSide = () => {
      sideEl.innerHTML = '';
      boxes.forEach(([id, name, ico]) => {
        const unread = st.data[id].filter(m => !m.read).length;
        const row = el('div', { class: 'fb-side-item' + (st.box === id ? ' sel' : '') },
          el('span', { class: 'fb-side-ico', text: ico }), el('span', { class: 'rem-lname', text: name }),
          unread ? el('span', { class: 'badge', text: String(unread) }) : null);
        row.addEventListener('click', () => { st.box = id; st.cur = null; renderAll(); });
        sideEl.append(row);
      });
    };
    const renderList = () => {
      listEl.innerHTML = '';
      const items = st.data[st.box]
        .filter(m => !st.q || (m.subject + m.from + m.body).toLowerCase().includes(st.q.toLowerCase()))
        .sort((a, b) => b.ts - a.ts);
      if (!items.length) listEl.append(el('div', { class: 'empty-state', style: { height: '160px' }, text: '没有邮件' }));
      items.forEach(m => {
        const row = el('div', { class: 'mail-row' + (m === st.cur ? ' sel' : '') + (m.read ? '' : ' unread') },
          el('div', { class: 'mail-row-top' }, el('b', { text: m.from }), el('span', { class: 'mail-time', text: relTime(m.ts) })),
          el('div', { class: 'mail-subject' }, m.star ? el('span', { class: 'mail-star', text: '★' }) : null, el('span', { text: m.subject })),
          el('div', { class: 'mail-preview', text: m.body.slice(0, 48) }));
        row.addEventListener('click', () => {
          st.cur = m;
          if (!m.read) { m.read = true; save(); }
          renderAll();
        });
        listEl.append(row);
      });
    };
    const renderDetail = () => {
      detailEl.innerHTML = '';
      const m = st.cur;
      if (!m) { detailEl.append(el('div', { class: 'empty-state' }, el('div', { class: 'es-icon', text: '✉️' }), el('div', { text: '选择一封邮件' }))); return; }
      const star = el('button', { class: 'fb-btn', text: m.star ? '★' : '☆', title: '星标' });
      star.addEventListener('click', () => { m.star = !m.star; save(); renderAll(); });
      const del = el('button', { class: 'fb-btn', html: '🗑', title: '删除' });
      del.addEventListener('click', () => {
        st.data[st.box] = st.data[st.box].filter(x => x !== m);
        if (st.box !== 'trash') st.data.trash.push(m);
        st.cur = null; save(); renderAll();
      });
      const reply = el('button', { class: 'btn', text: '回复' });
      reply.addEventListener('click', () => st.compose({ to: m.addr, name: m.from, subject: '回复：' + m.subject, quote: m.body }));
      detailEl.append(
        el('div', { class: 'mail-detail-head' },
          el('div', { class: 'mail-detail-subject', text: m.subject }),
          el('div', { class: 'mail-detail-meta' }, el('span', { text: `${m.from} <${m.addr}>` }), el('span', { text: new Date(m.ts).toLocaleString('zh-CN') })),
          el('div', { class: 'mail-detail-actions' }, star, del, reply)),
        el('div', { class: 'mail-detail-body', text: m.body }));
    };
    st.compose = ({ to = '', name = '', subject = '', quote = '' } = {}) => {
      const mask = el('div', { class: 'modal-mask' });
      const toIn = el('input', { class: 'text-input dlg-input', placeholder: '收件人', value: to });
      const subIn = el('input', { class: 'text-input dlg-input', placeholder: '主题', value: subject });
      const bodyIn = el('textarea', { class: 'text-input mail-compose-body', placeholder: '正文…' });
      bodyIn.value = quote ? `\n\n—— 原始邮件 ——\n${quote}` : '';
      const send = () => {
        if (!toIn.value.trim()) { toIn.focus(); return; }
        st.data.sent.push({ id: uid(), from: '我', addr: toIn.value.trim(), subject: subIn.value.trim() || '（无主题）', body: bodyIn.value, ts: Date.now(), read: true, star: false });
        save(); mask.remove();
        Notify.send({ appId: 'mail', title: '邮件已发送', body: `发送至 ${toIn.value.trim()}`, silent: true });
        // 模拟回信
        setTimeout(() => {
          st.data.inbox.push({ id: uid(), from: name || toIn.value.trim().split('@')[0], addr: toIn.value.trim(), subject: '回复：' + (subIn.value.trim() || '（无主题）'), body: '收到你的邮件了，谢谢！\n\n（这是一条自动回复，用于演示离线邮件流程。）', ts: Date.now(), read: false, star: false });
          save();
          Notify.send({ appId: 'mail', title: name || '新邮件', body: '回复：' + (subIn.value.trim() || '（无主题）') });
          if (document.body.contains(win.el)) renderAll();
        }, 4000 + Math.random() * 3000);
      };
      const dlg = el('div', { class: 'dialog mail-compose' },
        el('div', { class: 'dlg-title', text: '新邮件' }), toIn, subIn, bodyIn,
        el('div', { class: 'dlg-btns row' },
          el('button', { class: 'btn', text: '取消', onclick: () => mask.remove() }),
          el('button', { class: 'btn primary', text: '发送', onclick: send })));
      mask.append(dlg); document.body.append(mask);
      toIn.focus();
    };
    newBtn.addEventListener('click', () => st.compose({}));
    search.addEventListener('input', debounce(() => { st.q = search.value.trim(); renderList(); }, 200));
    const renderAll = () => { renderSide(); renderList(); renderDetail(); };
    renderAll();
  }
});

/* ==================== 信息 ==================== */
Apps.register({
  id: 'messages', name: '信息', icon: 'assets/icons/messages.png',
  w: 760, h: 540, minW: 560, minH: 380,
  menus(win) {
    const st = win?.appState;
    return stdMenus(this, { file: [{ label: '新信息', key: '⌘N', action: () => st?.newChat() }] });
  },
  store: {
    get() {
      return Store.get('messages', {
        convs: [
          { id: 'c1', name: '王小明', msgs: [
            { from: 'them', text: '在吗？周末的球局你还来吗', ts: Date.now() - 7200000 },
            { from: 'me', text: '来！老时间老地方？', ts: Date.now() - 7000000 },
            { from: 'them', text: '对，下午三点，别迟到', ts: Date.now() - 6900000 },
          ], unread: 0 },
          { id: 'c2', name: '李思颖', msgs: [
            { from: 'them', text: '设计稿我看完了，整体很棒', ts: Date.now() - 4000000 },
            { from: 'them', text: 'Dock 的放大曲线再顺滑一点就更好了', ts: Date.now() - 3900000 },
          ], unread: 2 },
          { id: 'c3', name: '妈妈', msgs: [
            { from: 'them', text: '吃饭了吗？最近降温，多穿点', ts: Date.now() - 90000000 },
          ], unread: 1 },
        ]
      });
    },
    set(v) { Store.set('messages', v); }
  },
  replies: ['哈哈好的', '收到！', '稍等，我马上看', '真的吗？太好了', '没问题 👌', '那就这么定了', '哈哈哈哈', '嗯嗯，知道了'],
  render(win) {
    const st = win.appState = { data: this.store.get(), cur: null };
    win.body.classList.add('msg-body');
    const listEl = el('div', { class: 'notes-list' });
    const chatEl = el('div', { class: 'msg-chat' });
    win.body.append(el('div', { class: 'notes-side msg-side' }, el('div', { class: 'notes-side-bar' }, el('span', { class: 'fb-side-title', text: '对话' })), listEl), chatEl);
    const save = () => this.store.set(st.data);
    st.newChat = async () => {
      const name = await UI.prompt('新对话', '输入联系人姓名：', '');
      if (!name) return;
      const conv = { id: uid(), name, msgs: [], unread: 0 };
      st.data.convs.push(conv); st.cur = conv; save(); renderAll();
    };
    const renderList = () => {
      listEl.innerHTML = '';
      st.data.convs.sort((a, b) => (b.msgs[b.msgs.length - 1]?.ts || 0) - (a.msgs[a.msgs.length - 1]?.ts || 0)).forEach(c => {
        const last = c.msgs[c.msgs.length - 1];
        const row = el('div', { class: 'note-row contact-row' + (c === st.cur ? ' sel' : '') },
          el('span', { class: 'contact-avatar', text: c.name.slice(0, 1) }),
          el('div', { style: { flex: '1', minWidth: '0' } },
            el('div', { class: 'note-title', text: c.name }),
            el('div', { class: 'note-sub', text: last ? last.text : '开始聊天吧' })),
          c.unread ? el('span', { class: 'badge', text: String(c.unread) }) : null);
        row.addEventListener('click', () => { st.cur = c; c.unread = 0; save(); renderAll(); });
        listEl.append(row);
      });
    };
    const renderChat = () => {
      chatEl.innerHTML = '';
      const c = st.cur;
      if (!c) { chatEl.append(el('div', { class: 'empty-state' }, el('div', { class: 'es-icon', text: '💬' }), el('div', { text: '选择对话' }))); return; }
      const scroll = el('div', { class: 'msg-scroll' });
      let lastTs = 0;
      c.msgs.forEach(m => {
        if (m.ts - lastTs > 300000) scroll.append(el('div', { class: 'msg-time', text: relTime(m.ts) }));
        lastTs = m.ts;
        scroll.append(el('div', { class: 'msg-bubble-row ' + m.from }, el('div', { class: 'msg-bubble', text: m.text })));
      });
      const input = el('input', { class: 'text-input msg-input', type: 'text', placeholder: 'iMessage 信息' });
      const send = () => {
        const v = input.value.trim(); if (!v) return;
        c.msgs.push({ from: 'me', text: v, ts: Date.now() });
        input.value = ''; save(); renderChat(); renderList();
        setTimeout(() => {
          if (!st.data.convs.includes(c)) return;
          c.msgs.push({ from: 'them', text: this.replies[Math.floor(Math.random() * this.replies.length)], ts: Date.now() });
          save();
          if (st.cur === c && document.body.contains(chatEl)) renderChat();
          else { c.unread++; Notify.send({ appId: 'messages', title: c.name, body: c.msgs[c.msgs.length - 1].text }); }
          renderList();
        }, 1200 + Math.random() * 2200);
      };
      input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') send(); });
      chatEl.append(el('div', { class: 'msg-header' }, el('span', { class: 'contact-avatar', text: c.name.slice(0, 1) }), el('b', { text: c.name })), scroll, el('div', { class: 'msg-input-row' }, input));
      setTimeout(() => { scroll.scrollTop = scroll.scrollHeight; }, 30);
    };
    const renderAll = () => { renderList(); renderChat(); };
    st.cur = st.data.convs[0] || null;
    renderAll();
  }
});

/* ==================== FaceTime ==================== */
Apps.register({
  id: 'facetime', name: 'FaceTime 通话', icon: 'assets/icons/facetime.png',
  w: 720, h: 520, minW: 480, minH: 360,
  menus() { return stdMenus(this); },
  onArgs(args, win) { if (args.call) win.appState?.startCall(args.call); },
  render(win, args) {
    const st = win.appState = { phase: 'idle', contact: null };
    win.body.classList.add('ft-body');
    const stage = el('div', { class: 'ft-stage' });
    win.body.append(stage);
    const renderIdle = () => {
      stage.innerHTML = '';
      stage.append(el('div', { class: 'ft-title', text: '选择联系人开始视频通话' }));
      const grid = el('div', { class: 'ft-grid' });
      ContactsApp.store.get().forEach(c => {
        const cell = el('div', { class: 'ft-cell' },
          el('span', { class: 'contact-big-avatar', text: c.name.slice(0, 1) }),
          el('div', { text: c.name }),
          el('button', { class: 'btn primary', text: '📹 呼叫', onclick: () => st.startCall(c) }));
        grid.append(cell);
      });
      stage.append(grid);
    };
    st.startCall = c => {
      st.contact = c; st.phase = 'calling';
      renderCall();
      st._t = setTimeout(() => {
        if (st.phase === 'calling') { st.phase = 'connected'; renderCall(); }
      }, 2500);
    };
    const renderCall = () => {
      const c = st.contact;
      stage.innerHTML = '';
      const video = el('div', { class: 'ft-video' + (st.phase === 'connected' ? ' live' : '') },
        el('span', { class: 'contact-big-avatar ft-avatar', text: c.name.slice(0, 1) }));
      const status = el('div', { class: 'ft-status', text: st.phase === 'calling' ? `正在呼叫 ${c.name}…` : st.phase === 'connected' ? `${c.name} · 00:00` : '通话已结束' });
      const selfView = el('div', { class: 'ft-self' }, el('span', { text: '🧑' }));
      const muteBtn = el('button', { class: 'ft-ctl', html: '🎙', title: '静音' });
      const camBtn = el('button', { class: 'ft-ctl', html: '📷', title: '关闭视频' });
      const endBtn = el('button', { class: 'ft-ctl end', html: '📞', title: '结束通话' });
      let secs = 0, timer = null;
      if (st.phase === 'connected') {
        timer = setInterval(() => {
          secs++;
          status.textContent = `${c.name} · ${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
        }, 1000);
        win.timers.push(timer);
      }
      muteBtn.addEventListener('click', () => muteBtn.classList.toggle('off'));
      camBtn.addEventListener('click', () => { selfView.classList.toggle('hidden'); camBtn.classList.toggle('off'); });
      endBtn.addEventListener('click', () => {
        clearInterval(timer); clearTimeout(st._t);
        st.phase = 'ended';
        status.textContent = '通话已结束';
        video.classList.remove('live');
        setTimeout(renderIdle, 1200);
      });
      stage.append(video, status, st.phase !== 'ended' ? selfView : null,
        el('div', { class: 'ft-controls' }, muteBtn, camBtn, endBtn));
    };
    win.onClose = () => clearTimeout(st._t);
    renderIdle();
    if (args.call) st.startCall(args.call);
  }
});

/* ==================== App Store 目录应用（安装后可用） ==================== */

/* 熊掌记 — Markdown 笔记 */
Apps.register({
  id: 'bear', name: '熊掌记', icon: 'assets/icons/bear.png', storeApp: true,
  w: 720, h: 500, minW: 480, minH: 320,
  menus(win) { return stdMenus(this, { file: [{ label: '保存', key: '⌘S', action: () => win?.appState?.save() }] }); },
  render(win) {
    const st = win.appState = { path: FS.HOME + '/Documents/熊掌记.md' };
    win.body.classList.add('te-body');
    const ta = el('textarea', { class: 'te-area', placeholder: '# 标题\n\n用 Markdown 记录想法…' });
    win.body.append(el('div', { class: 'bear-tagbar' }, el('span', { class: 'bear-tag', text: '#灵感' }), el('span', { class: 'bear-tag', text: '#工作' })), ta);
    try { if (FS.exists(st.path)) ta.value = FS.read(st.path); else ta.value = '# 欢迎使用熊掌记\n\n这是一篇 **Markdown** 笔记。\n'; } catch (e) {}
    st.save = () => { FS.write(st.path, ta.value, { mime: 'text/markdown' }); WM.setTitle(win, '熊掌记'); };
    ta.addEventListener('input', () => WM.setTitle(win, '熊掌记', true));
    win.el.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); st.save(); } });
  }
});

/* Typora — 实时预览 Markdown */
Apps.register({
  id: 'typora', name: 'Typora', icon: 'assets/icons/typora.png', storeApp: true,
  w: 780, h: 540, minW: 560, minH: 360,
  menus() { return stdMenus(this); },
  render(win) {
    win.body.classList.add('typora-body');
    const ta = el('textarea', { class: 'te-area typora-edit' });
    const pv = el('div', { class: 'typora-preview' });
    win.body.append(ta, pv);
    const renderMd = md => {
      pv.innerHTML = '';
      md.split('\n').forEach(line => {
        const escd = esc(line).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>');
        if (line.startsWith('# ')) pv.append(el('h1', { html: escd.slice(2) }));
        else if (line.startsWith('## ')) pv.append(el('h2', { html: escd.slice(3) }));
        else if (line.startsWith('### ')) pv.append(el('h3', { html: escd.slice(4) }));
        else if (line.startsWith('- ')) pv.append(el('p', { html: '• ' + escd.slice(2), class: 'ty-li' }));
        else if (line.trim() === '') pv.append(el('div', { style: { height: '10px' } }));
        else pv.append(el('p', { html: escd }));
      });
    };
    ta.value = '# Typora\n\n**所见即所得** 的 Markdown 编辑体验。\n\n- 左侧输入\n- 右侧实时预览\n\n`console.log("hello")`\n';
    ta.addEventListener('input', debounce(() => renderMd(ta.value), 150));
    renderMd(ta.value);
  }
});

/* VS Code Web — 轻量编辑器 */
Apps.register({
  id: 'vscode', name: 'VS Code Web', icon: 'assets/icons/vscode.png', storeApp: true,
  w: 860, h: 560, minW: 600, minH: 400,
  menus(win) { return stdMenus(this, { file: [{ label: '保存', key: '⌘S', action: () => win?.appState?.save() }] }); },
  render(win) {
    const st = win.appState = { path: null };
    win.body.classList.add('vscode-body');
    const tree = el('div', { class: 'vs-tree' });
    const ta = el('textarea', { class: 'vs-editor', spellcheck: 'false' });
    const status = el('div', { class: 'vs-status', text: '就绪' });
    win.body.append(tree, el('div', { class: 'vs-main' }, ta, status));
    const renderTree = () => {
      tree.innerHTML = '';
      tree.append(el('div', { class: 'fb-side-title', text: '资源管理器' }));
      FS.walk(FS.HOME, (p, n) => {
        if (p.startsWith(FS.TRASH) || p === FS.HOME) return;
        const depth = p.split('/').length - 3;
        if (depth > 2) return;
        const row = el('div', { class: 'vs-row' + (st.path === p ? ' sel' : ''), style: { paddingLeft: 10 + depth * 14 + 'px' } },
          el('span', { text: (n.t === 'd' ? '📁 ' : '📄 ') + FS.baseName(p) }));
        if (n.t === 'f') row.addEventListener('click', () => { st.path = p; ta.value = FS.read(p); status.textContent = p.replace(FS.HOME, '~'); renderTree(); });
        tree.append(row);
      });
    };
    st.save = () => { if (st.path) { FS.write(st.path, ta.value); status.textContent = '已保存 ' + st.path.replace(FS.HOME, '~'); } };
    win.el.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); st.save(); } });
    renderTree();
  }
});

/* Keynote — 简易幻灯片 */
Apps.register({
  id: 'keynote', name: 'Keynote 讲演', icon: 'assets/icons/keynote.png', storeApp: true,
  w: 800, h: 560, minW: 560, minH: 400,
  menus(win) { return stdMenus(this, { view: [{ label: '播放', key: '⌘P', action: () => win?.appState?.play() }] }); },
  slides: [
    { title: 'macOS 网页版', sub: '在浏览器中运行的桌面体验', bg: ['#4a6fa5', '#c86b85'] },
    { title: '虚拟文件系统', sub: '访达 · 终端 · 文本编辑 共享同一套文件', bg: ['#0a84ff', '#64d2ff'] },
    { title: '窗口管理器', sub: '拖动 · 缩放 · 全屏 · 最小化', bg: ['#bf5af2', '#ff9f0a'] },
    { title: '谢谢观看', sub: 'Made with ❤️', bg: ['#32d74b', '#0a84ff'] },
  ],
  render(win) {
    const st = win.appState = { idx: 0 };
    win.body.classList.add('keynote-body');
    const side = el('div', { class: 'kn-side' });
    const stage = el('div', { class: 'kn-stage' });
    win.body.append(side, stage);
    const renderSide = () => {
      side.innerHTML = '';
      this.slides.forEach((s, i) => {
        const th = el('div', { class: 'kn-thumb' + (i === st.idx ? ' sel' : ''), style: { background: `linear-gradient(135deg,${s.bg[0]},${s.bg[1]})` } }, el('span', { text: s.title }));
        th.addEventListener('click', () => { st.idx = i; renderAll(); });
        side.append(th);
      });
    };
    const renderStage = () => {
      const s = this.slides[st.idx];
      stage.innerHTML = '';
      stage.append(el('div', { class: 'kn-slide', style: { background: `linear-gradient(135deg,${s.bg[0]},${s.bg[1]})` } },
        el('div', { class: 'kn-title', text: s.title }), el('div', { class: 'kn-sub', text: s.sub })));
    };
    st.play = () => {
      let i = 0;
      const ov = el('div', { class: 'kn-play', tabindex: '0' });
      const show = () => {
        const s = this.slides[i];
        ov.style.background = `linear-gradient(135deg,${s.bg[0]},${s.bg[1]})`;
        ov.innerHTML = '';
        ov.append(el('div', { class: 'kn-title big', text: s.title }), el('div', { class: 'kn-sub big', text: s.sub }));
      };
      ov.addEventListener('click', () => { i++; i >= this.slides.length ? ov.remove() : show(); });
      ov.addEventListener('keydown', e => { if (e.key === 'Escape') ov.remove(); if (e.key === 'ArrowRight' || e.key === ' ') { i++; i >= this.slides.length ? ov.remove() : show(); } });
      win.body.append(ov); show(); ov.focus();
    };
    const renderAll = () => { renderSide(); renderStage(); };
    win.el.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { st.idx = Math.min(this.slides.length - 1, st.idx + 1); renderAll(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { st.idx = Math.max(0, st.idx - 1); renderAll(); }
    });
    renderAll();
  }
});

/* 播客 */
Apps.register({
  id: 'podcasts', name: '播客', icon: 'assets/icons/podcasts.png', storeApp: true,
  w: 720, h: 500, minW: 520, minH: 360,
  menus() { return stdMenus(this); },
  render(win) {
    const st = win.appState = { audio: new Audio(), cur: -1 };
    win.body.classList.add('music-body');
    const list = el('div', { class: 'music-list', style: { flex: '1' } });
    const bar = el('div', { class: 'pod-bar' });
    win.body.append(list, bar);
    Sys.registerMedia(st.audio);
    win.onClose = () => { st.audio.pause(); st.audio.src = ''; Sys.unregisterMedia(st.audio); };
    const eps = MUSIC_TRACKS.map((t, i) => ({ title: '第 ' + (i + 1) + ' 期 · ' + t.title, show: 'Web 桌面谈', dur: t.dur, file: t.file }));
    eps.forEach((ep, i) => {
      const btn = el('button', { class: 'btn primary', text: '▶' });
      btn.addEventListener('click', () => {
        if (st.cur === i && !st.audio.paused) { st.audio.pause(); btn.textContent = '▶'; return; }
        st.cur = i;
        st.audio.src = 'assets/audio/' + encodeURIComponent(ep.file) + '.mp3';
        st.audio.play().then(() => btn.textContent = '⏸').catch(() => { bar.textContent = '音频加载失败'; });
      });
      list.append(el('div', { class: 'pod-row' },
        el('span', { class: 'pod-art', text: '🎙' }),
        el('div', { class: 'pod-info' }, el('b', { text: ep.title }), el('small', { text: `${ep.show} · ${fmtDur(ep.dur)}` })),
        btn));
    });
    st.audio.addEventListener('ended', () => { st.cur = -1; $$('.pod-row .btn', list).forEach(b => b.textContent = '▶'); });
  }
});

/* Apple News */
Apps.register({
  id: 'news', name: 'Apple News', icon: 'assets/icons/news.png', storeApp: true,
  w: 760, h: 540, minW: 520, minH: 360,
  menus() { return stdMenus(this); },
  render(win) {
    win.body.classList.add('news-body');
    const arts = [
      ['macOS 网页版 1.0 正式发布', '科技', '完全在浏览器中运行的桌面体验：窗口管理、虚拟文件系统、20+ 款应用，全部离线可用。'],
      ['本地优先软件为何卷土重来', '观点', '当云服务成为默认，选择把数据留在本地反而成了一种新的自由。'],
      ['浏览器平台能力年度盘点', '技术', '从通知到文件系统访问，Web 与原生应用的边界正在消融。'],
      ['开源素材生态探访', '社区', 'CC-BY 音乐、CC0 视频与社区图标包，让个人项目也能拥有完整质感。'],
    ];
    arts.forEach(([t, c, d]) => {
      win.body.append(el('div', { class: 'news-card' },
        el('div', { class: 'news-cat', text: c }),
        el('div', { class: 'news-title', text: t }),
        el('div', { class: 'news-desc', text: d })));
    });
  }
});

/* GitHub Desktop */
Apps.register({
  id: 'github', name: 'GitHub Desktop', icon: 'assets/icons/github.png', storeApp: true,
  w: 780, h: 540, minW: 560, minH: 380,
  menus() { return stdMenus(this); },
  render(win) {
    win.body.classList.add('gh-body');
    win.body.append(
      el('div', { class: 'gh-head' },
        el('div', { class: 'gh-repo', text: 'moonshot / macos-web' }),
        el('div', { class: 'gh-badges' }, el('span', { class: 'gh-badge', text: '★ 1024' }), el('span', { class: 'gh-badge', text: '⑂ 128' }))),
      el('div', { class: 'gh-readme' },
        el('h2', { text: 'macos-web' }),
        el('p', { text: '纯静态 macOS 桌面模拟器：原生 HTML/CSS/JavaScript，无构建链。' }),
        el('pre', { class: 'sf-code', text: 'git clone https://example.com/macos-web\ncd macos-web\n# 双击 index.html 即可运行' }),
        el('h3', { text: '特性' }),
        el('p', { text: '· 完整窗口管理器（拖动 / 8 向缩放 / 全屏）\n· localStorage 虚拟文件系统\n· 20+ 内置应用与完整系统设置\n· 离线优先，优雅回退' })));
  }
});

/* Apple TV */
Apps.register({
  id: 'tv', name: 'Apple TV', icon: 'assets/icons/tv.png', storeApp: true,
  w: 800, h: 560, minW: 560, minH: 400,
  menus() { return stdMenus(this); },
  render(win) {
    const st = win.appState = {};
    win.body.classList.add('tv-body');
    const grid = el('div', { class: 'tv-grid' });
    const playerBox = el('div', { class: 'tv-player hidden' });
    win.body.append(el('h2', { class: 'store-h', text: '立即观看' }), grid, playerBox);
    let video = null;
    QT_VIDEOS.forEach((v, i) => {
      const card = el('div', { class: 'tv-card' },
        el('div', { class: 'tv-poster tv-p' + i }, el('span', { text: '▶' })),
        el('div', { class: 'tv-name', text: v.title }),
        el('div', { class: 'tv-sub', text: v.src }));
      card.addEventListener('click', () => {
        playerBox.classList.remove('hidden');
        if (video) { video.pause(); Sys.unregisterMedia(video); } // 切换片源前注销旧实例
        playerBox.innerHTML = '';
        video = el('video', { class: 'tv-video', controls: '', autoplay: '' });
        video.innerHTML = `<source src="assets/video/${v.file}" type="video/mp4"><source src="assets/video/${v.file.replace('.mp4', '.webm')}" type="video/webm">`;
        video.load();
        Sys.registerMedia(video);
        playerBox.append(el('div', { class: 'tv-ptitle', text: v.title }), video);
        playerBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      grid.append(card);
    });
    win.onClose = () => { if (video) { video.pause(); video.src = ''; Sys.unregisterMedia(video); } };
  }
});
