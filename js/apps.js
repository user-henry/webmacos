/* ============ 应用注册表 + 核心应用（访达/终端/文本编辑/备忘录/计算器/日历） ============ */
'use strict';
const Apps = {
  registry: {},
  register(def) {
    def.w = def.w || 720; def.h = def.h || 480;
    def.minW = def.minW || 320; def.minH = def.minH || 240;
    def.about = def.about || `${def.name} — macOS 网页版内置应用`;
    this.registry[def.id] = def;
  },
  get(id) { return this.registry[id]; },
  open(id, args) {
    const app = this.get(id);
    if (!app) { console.warn('[apps] 未注册:', id); return null; }
    if (app.singleton !== false) {
      const ex = WM.windowsForApp(id)[0];
      if (ex) {
        if (args && app.onArgs) { try { app.onArgs(args, ex); } catch (e) { console.error(e); } }
        WM.focus(ex); return ex;
      }
    }
    const win = WM.openWindow({ app, title: app.name, icon: app.icon, w: app.w, h: app.h, minW: app.minW, minH: app.minH, data: args });
    try { app.render(win, args || {}); } catch (e) {
      console.error('[apps] 渲染失败:', id, e);
      win.body.append(el('div', { class: 'empty-state' }, el('div', { class: 'es-icon', text: '⚠️' }), el('div', { text: `${app.name} 打开失败` })));
    }
    return win;
  },
  quit(id) { WM.windowsForApp(id).slice().forEach(w => WM.close(w)); },
  openPath(path) {
    const n = FS.node(path);
    if (!n) { UI.alert('找不到项目', `“${FS.baseName(path)}”不存在。`, 'assets/icons/finder.png'); return; }
    if (n.t === 'd') return this.open('finder', { path });
    if (n.t === 'a') return this.open(n.app);
    const ext = (path.split('.').pop() || '').toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) || ext === 'pdf') return this.open('preview', { path });
    return this.open('textedit', { path });
  }
};

/* 标准菜单构造 */
function stdMenus(app, { file = [], edit = [], view = [], format = [], store = [] } = {}) {
  const menus = [];
  menus.push({
    label: '文件', items: () => [
      ...file,
      file.length ? { sep: true } : null,
      { label: '关闭窗口', key: '⌘W', disabled: !WM.activeWin, action: () => WM.activeWin && WM.close(WM.activeWin) },
    ].filter(Boolean)
  });
  const editBase = () => {
    const a = document.activeElement;
    const isText = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
    const doCmd = cmd => {
      if (!isText) return;
      if (cmd === 'selectAll') { a.select ? a.select() : document.execCommand('selectAll'); return; }
      if (cmd === 'cut' || cmd === 'copy') {
        const sel = a.value?.slice(a.selectionStart, a.selectionEnd) ?? '';
        if (cmd === 'copy' && sel) navigator.clipboard?.writeText(sel);
        if (cmd === 'cut' && sel) { navigator.clipboard?.writeText(sel); a.setRangeText('', a.selectionStart, a.selectionEnd, 'end'); a.dispatchEvent(new Event('input', { bubbles: true })); }
      }
      if (cmd === 'paste') navigator.clipboard?.readText().then(t => { a.setRangeText(t, a.selectionStart, a.selectionEnd, 'end'); a.dispatchEvent(new Event('input', { bubbles: true })); }).catch(() => {});
    };
    return [
      ...edit,
      edit.length ? { sep: true } : null,
      { label: '剪切', key: '⌘X', disabled: !isText, action: () => doCmd('cut') },
      { label: '拷贝', key: '⌘C', disabled: !isText, action: () => doCmd('copy') },
      { label: '粘贴', key: '⌘V', disabled: !isText, action: () => doCmd('paste') },
      { label: '全选', key: '⌘A', disabled: !isText, action: () => doCmd('selectAll') },
    ].filter(Boolean);
  };
  menus.push({ label: '编辑', items: editBase });
  menus.push({
    label: '显示', items: () => [
      ...view,
      view.length ? { sep: true } : null,
      { label: WM.activeWin?.state === 'fullscreen' ? '退出全屏' : '进入全屏', key: '⌃⌘F', disabled: !WM.activeWin, action: () => WM.activeWin && WM.toggleFullscreen(WM.activeWin) },
    ].filter(Boolean)
  });
  if (format.length) menus.push({ label: '格式', items: () => format });
  if (store.length) menus.push({ label: '商店', items: () => store });
  menus.push({
    label: '窗口', items: () => {
      const wins = WM.windows;
      return [
        { label: '最小化', key: '⌘M', disabled: !WM.activeWin, action: () => WM.activeWin && WM.minimize(WM.activeWin) },
        { label: '缩放', disabled: !WM.activeWin, action: () => WM.activeWin && WM.toggleZoom(WM.activeWin) },
        { sep: true },
        ...wins.map(w => ({ label: w.title, checked: w === WM.activeWin, action: () => WM.focus(w) })),
        wins.length ? { sep: true } : null,
        { label: '全部前置', disabled: !wins.length, action: () => wins.forEach(w => WM.restore(w)) },
      ].filter(Boolean);
    }
  });
  menus.push({
    label: '帮助', items: () => [
      { label: `${app.name}帮助`, action: () => UI.dialog({ icon: app.icon, title: `${app.name}帮助`, msg: app.about, buttons: ['好'] }) },
    ]
  });
  return menus;
}

