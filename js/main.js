/* ============ 启动与桌面 ============ */
'use strict';

/* 桌面图标管理 */
Sys.renderDesktopIcons = function () {
  const layer = $('#desktop-icons');
  layer.innerHTML = '';
  const positions = Store.get('desktop-icons', {});
  const items = FS.list(FS.HOME + '/Desktop');
  // 默认布局：右侧自上而下
  const colX = innerWidth - 110;
  let autoY = 16;
  const used = new Set(Object.values(positions).map(p => p.x + ',' + p.y));
  for (const it of items) {
    let pos = positions[it.path];
    if (!pos) {
      while (used.has(colX + ',' + autoY)) autoY += 92;
      pos = { x: colX, y: autoY };
      used.add(pos.x + ',' + pos.y);
      autoY += 92;
    }
    const ic = el('div', { class: 'desk-icon', dataset: { path: it.path }, style: { left: pos.x + 'px', top: pos.y + 'px' }, tabindex: '0' },
      iconImg(FS.iconFor(it.path), '', it.name),
      el('div', { class: 'di-name', text: it.name }));
    ic.style.left = clamp(pos.x, 0, innerWidth - 92) + 'px';
    ic.style.top = clamp(pos.y, 4, innerHeight - 130) + 'px';
    layer.append(ic);
  }
};

