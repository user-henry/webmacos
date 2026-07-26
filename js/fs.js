/* ============ 虚拟文件系统（localStorage 持久化） ============ */
'use strict';
const FS = {
  HOME: '/Users/guest',
  get TRASH() { return this.HOME + '/.Trash'; },
  root: null,

  init() {
    this.root = Store.get('fs', null);
    if (!this.root || this.root.t !== 'd') { this.root = { t: 'd', c: {}, mtime: Date.now() }; this.seed(); }
    Bus.on('apps:ready', () => this.syncApps());
  },

  seed() {
    const dirs = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Applications', '.Trash'];
    dirs.forEach(d => this.mkdir(this.HOME + '/' + d, { recursive: true, silent: true }));
    this.write(this.HOME + '/Desktop/welcome.txt', [
      '欢迎使用 macOS 网页版！', '',
      '这是一套在浏览器中运行的桌面模拟器。', '你可以：',
      '· 双击打开「Sample Folder」和各个应用', '· 在访达、终端、文本编辑之间管理同一套虚拟文件',
      '· 通过 Apple 菜单锁定、重启或关机', '· 在系统设置中更换壁纸、切换深色模式', '',
      '所有数据都保存在浏览器本地，刷新后依然存在。'
    ].join('\n'), { silent: true });
    this.mkdir(this.HOME + '/Desktop/Sample Folder', { silent: true });
    this.write(this.HOME + '/Desktop/Sample Folder/会议纪要.txt', '周会纪要\n\n1. 桌面端体验优化\n2. 虚拟文件系统联调\n3. 下周发布预览版', { silent: true });
    this.write(this.HOME + '/Desktop/Sample Folder/待办.txt', '- [x] 搭建窗口管理器\n- [x] 接入通知中心\n- [ ] 完善离线回退', { silent: true });
    this.write(this.HOME + '/Documents/购物清单.txt', '牛奶\n鸡蛋\n全麦面包\n咖啡豆\n牛油果\n', { silent: true });
    this.write(this.HOME + '/Documents/Ideas.txt', '想法收集\n\n· 给屏保加上天气\n· 终端支持管道\n· 地图离线瓦片\n', { silent: true });
    this.write(this.HOME + '/Documents/旅行清单.txt', '京都 4 日行\n\nD1 清水寺 / 二年坂\nD2 岚山竹林 / 渡月桥\nD3 伏见稻荷大社\nD4 锦市场采购\n', { silent: true });
    this.write(this.HOME + '/Documents/关于本系统.txt', 'macOS 网页版 v1.0\n\n纯 HTML/CSS/JavaScript 实现，无需构建。\n数据存储于 localStorage，离线可用。', { silent: true });
    this.write(this.HOME + '/Downloads/说明.txt', '此目录用于存放下载的文件。', { silent: true });
    this.write(this.HOME + '/Pictures/壁纸说明.txt', '系统内置多张壁纸，可在「系统设置 › 墙纸」中切换。', { silent: true });
    this.write(this.HOME + '/Music/曲目说明.txt', '音乐 App 已内置 6 首 Kevin MacLeod (CC-BY) 曲目。', { silent: true });
    this.save();
  },

  /* 把已注册应用同步为 /Applications 下的 .app 条目。
   * 只同步内置 App 与已安装的 storeApp；同时迁移清理旧版本被错误提前写入的
   * 未安装 storeApp 条目（仅删除 t==='a' 的占位节点，绝不动用户同名普通文件）。 */
  syncApps() {
    if (!window.Apps) return;
    const dir = this.node(this.HOME + '/Applications');
    if (!dir) return;
    const installed = id => globalThis.AppStoreApp && AppStoreApp.isInstalled(id);
    const want = new Set();
    for (const app of Object.values(Apps.registry)) {
      if (app.storeApp && !installed(app.id)) continue;
      want.add(app.id);
      const name = app.name + '.app';
      if (!dir.c[name]) dir.c[name] = { t: 'a', app: app.id, mtime: Date.now() };
    }
    let dirty = false;
    for (const [name, node] of Object.entries(dir.c)) {
      if (node.t === 'a' && node.app && !want.has(node.app)) {
        const reg = Apps.registry[node.app];
        if (reg && reg.storeApp) { delete dir.c[name]; dirty = true; }
      }
    }
    this.save(); Bus.emit('fs:changed', { op: 'sync', paths: [this.HOME + '/Applications'], dirty });
  },

  save() { Store.set('fs', this.root); },

  normalize(path) {
    if (!path) return '/';
    const parts = [];
    for (const p of String(path).split('/')) {
      if (!p || p === '.') continue;
      if (p === '..') parts.pop(); else parts.push(p);
    }
    return '/' + parts.join('/');
  },
  join(...segs) { return this.normalize(segs.join('/')); },
  baseName(path) { path = this.normalize(path); return path === '/' ? '/' : path.slice(path.lastIndexOf('/') + 1); },
  dirName(path) { path = this.normalize(path); const i = path.lastIndexOf('/'); return i <= 0 ? '/' : path.slice(0, i); },

  node(path) {
    path = this.normalize(path);
    if (path === '/') return this.root;
    let cur = this.root;
    for (const seg of path.slice(1).split('/')) {
      if (!cur || cur.t !== 'd' || !cur.c[seg]) return null;
      cur = cur.c[seg];
    }
    return cur;
  },
  exists(path) { return !!this.node(path); },
  isDir(path) { return this.node(path)?.t === 'd'; },
  parent(path) {
    path = this.normalize(path);
    const dir = this.dirName(path), name = this.baseName(path);
    const p = this.node(dir);
    return p && p.t === 'd' ? [p, name, dir] : [null, name, dir];
  },
  assertDir(path) { const n = this.node(path); if (!n || n.t !== 'd') throw new Error('不是文件夹: ' + path); return n; },

  list(path, { showHidden = false } = {}) {
    const n = this.assertDir(path);
    return Object.entries(n.c)
      .filter(([name]) => showHidden || !name.startsWith('.'))
      .map(([name, node]) => ({ name, path: this.join(path, name), node }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  },
  read(path) {
    const n = this.node(path);
    if (!n) throw new Error('文件不存在: ' + path);
    if (n.t !== 'f') throw new Error('不是文本文件: ' + path);
    return n.data ?? '';
  },
  write(path, data, { mime, silent } = {}) {
    const [p, name] = this.parent(path);
    if (!p) throw new Error('父目录不存在: ' + path);
    const now = Date.now();
    if (p.c[name] && p.c[name].t === 'd') throw new Error('同名文件夹已存在: ' + name);
    p.c[name] = { t: 'f', data: String(data ?? ''), mime: mime || this.mimeOf(name), mtime: now };
    this.save(); if (!silent) Bus.emit('fs:changed', { op: 'write', paths: [this.normalize(path), this.dirName(path)] });
  },
  mkdir(path, { recursive = false, silent } = {}) {
    path = this.normalize(path);
    if (this.exists(path)) { if (!recursive) throw new Error('已存在: ' + path); return; }
    if (recursive) {
      let cur = this.root, curPath = '';
      for (const seg of path.slice(1).split('/')) {
        curPath += '/' + seg;
        if (!cur.c[seg]) cur.c[seg] = { t: 'd', c: {}, mtime: Date.now() };
        if (cur.c[seg].t !== 'd') throw new Error('路径冲突: ' + curPath);
        cur = cur.c[seg];
      }
      this.save(); if (!silent) Bus.emit('fs:changed', { op: 'mkdir', paths: [path, this.dirName(path)] });
      return;
    }
    const [p, name] = this.parent(path);
    if (!p) throw new Error('父目录不存在: ' + path);
    p.c[name] = { t: 'd', c: {}, mtime: Date.now() };
    this.save(); if (!silent) Bus.emit('fs:changed', { op: 'mkdir', paths: [path, this.dirName(path)] });
  },
  rename(path, newName) {
    path = this.normalize(path); newName = String(newName || '').trim();
    if (!newName || newName.includes('/')) throw new Error('名称无效');
    const [p, name, dir] = this.parent(path);
    if (!p || !p.c[name]) throw new Error('不存在: ' + path);
    if (name === newName) return path;
    if (p.c[newName]) throw new Error('已存在同名项目: ' + newName);
    p.c[newName] = p.c[name]; delete p.c[name];
    p.c[newName].mtime = Date.now();
    const np = this.join(dir, newName);
    this.save(); Bus.emit('fs:changed', { op: 'rename', paths: [path, np, dir] });
    return np;
  },
  uniqueName(dir, base) {
    const n = this.assertDir(dir);
    if (!n.c[base]) return base;
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base, ext = dot > 0 ? base.slice(dot) : '';
    for (let i = 2; ; i++) { const cand = `${stem} ${i}${ext}`; if (!n.c[cand]) return cand; }
  },
  copy(src, dstDir) {
    src = this.normalize(src); dstDir = this.normalize(dstDir);
    const sn = this.node(src); if (!sn) throw new Error('不存在: ' + src);
    const dd = this.assertDir(dstDir);
    const name = this.uniqueName(dstDir, this.baseName(src));
    dd.c[name] = structuredClone(sn); dd.c[name].mtime = Date.now();
    delete dd.c[name].origPath;
    this.save(); Bus.emit('fs:changed', { op: 'copy', paths: [src, this.join(dstDir, name), dstDir] });
    return this.join(dstDir, name);
  },
  move(src, dstDir) {
    src = this.normalize(src); dstDir = this.normalize(dstDir);
    if (src === dstDir) throw new Error('不能移动到自身');
    if (dstDir === src || dstDir.startsWith(src + '/')) throw new Error('不能把文件夹移动到它自己内部');
    const [p, name] = this.parent(src);
    if (!p || !p.c[name]) throw new Error('不存在: ' + src);
    const dd = this.assertDir(dstDir);
    let final = name;
    if (dd.c[final]) final = this.uniqueName(dstDir, name);
    dd.c[final] = p.c[name]; delete p.c[name];
    dd.c[final].mtime = Date.now();
    const np = this.join(dstDir, final);
    this.save(); Bus.emit('fs:changed', { op: 'move', paths: [src, np, this.dirName(src), dstDir] });
    return np;
  },
  remove(path) {
    path = this.normalize(path);
    if (path === '/' || path === this.TRASH) throw new Error('不能删除该项目');
    const [p, name, dir] = this.parent(path);
    if (!p || !p.c[name]) throw new Error('不存在: ' + path);
    delete p.c[name];
    this.save(); Bus.emit('fs:changed', { op: 'remove', paths: [path, dir] });
  },
  trash(path) {
    path = this.normalize(path);
    if (path.startsWith(this.TRASH + '/')) return this.remove(path);
    const n = this.node(path); if (!n) throw new Error('不存在: ' + path);
    n.origPath = path;
    const np = this.move(path, this.TRASH);
    Bus.emit('trash:changed'); return np;
  },
  restore(name) {
    const tp = this.join(this.TRASH, name);
    const n = this.node(tp); if (!n) throw new Error('不在废纸篓中');
    let dst = n.origPath ? this.dirName(n.origPath) : this.HOME + '/Desktop';
    if (!this.isDir(dst)) dst = this.HOME + '/Desktop';
    delete n.origPath;
    const np = this.move(tp, dst);
    Bus.emit('trash:changed'); return np;
  },
  emptyTrash() {
    const t = this.assertDir(this.TRASH);
    t.c = {}; this.save();
    Bus.emit('fs:changed', { op: 'emptyTrash', paths: [this.TRASH] });
    Bus.emit('trash:changed');
  },
  walk(path, fn) {
    const rec = (p, node) => { fn(p, node); if (node.t === 'd') for (const [nm, ch] of Object.entries(node.c)) rec(this.join(p, nm), ch); };
    const n = this.node(path); if (n) rec(this.normalize(path), n);
  },
  size(path = '/') {
    let s = 0; this.walk(path, (p, n) => { if (n.t === 'f') s += (n.data || '').length; }); return s;
  },
  search(query, base = '/') {
    const out = []; const q = query.toLowerCase();
    this.walk(base, (p, n) => {
      if (out.length >= 40) return;
      if (p !== base && this.baseName(p).toLowerCase().includes(q) && !p.startsWith(this.TRASH)) out.push({ path: p, node: n });
    });
    return out;
  },
  mimeOf(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    return { txt: 'text/plain', md: 'text/markdown', rtf: 'text/rtf', log: 'text/plain', json: 'application/json', csv: 'text/csv' }[ext] || 'text/plain';
  },
  iconFor(path) {
    const n = this.node(path);
    if (n?.t === 'a') return Apps.get(n.app)?.icon || 'assets/icons/txt.svg';
    if (n?.t === 'd') return 'assets/icons/folder.svg';
    if (n?.t === 'f') {
      const ext = (path.split('.').pop() || '').toLowerCase();
      if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'assets/icons/preview.svg';
      if (ext === 'pdf') return 'assets/icons/pdf.svg';
      return 'assets/icons/txt.svg';
    }
    return 'assets/icons/txt.svg';
  },
  kindOf(path) {
    const n = this.node(path);
    if (n?.t === 'd') return '文件夹';
    if (n?.t === 'a') return '应用程序';
    const ext = (path.split('.').pop() || '').toLowerCase();
    return { txt: '纯文本', md: 'Markdown', rtf: 'RTF', log: '日志', json: 'JSON', csv: 'CSV', pdf: 'PDF' }[ext] || '文件';
  }
};
window.FS = FS;