/* ==================== 访达 ==================== */
const FinderApp = {
  id: 'finder', name: '访达', icon: 'assets/icons/finder.png',
  w: 860, h: 540, minW: 560, minH: 340, singleton: false,
  menus(win) {
    const st = win?.appState;
    return stdMenus(this, {
      file: [
        { label: '新建 Finder 窗口', key: '⌘N', action: () => Apps.open('finder', { path: st?.path }) },
        { label: '新建文件夹', key: '⇧⌘N', action: () => st?.newFolder() },
        { sep: true },
        { label: '移到废纸篓', key: '⌘⌫', disabled: !st?.selection.size, action: () => st?.trashSelection() },
        { label: '显示简介', key: '⌘I', disabled: st?.selection.size !== 1, action: () => st?.showInfo() },
      ],
      edit: [
        { label: '拷贝', key: '⌘C', disabled: !st?.selection.size, action: () => st?.copySel('copy') },
        { label: '粘贴', key: '⌘V', disabled: !st?.clipboard, action: () => st?.paste() },
      ],
      view: [
        { label: '按图标显示', key: '⌘1', checked: st?.view === 'icon', action: () => st?.setView('icon') },
        { label: '按列表显示', key: '⌘2', checked: st?.view === 'list', action: () => st?.setView('list') },
        { sep: true },
        { label: '排序方式', submenu: [
          { label: '名称', checked: st?.sortBy === 'name', action: () => st?.setSort('name') },
          { label: '种类', checked: st?.sortBy === 'kind', action: () => st?.setSort('kind') },
          { label: '修改日期', checked: st?.sortBy === 'date', action: () => st?.setSort('date') },
        ] },
      ]
    });
  },
  render(win, args) {
    const st = win.appState = {
      path: args.path || FS.HOME + '/Desktop',
      history: [], hi: -1, anchor: null,
      view: Sys.settings.finderView, sortBy: Sys.settings.finderSort,
      selection: new Set(), clipboard: FinderApp.clipboard || null,
      search: '',
    };
    // 历史模型：history 保存完整访问路径（含当前），hi 指向当前位置。
    // back 只 hi--，forward 只 hi++；普通导航删除 forward 分支、追加并移动 hi。
    st.navigate = (p, push = true) => {
      if (!FS.isDir(p)) return;
      p = FS.normalize(p);
      if (push && st.history[st.hi] !== p) {
        st.history = st.history.slice(0, st.hi + 1);
        st.history.push(p);
        st.hi = st.history.length - 1;
      }
      st.path = p; st.selection.clear(); st.anchor = null; st.search = ''; searchInput.value = '';
      render();
    };
    st.back = () => { if (st.hi > 0) { st.hi--; st.navigate(st.history[st.hi], false); } };
    st.fwd = () => { if (st.hi < st.history.length - 1) { st.hi++; st.navigate(st.history[st.hi], false); } };
    // 初始路径只入列一次；args.path 打开时不产生重复历史
    st.history = [FS.normalize(st.path)]; st.hi = 0;
    st.setView = v => { st.view = v; Sys.settings.finderView = v; Sys.save(); render(); };
    st.setSort = s => { st.sortBy = s; Sys.settings.finderSort = s; Sys.save(); render(); };
    st.newFolder = async () => {
      const name = await UI.prompt('新建文件夹', '请输入文件夹名称：', '未命名文件夹');
      if (!name) return;
      try { FS.mkdir(FS.join(st.path, name)); } catch (e) { UI.alert('无法创建', e.message, this.icon); }
    };
    st.trashSelection = () => {
      [...st.selection].forEach(p => { try { FS.trash(p); } catch (e) { UI.alert('无法移到废纸篓', e.message, this.icon); } });
      st.selection.clear();
    };
    st.copySel = op => { st.clipboard = FinderApp.clipboard = { op, paths: [...st.selection], from: st.path }; };
    st.paste = () => {
      const cb = st.clipboard; if (!cb) return;
      for (const p of cb.paths) {
        try { cb.op === 'copy' ? FS.copy(p, st.path) : FS.move(p, st.path); } catch (e) { UI.alert('粘贴失败', e.message, this.icon); }
      }
      if (cb.op === 'cut') { st.clipboard = FinderApp.clipboard = null; }
    };
    st.showInfo = () => {
      const p = [...st.selection][0]; if (!p) return;
      const n = FS.node(p);
      const size = n.t === 'f' ? fmtBytes((n.data || '').length) : (n.t === 'd' ? `${Object.keys(n.c).length} 个项目` : '—');
      UI.dialog({ icon: FS.iconFor(p), title: FS.baseName(p) + ' 简介', buttons: ['好'], msg: `种类：${FS.kindOf(p)}\n大小：${size}\n位置：${FS.dirName(p).replace(FS.HOME, '~')}\n修改时间：${new Date(n.mtime || 0).toLocaleString('zh-CN')}` });
    };
    st.startRename = p => {
      const itemEl = content.querySelector(`[data-path="${CSS.escape(p)}"]`);
      if (!itemEl) return;
      const nameEl = itemEl.querySelector('.fi-name');
      const old = FS.baseName(p);
      const input = el('input', { class: 'text-input fi-rename', value: old });
      nameEl.replaceWith(input);
      input.focus();
      const dot = old.lastIndexOf('.'); input.setSelectionRange(0, dot > 0 ? dot : old.length);
      let done = false;
      const commit = () => {
        if (done) return; done = true;
        const v = input.value.trim();
        if (v && v !== old) { try { FS.rename(p, v); } catch (e) { UI.alert('无法重命名', e.message, this.icon); } }
        render();
        content.focus({ preventScroll: true });
      };
      input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') commit(); if (e.key === 'Escape') { done = true; render(); } });
      input.addEventListener('blur', commit);
    };

    // ===== 布局 =====
    win.body.classList.add('finder');
    const backBtn = el('button', { class: 'fb-btn', title: '后退', html: '‹' });
    const fwdBtn = el('button', { class: 'fb-btn', title: '前进', html: '›' });
    const crumb = el('div', { class: 'fb-crumb' });
    const viewSeg = el('div', { class: 'segmented' },
      el('button', { text: '图标', title: '图标视图', onclick: () => st.setView('icon') }),
      el('button', { text: '列表', title: '列表视图', onclick: () => st.setView('list') }));
    const sortSel = el('select', { class: 'text-input fb-sort', title: '排序方式' },
      el('option', { value: 'name', text: '按名称' }), el('option', { value: 'kind', text: '按种类' }), el('option', { value: 'date', text: '按日期' }));
    sortSel.value = st.sortBy;
    sortSel.addEventListener('change', () => st.setSort(sortSel.value));
    const newBtn = el('button', { class: 'fb-btn', title: '新建文件夹', html: '＋' });
    newBtn.addEventListener('click', () => st.newFolder());
    const searchInput = el('input', { class: 'text-input fb-search', type: 'search', placeholder: '搜索' });
    searchInput.addEventListener('input', debounce(() => { st.search = searchInput.value.trim(); renderList(); }, 200));
    const toolbar = el('div', { class: 'fb-toolbar' }, backBtn, fwdBtn, crumb, viewSeg, sortSel, newBtn, searchInput);

    const side = el('div', { class: 'fb-sidebar' });
    const content = el('div', { class: 'fb-content', tabindex: '0' });
    const main = el('div', { class: 'fb-main' }, side, content);
    win.body.append(toolbar, main);

    const favs = [
      ['桌面', FS.HOME + '/Desktop', '🖥'], ['文稿', FS.HOME + '/Documents', '📄'], ['下载', FS.HOME + '/Downloads', '⬇️'],
      ['图片', FS.HOME + '/Pictures', '🖼'], ['音乐', FS.HOME + '/Music', '🎵'], ['应用程序', FS.HOME + '/Applications', '📦'],
    ];
    const locs = [['iCloud 云盘', '__icloud', '☁️'], ['废纸篓', FS.TRASH, '🗑']];
    const renderSide = () => {
      side.innerHTML = '';
      const group = (title, items) => {
        side.append(el('div', { class: 'fb-side-title', text: title }));
        for (const [name, p, ico] of items) {
          const row = el('div', { class: 'fb-side-item' + (st.path === p ? ' sel' : '') },
            el('span', { class: 'fb-side-ico', text: ico }), el('span', { text: name }));
          row.addEventListener('click', () => {
            if (p === '__icloud') { UI.dialog({ icon: 'assets/icons/finder.png', title: 'iCloud 云盘', msg: 'iCloud 在离线环境下不可用。你的文件都保存在本机的虚拟磁盘中。', buttons: ['好'] }); return; }
            st.navigate(p);
          });
          side.append(row);
        }
      };
      group('个人收藏', favs); group('位置', locs);
    };

    const sortItems = items => {
      const by = st.sortBy;
      return items.sort((a, b) => {
        if ((a.node.t === 'd') !== (b.node.t === 'd')) return a.node.t === 'd' ? -1 : 1;
        if (by === 'kind') return FS.kindOf(a.path).localeCompare(FS.kindOf(b.path), 'zh') || a.name.localeCompare(b.name, 'zh-Hans-CN');
        if (by === 'date') return (b.node.mtime || 0) - (a.node.mtime || 0);
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
      });
    };

    const renderCrumb = () => {
      crumb.innerHTML = '';
      const rel = st.path === FS.HOME ? ['~'] : st.path.replace(FS.HOME, '~').split('/').filter(Boolean);
      let acc = '';
      rel.forEach((seg, i) => {
        acc += (i === 0 && seg === '~') ? '' : '/' + seg;
        const target = seg === '~' ? FS.HOME : FS.join(FS.HOME, acc);
        const b = el('button', { class: 'fb-crumb-item' + (i === rel.length - 1 ? ' cur' : ''), text: seg === '~' ? '客人用户' : seg });
        b.addEventListener('click', () => st.navigate(target));
        crumb.append(b);
        if (i < rel.length - 1) crumb.append(el('span', { class: 'fb-crumb-sep', text: '›' }));
      });
    };

    /* 仅选择变化：切换 class，不重建列表 DOM（保证双击、重命名输入、拖拽不被打断） */
    const updateSel = () => {
      content.querySelectorAll('.fb-item').forEach(n => n.classList.toggle('sel', st.selection.has(n.dataset.path)));
    };
    const renderList = () => {
      content.innerHTML = '';
      content.className = 'fb-content ' + (st.view === 'icon' ? 'icon-view' : 'list-view');
      let items = [];
      try { items = FS.list(st.path); } catch (e) { content.append(el('div', { class: 'empty-state', text: '无法读取此文件夹' })); return; }
      if (st.search) items = items.filter(it => it.name.toLowerCase().includes(st.search.toLowerCase()));
      items = sortItems(items);
      if (!items.length) { content.append(el('div', { class: 'empty-state' }, el('div', { class: 'es-icon', text: '📂' }), el('div', { text: st.search ? '没有匹配的结果' : '文件夹为空' }))); }
      for (const it of items) {
        const selected = st.selection.has(it.path);
        const itemEl = el('div', {
          class: 'fb-item' + (selected ? ' sel' : ''), dataset: { path: it.path }, draggable: 'true', tabindex: '0',
        }, iconImg(FS.iconFor(it.path), 'fi-icon', ''), el('div', { class: 'fi-name', text: it.name }));
        if (st.view === 'list') {
          itemEl.append(
            el('span', { class: 'fi-col', text: FS.kindOf(it.path) }),
            el('span', { class: 'fi-col', text: it.node.mtime ? new Date(it.node.mtime).toLocaleDateString('zh-CN') : '—' }),
            el('span', { class: 'fi-col', text: it.node.t === 'f' ? fmtBytes((it.node.data || '').length) : '—' }));
        }
        itemEl.addEventListener('click', e => {
          e.stopPropagation();
          if (e.metaKey || e.ctrlKey) { st.selection.has(it.path) ? st.selection.delete(it.path) : st.selection.add(it.path); st.anchor = it.path; }
          else if (e.shiftKey && st.anchor) {
            const arr = items.map(x => x.path);
            const a = arr.indexOf(st.anchor), b = arr.indexOf(it.path);
            if (a >= 0 && b >= 0) st.selection = new Set(arr.slice(Math.min(a, b), Math.max(a, b) + 1));
          } else { st.selection = new Set([it.path]); st.anchor = it.path; }
          updateSel();
          content.focus({ preventScroll: true });
        });
        itemEl.addEventListener('dblclick', e => { e.stopPropagation(); it.node.t === 'd' ? st.navigate(it.path) : Apps.openPath(it.path); });
        itemEl.addEventListener('contextmenu', e => {
          e.preventDefault(); e.stopPropagation();
          if (!st.selection.has(it.path)) { st.selection = new Set([it.path]); st.anchor = it.path; updateSel(); }
          UI.contextMenu(this.itemMenu(st, it), e);
        });
        itemEl.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-fspath', it.path); });
        if (it.node.t === 'd') {
          itemEl.addEventListener('dragover', e => { e.preventDefault(); itemEl.classList.add('drop-hint'); });
          itemEl.addEventListener('dragleave', () => itemEl.classList.remove('drop-hint'));
          itemEl.addEventListener('drop', e => {
            e.preventDefault(); itemEl.classList.remove('drop-hint');
            const src = e.dataTransfer.getData('text/x-fspath');
            if (src && src !== it.path) { try { FS.move(src, it.path); } catch (err) { UI.alert('无法移动', err.message, this.icon); } }
          });
        }
        content.append(itemEl);
      }
    };

    content.addEventListener('click', () => {
      if (st.selection.size) { st.selection.clear(); st.anchor = null; updateSel(); }
    });
    content.addEventListener('contextmenu', e => {
      if (e.target.closest('.fb-item')) return;
      e.preventDefault();
      UI.contextMenu([
        { label: '新建文件夹', action: () => st.newFolder() },
        { sep: true },
        { label: '按图标显示', checked: st.view === 'icon', action: () => st.setView('icon') },
        { label: '按列表显示', checked: st.view === 'list', action: () => st.setView('list') },
        { sep: true },
        { label: '粘贴', disabled: !st.clipboard, action: () => st.paste() },
        { label: '显示简介', action: () => {
          const n = FS.node(st.path);
          UI.dialog({ icon: 'assets/icons/folder.svg', title: FS.baseName(st.path) + ' 简介', buttons: ['好'], msg: `种类：文件夹\n项目数：${Object.keys(n.c).length}\n位置：${st.path.replace(FS.HOME, '~')}` });
        } },
      ], e);
    });
    content.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey)) { st.trashSelection(); e.preventDefault(); }
      else if (e.key === 'Enter' && st.selection.size === 1) { st.startRename([...st.selection][0]); e.preventDefault(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') { st.copySel('copy'); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') { st.paste(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); st.selection = new Set(FS.list(st.path).map(i => i.path)); updateSel(); }
      else if (e.key === 'Delete' && st.selection.size) { st.trashSelection(); }
    });

    backBtn.addEventListener('click', () => { if (st.hi >= 0) { const p = st.history[st.hi--]; st.navigate(p, false); } });
    fwdBtn.addEventListener('click', () => { if (st.hi < st.history.length - 1) { const p = st.history[++st.hi]; st.navigate(p, false); } });

    const render = () => {
      WM.setTitle(win, st.path === FS.TRASH ? '废纸篓' : FS.baseName(st.path) || '访达');
      renderSide(); renderCrumb(); renderList();
      backBtn.disabled = st.hi <= 0;
      fwdBtn.disabled = st.hi >= st.history.length - 1;
      viewSeg.children[0].classList.toggle('on', st.view === 'icon');
      viewSeg.children[1].classList.toggle('on', st.view === 'list');
      sortSel.value = st.sortBy;
    };
    win._fsUnsub = Bus.on('fs:changed', () => { if (document.body.contains(win.el)) render(); });
    win.onClose = () => { win._fsUnsub && win._fsUnsub(); };
    render();
    if (args.path) st.navigate(args.path);
  },
  itemMenu(st, it) {
    const inTrash = st.path === FS.TRASH || st.path.startsWith(FS.TRASH + '/');
    if (inTrash) return [
      { label: '放回原处', action: () => { try { FS.restore(it.name); } catch (e) { UI.alert('无法还原', e.message, 'assets/icons/finder.png'); } } },
      { label: '立即删除…', action: async () => { if (await UI.confirm('确定要永久删除吗？', `“${it.name}”将被永久删除，此操作无法撤销。`, { ok: '删除', danger: true })) FS.remove(it.path); } },
      { sep: true },
      { label: '清空废纸篓…', action: async () => { if (await UI.confirm('确定要清空废纸篓吗？', '此操作无法撤销。', { ok: '清空', danger: true })) FS.emptyTrash(); } },
    ];
    return [
      { label: '打开', action: () => it.node.t === 'd' ? st.navigate(it.path) : Apps.openPath(it.path) },
      { sep: true },
      { label: '显示简介', action: () => { st.selection = new Set([it.path]); st.showInfo(); } },
      { label: '重命名', action: () => st.startRename(it.path) },
      { label: '复制“' + it.name + '”', action: () => { try { FS.copy(it.path, st.path); } catch (e) { UI.alert('无法复制', e.message, 'assets/icons/finder.png'); } } },
      { sep: true },
      { label: '移到废纸篓', action: () => { st.selection = new Set([it.path]); st.trashSelection(); } },
    ];
  },
  clipboard: null,
};
Apps.register(FinderApp);
window.Apps = Apps; window.stdMenus = stdMenus;