(function initDesktop() {
  const layer = $('#desktop-icons');
  let sel = null;
  const select = ic => {
    $$('.desk-icon', layer).forEach(n => n.classList.remove('selected'));
    sel = ic;
    if (ic) ic.classList.add('selected');
  };
  // 单选 / 双击打开
  layer.addEventListener('pointerdown', e => {
    const ic = e.target.closest('.desk-icon');
    if (!ic) { select(null); return; }
    select(ic);
    // 拖动
    const startX = e.clientX, startY = e.clientY;
    const ox = parseFloat(ic.style.left), oy = parseFloat(ic.style.top);
    let moved = false;
    const move = ev => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      ic.style.left = clamp(ox + dx, 0, innerWidth - 92) + 'px';
      ic.style.top = clamp(oy + dy, 4, innerHeight - 110) + 'px';
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (moved) {
        const positions = Store.get('desktop-icons', {});
        positions[ic.dataset.path] = { x: parseFloat(ic.style.left), y: parseFloat(ic.style.top) };
        Store.set('desktop-icons', positions);
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
  layer.addEventListener('dblclick', e => {
    const ic = e.target.closest('.desk-icon');
    if (ic) Apps.openPath(ic.dataset.path);
  });
  layer.addEventListener('keydown', e => {
    if (e.key === 'Enter' && sel) { e.preventDefault(); startRename(sel); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { trashItem(sel.dataset.path); }
  });
  const trashItem = path => {
    try { FS.trash(path); const p = Store.get('desktop-icons', {}); delete p[path]; Store.set('desktop-icons', p); }
    catch (e2) { UI.alert('无法移到废纸篓', e2.message, 'assets/icons/finder.png'); }
  };
  const startRename = ic => {
    const nameEl = ic.querySelector('.di-name');
    const old = FS.baseName(ic.dataset.path);
    const input = el('input', { class: 'text-input di-rename-input', value: old });
    ic.classList.add('renaming');
    nameEl.replaceWith(input);
    input.focus();
    const dot = old.lastIndexOf('.'); input.setSelectionRange(0, dot > 0 ? dot : old.length);
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const v = input.value.trim();
      if (v && v !== old) {
        try {
          const np = FS.rename(ic.dataset.path, v);
          const p = Store.get('desktop-icons', {});
          if (p[ic.dataset.path]) { p[np] = p[ic.dataset.path]; delete p[ic.dataset.path]; Store.set('desktop-icons', p); }
        } catch (e2) { UI.alert('无法重命名', e2.message, 'assets/icons/finder.png'); }
      }
      Sys.renderDesktopIcons();
    };
    input.addEventListener('keydown', e2 => { e2.stopPropagation(); if (e2.key === 'Enter') commit(); if (e2.key === 'Escape') { done = true; Sys.renderDesktopIcons(); } });
    input.addEventListener('blur', commit);
    input.addEventListener('pointerdown', e2 => e2.stopPropagation());
  };
  // 图标右键
  layer.addEventListener('contextmenu', e => {
    const ic = e.target.closest('.desk-icon');
    if (ic) {
      e.preventDefault(); e.stopPropagation();
      select(ic);
      const p = ic.dataset.path;
      UI.contextMenu([
        { label: '打开', action: () => Apps.openPath(p) },
        { sep: true },
        { label: '显示简介', action: () => {
          const n = FS.node(p);
          UI.dialog({ icon: FS.iconFor(p), title: FS.baseName(p) + ' 简介', buttons: ['好'], msg: `种类：${FS.kindOf(p)}\n位置：桌面\n修改时间：${new Date(n.mtime || 0).toLocaleString('zh-CN')}` });
        } },
        { label: '重命名', action: () => startRename(ic) },
        { label: '移到废纸篓', action: () => trashItem(p) },
      ], e);
      return;
    }
    // 桌面空白右键
    if (e.target === layer || e.target.id === 'desktop') {
      e.preventDefault();
      UI.contextMenu([
        { label: '新建文件夹', action: async () => {
          const name = await UI.prompt('新建文件夹', '文件夹名称：', '未命名文件夹');
          if (!name) return;
          try { FS.mkdir(FS.join(FS.HOME + '/Desktop', name)); } catch (e2) { UI.alert('无法创建', e2.message, 'assets/icons/finder.png'); }
        } },
        { sep: true },
        { label: '整理', action: () => { Store.set('desktop-icons', {}); Sys.renderDesktopIcons(); } },
        { label: '排序方式', submenu: [
          { label: '名称', action: () => sortDesktop('name') },
          { label: '种类', action: () => sortDesktop('kind') },
        ] },
        { sep: true },
        { label: '更改桌面背景…', action: () => Apps.open('settings', { pane: 'wallpaper' }) },
        { label: '显示简介', action: () => UI.dialog({ icon: 'assets/icons/settings.png', title: '桌面 简介', msg: `${FS.list(FS.HOME + '/Desktop').length} 个项目\n分辨率：${innerWidth} × ${innerHeight}`, buttons: ['好'] }) },
      ], e);
    }
  });
  const sortDesktop = by => {
    const items = FS.list(FS.HOME + '/Desktop');
    items.sort((a, b) => by === 'kind' ? FS.kindOf(a.path).localeCompare(FS.kindOf(b.path), 'zh') : a.name.localeCompare(b.name, 'zh-Hans-CN'));
    const positions = {};
    let x = innerWidth - 110, y = 16;
    items.forEach((it, i) => {
      positions[it.path] = { x, y };
      y += 92;
      if (y > innerHeight - 130) { y = 16; x -= 100; }
    });
    Store.set('desktop-icons', positions);
    Sys.renderDesktopIcons();
  };
  Bus.on('fs:changed', d => {
    if (!Sys.unlocked) return;
    const paths = d.paths || [];
    const DT = FS.HOME + '/Desktop';
    // 仅 Desktop 本身或其直接子项变化才重绘；文稿/备忘录/邮件等内部变化不碰桌面
    const touchDesktop = paths.some(p => p === DT || FS.dirName(p) === DT);
    if (!touchDesktop) return;
    // 重命名桌面项目时同步图标位置键，避免位置丢失
    if (d.op === 'rename' && paths.length >= 2) {
      const icons = Store.get('desktop-icons', {});
      const [oldP, newP] = [paths[0], paths[1]];
      if (FS.dirName(oldP) === DT && icons[oldP]) {
        icons[newP] = icons[oldP]; delete icons[oldP];
        Store.set('desktop-icons', icons);
      }
    }
    Sys.renderDesktopIcons();
  });
})();

/* 前台应用切换 → 更新菜单栏 */
Bus.on('wm:focus', win => {
  Sys.setActiveApp(win ? win.appId : (WM.windows.length ? WM.windows[WM.windows.length - 1].appId : 'finder'));
});
Bus.on('wm:changed', () => {
  if (!WM.activeWin && !WM.windows.length && Sys.activeApp !== 'finder') Sys.setActiveApp('finder');
});

/* 全局 Escape：关闭浮层 */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('#spotlight').classList.contains('hidden')) { Spotlight.close(); return; }
    if (!$('#control-center').classList.contains('hidden')) { $('#control-center').classList.add('hidden'); return; }
    const nc = $('#notification-center');
    if (!nc.classList.contains('hidden') && !nc.classList.contains('nc-hidden')) { Notify.hideCenter(); return; }
    if ($$('.menu-pop').length) { UI.closeAllMenus(); return; }
  }
});

/* 点击通知中心外部时关闭 */
document.addEventListener('pointerdown', e => {
  const nc = $('#notification-center');
  if (nc.classList.contains('hidden') || nc.classList.contains('nc-hidden')) return;
  if (!nc.contains(e.target) && !e.target.closest('.mb-clock') && !e.target.closest('.banner')) Notify.hideCenter();
}, true);

/* ============ 启动序列 ============ */
(function boot() {
  try {
    FS.init();
    Sys.init();
    Notify.init();
    Sys.renderDock();
    Bus.emit('apps:ready');
    SettingsApp.definePanes(); // 供聚焦搜索与菜单使用
    Sys.boot();
    console.log('%c macOS 网页版 %c 启动完成 ', 'background:#0a84ff;color:#fff;border-radius:4px 0 0 4px;padding:2px 6px', 'background:#32d74b;color:#fff;border-radius:0 4px 4px 0;padding:2px 6px');
  } catch (e) {
    console.error('[boot] 启动失败:', e);
    document.body.innerHTML = '<div style="color:#fff;font-family:sans-serif;padding:40px">启动失败，请刷新重试。<br><small>' + esc(e.message) + '</small></div>';
  }
})();