/* ==================== 终端 ==================== */
Apps.register({
  id: 'terminal', name: '终端', icon: 'assets/icons/terminal.png',
  w: 640, h: 420, minW: 420, minH: 260, singleton: false,
  menus(win) {
    const st = win?.appState;
    return stdMenus(this, {
      file: [{ label: '新建窗口', key: '⌘N', action: () => Apps.open('terminal') }],
      edit: [{ label: '清屏', key: '⌘K', action: () => st?.clear() }],
    });
  },
  render(win) {
    const st = win.appState = { cwd: FS.HOME, hist: [], hi: -1 };
    win.body.classList.add('term-body');
    const out = el('div', { class: 'term-out' });
    const inputRow = el('div', { class: 'term-input-row' });
    const promptEl = el('span', { class: 'term-prompt' });
    const input = el('input', { class: 'term-input', spellcheck: 'false', autocomplete: 'off', 'aria-label': '终端输入' });
    inputRow.append(promptEl, input);
    win.body.append(out, inputRow);
    const short = p => p.replace(FS.HOME, '~') || '/';
    const setPrompt = () => { promptEl.textContent = `${Sys.settings.currentUser || 'guest'}@MacBook-Pro ${short(st.cwd)} % `; };
    const print = (text, cls = '') => { out.append(el('div', { class: 'term-line ' + cls, text })); out.scrollTop = out.scrollHeight; };
    const printHtml = html => { out.append(el('div', { class: 'term-line', html })); out.scrollTop = out.scrollHeight; };
    st.clear = () => { out.innerHTML = ''; };
    const resolve = p => {
      if (!p) return st.cwd;
      if (p.startsWith('~')) p = FS.HOME + p.slice(1);
      return FS.normalize(p.startsWith('/') ? p : st.cwd + '/' + p);
    };
    /* tokenizer：支持单引号（原样）、双引号（内可用 \" \\ 转义）、反斜杠转义（引号外转任意字符） */
    const tokenize = s => {
      const out = []; let cur = ''; let q = null; let esc = false; let started = false;
      for (const ch of s) {
        if (esc) { cur += ch; esc = false; started = true; continue; }
        if (q === "'") { if (ch === "'") { q = null; } else cur += ch; continue; }
        if (q === '"') {
          if (ch === '"') q = null;
          else if (ch === '\\') esc = true;
          else cur += ch;
          continue;
        }
        if (ch === '\\') { esc = true; started = true; continue; }
        if (ch === "'" || ch === '"') { q = ch; started = true; continue; }
        if (/\s/.test(ch)) { if (started) { out.push(cur); cur = ''; started = false; } continue; }
        cur += ch; started = true;
      }
      if (esc) cur += '\\';
      if (q) throw new Error('未闭合的引号');
      if (started) out.push(cur);
      return out;
    };
    const run = cmdline => {
      print(promptEl.textContent + cmdline, 'term-echo');
      let args;
      try { args = tokenize(cmdline.trim()); }
      catch (te) { print('zsh: ' + te.message, 'term-err'); return; }
      if (!args.length) return;
      const [cmd, ...rest] = args;
      const err = m => print(m, 'term-err');
      const flagsOf = () => rest.filter(a => a.startsWith('-')).join('');
      const operands = () => rest.filter(a => !a.startsWith('-'));
      try {
        switch (cmd) {
          case 'help': print(['可用命令：', '  help  pwd  ls [路径]  cd <路径>  cat <文件>', '  touch <文件>  mkdir <目录>  rm [-r] <路径>  mv <源> <目标>  cp [-r] <源> <目标>', '  open <路径|应用>  echo <文本>  clear  date  whoami  uname', '路径支持 ~ 、相对路径与引号（如 cd "~/Sample Folder"），与访达共享同一文件系统。'].join('\n')); break;
          case 'pwd': print(st.cwd); break;
          case 'whoami': print(Sys.settings.currentUser || 'guest'); break;
          case 'uname': print('Darwin MacBook-Pro.local 24.5.0 Darwin Kernel Version 24.5.0 (Web) arm64'); break;
          case 'date': print(new Date().toLocaleString('zh-CN', { hour12: false })); break;
          case 'clear': st.clear(); break;
          case 'echo': print(rest.join(' ')); break;
          case 'ls': {
            const p = resolve(operands()[0]);
            const items = FS.list(p, { showHidden: rest.includes('-a') });
            if (rest.includes('-l')) items.forEach(it => print(`${it.node.t === 'd' ? 'd' : '-'}rw-r--r--  ${it.node.t === 'f' ? String((it.node.data || '').length).padStart(6) : '     -'}  ${it.name}`));
            else print(items.map(it => it.name + (it.node.t === 'd' ? '/' : '')).join('  ') || '');
            break;
          }
          case 'cd': {
            const p = resolve(operands()[0] || FS.HOME);
            if (!FS.isDir(p)) return err(`cd: 不是目录: ${operands()[0] || ''}`);
            st.cwd = p; setPrompt(); break;
          }
          case 'cat': { if (!operands()[0]) return err('cat: 缺少文件'); print(FS.read(resolve(operands()[0]))); break; }
          case 'touch': {
            if (!operands()[0]) return err('touch: 缺少文件');
            const p = resolve(operands()[0]);
            if (FS.exists(p)) { const n = FS.node(p); n.mtime = Date.now(); FS.save(); } // 已存在：仅更新 mtime
            else FS.write(p, '');
            break;
          }
          case 'mkdir': { if (!operands()[0]) return err('mkdir: 缺少目录'); FS.mkdir(resolve(operands()[0])); break; }
          case 'rm': {
            const ops = operands();
            if (!ops.length) return err('rm: 缺少路径');
            const recursive = flagsOf().includes('r') || flagsOf().includes('R');
            const force = flagsOf().includes('f');
            for (const t of ops) {
              const rp = resolve(t);
              try {
                if (!FS.exists(rp)) { if (!force) err(`rm: ${t}: 没有那个文件或目录`); continue; }
                if (FS.isDir(rp) && !recursive) { err(`rm: ${t}: 是一个目录（递归删除请用 rm -r）`); continue; }
                FS.remove(rp);
              } catch (e2) { err(`rm: ${t}: ${e2.message}`); }
            }
            break;
          }
          case 'mv': {
            const ops = operands();
            if (ops.length < 2) return err('mv: 用法 mv <源> <目标>');
            const s = resolve(ops[0]), d = resolve(ops[1]);
            try {
              if (!FS.exists(s)) return err(`mv: ${ops[0]}: 没有那个文件或目录`);
              if (FS.isDir(d)) FS.move(s, d);                                  // 目标是目录：保留原名移入
              else {
                if (FS.exists(d)) return err(`mv: ${ops[1]}: 目标已存在`);
                const dir = FS.dirName(d);
                if (!FS.isDir(dir)) return err(`mv: ${ops[1]}: 目标目录不存在`);
                const np = FS.move(s, dir);                                    // 目标是文件路径：移动并改名（只执行一次）
                FS.rename(np, FS.baseName(d));
              }
            } catch (e2) { err(`mv: ${e2.message}`); }
            break;
          }
          case 'cp': {
            const ops = operands();
            if (ops.length < 2) return err('cp: 用法 cp [-r] <源> <目标>');
            const s = resolve(ops[0]), d = resolve(ops[1]);
            try {
              if (!FS.exists(s)) return err(`cp: ${ops[0]}: 没有那个文件或目录`);
              if (FS.isDir(s) && !(flagsOf().includes('r') || flagsOf().includes('R'))) return err(`cp: ${ops[0]} 是一个目录（复制目录请用 cp -r）`);
              if (FS.isDir(d)) FS.copy(s, d);                                  // 目标是目录：保留原名
              else {
                if (FS.exists(d)) return err(`cp: ${ops[1]}: 目标已存在`);
                const dir = FS.dirName(d);
                if (!FS.isDir(dir)) return err(`cp: ${ops[1]}: 目标目录不存在`);
                const np = FS.copy(s, dir);                                    // 目标是文件路径：复制并改名
                FS.rename(np, FS.baseName(d));
              }
            } catch (e2) { err(`cp: ${e2.message}`); }
            break;
          }
          case 'open': {
            if (!operands()[0]) return err('open: 缺少路径');
            const p = resolve(operands()[0]);
            if (FS.exists(p)) Apps.openPath(p);
            else if (Apps.get(operands()[0])) Apps.open(operands()[0]);
            else err(`open: 找不到: ${operands()[0]}`);
            break;
          }
          default: err(`zsh: command not found: ${cmd}`);
        }
      } catch (e2) { err(`${cmd}: ${e2.message}`); }
    };
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const v = input.value; input.value = '';
        if (v.trim()) { st.hist.push(v); st.hi = st.hist.length; }
        run(v);
      } else if (e.key === 'ArrowUp') { e.preventDefault(); if (st.hi > 0) { st.hi--; input.value = st.hist[st.hi] || ''; } }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (st.hi < st.hist.length - 1) { st.hi++; input.value = st.hist[st.hi]; } else { st.hi = st.hist.length; input.value = ''; } }
      else if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); st.clear(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'c') { print(promptEl.textContent + input.value + ' ^C', 'term-echo'); input.value = ''; }
    });
    win.body.addEventListener('click', () => input.focus());
    print('Last login: ' + new Date().toLocaleString('zh-CN') + ' on ttys000', 'term-dim');
    setPrompt();
    setTimeout(() => input.focus(), 60);
  }
});

/* ==================== 文本编辑 ==================== */
Apps.register({
  id: 'textedit', name: '文本编辑', icon: 'assets/icons/textedit.svg',
  w: 680, h: 520, minW: 380, minH: 260, singleton: false,
  menus(win) {
    const st = win?.appState;
    return stdMenus(this, {
      file: [
        { label: '新建', key: '⌘N', action: () => Apps.open('textedit') },
        { label: '打开…', key: '⌘O', action: () => st?.openPicker() },
        { sep: true },
        { label: '保存', key: '⌘S', action: () => st?.save() },
        { label: '另存为…', key: '⇧⌘S', action: () => st?.saveAs() },
      ],
      format: [
        { label: '放大字体', key: '⌘+', action: () => st?.setFont(1) },
        { label: '缩小字体', key: '⌘−', action: () => st?.setFont(-1) },
        { label: '恢复默认字号', key: '⌘0', action: () => st?.setFont(0) },
      ]
    });
  },
  render(win, args) {
    const st = win.appState = { path: args.path || null, dirty: false, fontSize: 14 };
    win.body.classList.add('te-body');
    const ta = el('textarea', { class: 'te-area', placeholder: '开始输入…', 'aria-label': '文本内容' });
    win.body.append(ta);
    const name = () => st.path ? FS.baseName(st.path) : '未命名';
    const refreshTitle = () => WM.setTitle(win, name(), st.dirty);
    if (st.path) {
      try { ta.value = FS.read(st.path); } catch (e) { UI.alert('无法打开', e.message, this.icon); st.path = null; }
    }
    refreshTitle();
    ta.addEventListener('input', () => { if (!st.dirty) { st.dirty = true; refreshTitle(); } });
    st.setFont = d => { st.fontSize = d === 0 ? 14 : clamp(st.fontSize + d, 10, 28); ta.style.fontSize = st.fontSize + 'px'; };
    st.save = () => {
      if (!st.path) return st.saveAs();
      try { FS.write(st.path, ta.value); st.dirty = false; refreshTitle(); }
      catch (e) { UI.alert('保存失败', e.message, this.icon); }
    };
    st.saveAs = async () => {
      const v = await UI.prompt('另存为', '输入保存路径（相对于文稿文件夹）：', (st.path ? FS.baseName(st.path) : '未命名.txt'));
      if (!v) return false;
      const p = v.startsWith('/') ? FS.normalize(v) : FS.join(FS.HOME + '/Documents', v);
      try { FS.write(p, ta.value); st.path = p; st.dirty = false; refreshTitle(); return true; }
      catch (e) { await UI.alert('保存失败', e.message, this.icon); return false; }
    };
    st.openPicker = async () => {
      const files = [];
      FS.walk(FS.HOME, (p, n) => { if (n.t === 'f' && !p.startsWith(FS.TRASH)) files.push(p); });
      if (!files.length) return UI.alert('没有可打开的文件', '', this.icon);
      const v = await UI.prompt('打开文件', '输入文件路径：\n' + files.slice(0, 8).map(f => f.replace(FS.HOME, '~')).join('\n'), files[0]);
      if (!v) return;
      const p = v.startsWith('~') ? v.replace('~', FS.HOME) : v;
      if (FS.node(p)?.t === 'f') { st.path = FS.normalize(p); ta.value = FS.read(st.path); st.dirty = false; refreshTitle(); }
      else UI.alert('无法打开', '文件不存在或不是文本文件。', this.icon);
    };
    win.el.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.shiftKey ? st.saveAs() : st.save(); }
    });
    win.confirmClose = (done, cancel) => {
      if (!st.dirty) return done();
      UI.dialog({ icon: this.icon, title: '要存储更改吗？', msg: `“${name()}”有未存储的更改。`, buttons: ['不存储', '取消', '存储'] }).then(r => {
        if (r.index === 0) done();
        else if (r.index === 2) {
          if (st.path) {
            try { FS.write(st.path, ta.value); st.dirty = false; done(); }
            catch (e) { UI.alert('保存失败', e.message).then(cancel); }
          } else {
            st.saveAs().then(saved => { (saved === false || st.dirty) ? cancel() : done(); });
          }
        }
        else cancel(); // 取消 / Esc：中止关闭
      });
    };
    setTimeout(() => ta.focus(), 60);
  }
});

/* ==================== 备忘录 ==================== */
Apps.register({
  id: 'notes', name: '备忘录', icon: 'assets/icons/notes.png',
  w: 780, h: 520, minW: 520, minH: 320,
  menus(win) {
    const st = win?.appState;
    return stdMenus(this, {
      file: [
        { label: '新建备忘录', key: '⌘N', action: () => st?.add() },
        { label: '删除备忘录', key: '⌘⌫', disabled: !st?.cur, action: () => st?.remove() },
      ]
    });
  },
  store: {
    get() { return Store.get('notes', null) || [{ id: uid(), body: '欢迎使用备忘录\n\n· 点击左上角 ＋ 新建备忘录\n· 标题自动取自第一行\n· 内容会自动保存\n\n试试在搜索框中查找内容。', updated: Date.now() }]; },
    set(v) { Store.set('notes', v); }
  },
  render(win) {
    const st = win.appState = { notes: this.store.get(), cur: null, q: '' };
    win.body.classList.add('notes-body');
    const search = el('input', { class: 'text-input notes-search', type: 'search', placeholder: '搜索所有备忘录' });
    const addBtn = el('button', { class: 'fb-btn', title: '新建备忘录', html: '＋' });
    const delBtn = el('button', { class: 'fb-btn', title: '删除备忘录', html: '🗑' });
    const listEl = el('div', { class: 'notes-list' });
    const side = el('div', { class: 'notes-side' }, el('div', { class: 'notes-side-bar' }, search, addBtn, delBtn), listEl);
    const dateEl = el('div', { class: 'notes-date' });
    const editor = el('textarea', { class: 'notes-editor', placeholder: '开始记录…', 'aria-label': '备忘录内容' });
    const main = el('div', { class: 'notes-main' }, dateEl, editor);
    win.body.append(side, main);
    const titleOf = n => (n.body.split('\n')[0] || '新备忘录').trim().slice(0, 40) || '新备忘录';
    const save = () => { this.store.set(st.notes); };
    const renderList = () => {
      listEl.innerHTML = '';
      const items = st.notes.filter(n => !st.q || n.body.toLowerCase().includes(st.q.toLowerCase()))
        .sort((a, b) => b.updated - a.updated);
      if (!items.length) listEl.append(el('div', { class: 'empty-state', style: { height: '120px' }, text: st.q ? '无结果' : '没有备忘录' }));
      for (const n of items) {
        const row = el('div', { class: 'note-row' + (n === st.cur ? ' sel' : '') },
          el('div', { class: 'note-title', text: titleOf(n) }),
          el('div', { class: 'note-sub', text: `${relTime(n.updated)}  ${(n.body.split('\n')[1] || '').trim().slice(0, 26)}` }));
        row.addEventListener('click', () => { st.cur = n; sync(); });
        listEl.append(row);
      }
    };
    const sync = () => {
      renderList();
      if (!st.cur) { dateEl.textContent = ''; editor.value = ''; editor.disabled = true; return; }
      editor.disabled = false;
      dateEl.textContent = new Date(st.cur.updated).toLocaleString('zh-CN');
      if (editor.value !== st.cur.body) editor.value = st.cur.body;
    };
    st.add = () => { const n = { id: uid(), body: '', updated: Date.now() }; st.notes.push(n); st.cur = n; save(); sync(); editor.focus(); };
    st.remove = async () => {
      if (!st.cur) return;
      if (!await UI.confirm('删除备忘录？', `“${titleOf(st.cur)}”将被删除。`, { ok: '删除', danger: true })) return;
      st.notes = st.notes.filter(n => n !== st.cur); st.cur = st.notes[0] || null; save(); sync();
    };
    editor.addEventListener('input', debounce(() => { if (st.cur) { st.cur.body = editor.value; st.cur.updated = Date.now(); save(); renderList(); } }, 350));
    search.addEventListener('input', debounce(() => { st.q = search.value.trim(); renderList(); }, 200));
    addBtn.addEventListener('click', () => st.add());
    delBtn.addEventListener('click', () => st.remove());
    st.cur = st.notes[0] || null;
    sync();
  }
});

/* ==================== 计算器 ==================== */
Apps.register({
  id: 'calculator', name: '计算器', icon: 'assets/icons/calculator.png',
  w: 260, h: 400, minW: 240, minH: 380, noResize: false,
  menus() { return stdMenus(this); },
  render(win) {
    const st = win.appState = { disp: '0', acc: null, op: null, fresh: true, err: false };
    win.body.classList.add('calc-body');
    const disp = el('div', { class: 'calc-disp', text: '0', role: 'status' });
    const grid = el('div', { class: 'calc-grid' });
    win.body.append(disp, grid);
    const show = v => { st.disp = v; disp.textContent = v; disp.style.fontSize = (v.length > 9 ? '30px' : v.length > 6 ? '42px' : '54px'); };
    const calc = (a, b, op) => { switch (op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return b === 0 ? NaN : a / b; } };
    const fmt = n => { if (!isFinite(n)) return '错误'; const r = Math.round(n * 1e10) / 1e10; return String(r).slice(0, 12); };
    const inputDigit = d => {
      if (st.err) { st.acc = null; st.op = null; st.err = false; }
      if (st.fresh) { show(d === '.' ? '0.' : d); st.fresh = false; }
      else if (st.disp.replace(/[-.]/g, '').length < 12) {
        if (d === '.' && st.disp.includes('.')) return;
        show(st.disp === '0' && d !== '.' ? d : st.disp + d);
      }
    };
    const setOp = op => {
      if (st.err) return;
      if (st.op && !st.fresh) equals();
      st.acc = parseFloat(st.disp); st.op = op; st.fresh = true;
    };
    const equals = () => {
      if (st.op == null || st.acc == null) return;
      const r = calc(st.acc, parseFloat(st.disp), st.op);
      show(fmt(r));
      st.acc = null; st.op = null; st.fresh = true;
      if (!isFinite(r)) st.err = true;
    };
    const clearAll = () => { st.acc = null; st.op = null; st.err = false; st.fresh = true; show('0'); };
    const negate = () => { if (!st.err && st.disp !== '0') show(st.disp.startsWith('-') ? st.disp.slice(1) : '-' + st.disp); };
    const percent = () => { if (!st.err) { show(fmt(parseFloat(st.disp) / 100)); st.fresh = true; } };
    const keys = [
      ['AC', 'fn', clearAll], ['±', 'fn', negate], ['%', 'fn', percent], ['÷', 'op', () => setOp('/')],
      ['7', '', () => inputDigit('7')], ['8', '', () => inputDigit('8')], ['9', '', () => inputDigit('9')], ['×', 'op', () => setOp('*')],
      ['4', '', () => inputDigit('4')], ['5', '', () => inputDigit('5')], ['6', '', () => inputDigit('6')], ['−', 'op', () => setOp('-')],
      ['1', '', () => inputDigit('1')], ['2', '', () => inputDigit('2')], ['3', '', () => inputDigit('3')], ['+', 'op', () => setOp('+')],
      ['0', 'zero', () => inputDigit('0')], ['.', '', () => inputDigit('.')], ['=', 'op', equals],
    ];
    const btns = [];
    for (const [label, cls, fn] of keys) {
      const b = el('button', { class: 'calc-key ' + cls, text: label });
      b.addEventListener('click', () => { fn(); grid.querySelectorAll('.calc-key').forEach(x => x.classList.remove('press')); });
      btns.push(b); grid.append(b);
    }
    win.el.addEventListener('keydown', e => {
      if (e.target.matches('input,textarea')) return;
      const k = e.key;
      if (/^[0-9.]$/.test(k)) inputDigit(k);
      else if (k === '+') setOp('+'); else if (k === '-') setOp('-');
      else if (k === '*') setOp('*'); else if (k === '/') { e.preventDefault(); setOp('/'); }
      else if (k === 'Enter' || k === '=') { e.preventDefault(); equals(); }
      else if (k === 'Escape' || k.toLowerCase() === 'c') clearAll();
      else if (k === 'Backspace') { if (!st.fresh && !st.err) show(st.disp.length > 1 ? st.disp.slice(0, -1) : '0'); }
      else if (k === '%') percent();
      else return;
      e.stopPropagation();
    });
    win.body.tabIndex = 0;
  }
});

/* ==================== 日历 ==================== */
Apps.register({
  id: 'calendar', name: '日历', icon: 'assets/icons/calendar.png',
  w: 760, h: 560, minW: 480, minH: 400,
  menus(win) {
    const st = win?.appState;
    return stdMenus(this, {
      file: [{ label: '新建事件', key: '⌘N', action: () => st?.addEvent() }],
      view: [{ label: '前往今天', key: '⌘T', action: () => st?.goToday() }],
    });
  },
  render(win) {
    const now = new Date();
    const st = win.appState = {
      year: now.getFullYear(), month: now.getMonth(),
      sel: localDateKey(now),
      events: Store.get('calendar', {}),
    };
    win.body.classList.add('cal-body');
    const titleEl = el('div', { class: 'cal-title' });
    const prev = el('button', { class: 'fb-btn', html: '‹', title: '上个月' });
    const next = el('button', { class: 'fb-btn', html: '›', title: '下个月' });
    const todayBtn = el('button', { class: 'btn', text: '今天' });
    const head = el('div', { class: 'cal-head' }, titleEl, el('div', { class: 'cal-head-btns' }, todayBtn, prev, next));
    const weekRow = el('div', { class: 'cal-week' });
    (Sys.settings.firstDayMonday ? ['一', '二', '三', '四', '五', '六', '日'] : ['日', '一', '二', '三', '四', '五', '六'])
      .forEach(d => weekRow.append(el('span', { text: '周' + d })));
    const gridEl = el('div', { class: 'cal-grid' });
    const detail = el('div', { class: 'cal-detail' });
    win.body.append(head, weekRow, gridEl, detail);
    const save = () => Store.set('calendar', st.events);
    const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    st.goToday = () => { const t = new Date(); st.year = t.getFullYear(); st.month = t.getMonth(); st.sel = localDateKey(t); render(); };
    const render = () => {
      titleEl.textContent = `${st.year}年${st.month + 1}月`;
      gridEl.innerHTML = '';
      const first = new Date(st.year, st.month, 1);
      let startCol = first.getDay();
      if (Sys.settings.firstDayMonday) startCol = (startCol + 6) % 7;
      const days = new Date(st.year, st.month + 1, 0).getDate();
      const prevDays = new Date(st.year, st.month, 0).getDate();
      const todayStr = localDateKey();
      for (let i = 0; i < 42; i++) {
        const dayNum = i - startCol + 1;
        let cellDate, other = false, y = st.year, m = st.month, d = dayNum;
        if (dayNum < 1) { other = true; d = prevDays + dayNum; m = st.month - 1; if (m < 0) { m = 11; y--; } }
        else if (dayNum > days) { other = true; d = dayNum - days; m = st.month + 1; if (m > 11) { m = 0; y++; } }
        const k = key(y, m, d);
        const cell = el('div', {
          class: 'cal-cell' + (other ? ' other' : '') + (k === todayStr ? ' today' : '') + (k === st.sel ? ' sel' : ''),
        }, el('span', { class: 'cal-num', text: String(d) }));
        const evs = st.events[k] || [];
        if (evs.length) {
          const dots = el('div', { class: 'cal-dots' });
          evs.slice(0, 3).forEach(() => dots.append(el('span', { class: 'cal-dot' })));
          cell.append(dots);
        }
        cell.addEventListener('click', () => { st.sel = k; if (other) { st.year = y; st.month = m; } render(); });
        gridEl.append(cell);
      }
      renderDetail();
    };
    const renderDetail = () => {
      detail.innerHTML = '';
      const [y, m, d] = st.sel.split('-').map(Number);
      detail.append(el('div', { class: 'cal-detail-title', text: `${m}月${d}日 ${WEEK_CN[new Date(y, m - 1, d).getDay()]}` }));
      const evs = (st.events[st.sel] || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const list = el('div', { class: 'cal-events' });
      if (!evs.length) list.append(el('div', { class: 'cal-no-events', text: '没有事件' }));
      for (const ev of evs) {
        const row = el('div', { class: 'cal-event' },
          el('span', { class: 'cal-event-dot' }),
          el('span', { class: 'cal-event-time', text: ev.time || '全天' }),
          el('span', { class: 'cal-event-title', text: ev.title }),
          el('button', { class: 'cal-event-del', text: '✕', title: '删除事件', onclick: () => {
            st.events[st.sel] = st.events[st.sel].filter(x => x.id !== ev.id);
            if (!st.events[st.sel].length) delete st.events[st.sel];
            save(); render();
          } }));
        list.append(row);
      }
      const timeIn = el('input', { class: 'text-input', type: 'time', style: { width: '96px' } });
      const titleIn = el('input', { class: 'text-input', type: 'text', placeholder: '事件标题', style: { flex: '1' } });
      const addBtn = el('button', { class: 'btn primary', text: '添加事件' });
      const doAdd = () => {
        const t = titleIn.value.trim(); if (!t) { titleIn.focus(); return; }
        (st.events[st.sel] ||= []).push({ id: uid(), title: t, time: timeIn.value || '' });
        save(); titleIn.value = ''; render();
        Notify.send({ appId: 'calendar', title: '日历', body: `已添加事件：${t}`, silent: true });
      };
      addBtn.addEventListener('click', doAdd);
      titleIn.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
      detail.append(list, el('div', { class: 'cal-add' }, timeIn, titleIn, addBtn));
    };
    st.addEvent = () => { renderDetail(); detail.querySelector('input[type=text]')?.focus(); };
    prev.addEventListener('click', () => { st.month--; if (st.month < 0) { st.month = 11; st.year--; } render(); });
    next.addEventListener('click', () => { st.month++; if (st.month > 11) { st.month = 0; st.year++; } render(); });
    todayBtn.addEventListener('click', () => st.goToday());
    render();
  }
});
