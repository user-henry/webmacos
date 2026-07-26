/* ============ 窗口管理器 + 通用浮层（菜单/对话框/右键） ============ */
'use strict';
const WM = {
  windows: [],
  activeWin: null,
  zTop: 100,
  cascade: 0,

  /* 可用区域（避开菜单栏与可见 Dock） */
  usableRect() {
    const s = Sys.settings;
    const r = { x: 0, y: 30, w: innerWidth, h: innerHeight - 30 };
    if (!s.dockAutohide && !Sys.fullscreenWin) {
      const dockH = s.dockSize + 26;
      if (s.dockPosition === 'bottom') r.h -= dockH;
      else if (s.dockPosition === 'left') { r.x += dockH; r.w -= dockH; }
      else r.w -= dockH;
    }
    return r;
  },

  openWindow(opts) {
    const u = this.usableRect();
    /* 有效最小尺寸 = min(应用配置, 视口可用空间)，保证小屏窗口不被拖出视口 */
    const effMinW = Math.max(120, Math.min(opts.minW || 200, u.w - 20));
    const effMinH = Math.max(80, Math.min(opts.minH || 120, u.h - 10));
    const w = clamp(opts.w || 640, effMinW, u.w - 20);
    const h = clamp(opts.h || 440, effMinH, u.h - 10);
    const off = (this.cascade++ % 8) * 26;
    const x = opts.x != null ? opts.x : clamp(u.x + (u.w - w) / 2 + off - 60, u.x, u.x + u.w - w);
    const y = opts.y != null ? opts.y : clamp(u.y + (u.h - h) / 2.4 + off - 40, u.y, u.y + u.h - h);
    const win = {
      id: uid(), appId: opts.app.id, app: opts.app,
      title: opts.title || opts.app.name, icon: opts.icon || opts.app.icon,
      rect: { x, y, w, h }, prevRect: null,
      minW: effMinW, minH: effMinH,
      state: 'normal', onClose: opts.onClose || null,
      data: opts.data || null, noResize: !!opts.noResize,
      el: null, body: null, titleEl: null, timers: []
    };
    const tl = (cls, svg, title) => el('div', { class: `tl ${cls}`, role: 'button', 'aria-label': title, title }, el('svg', { viewBox: '0 0 8 8', html: svg }));
    const lights = el('div', { class: 'traffic-lights' },
      tl('close', '<path d="M1.4 1.4 L6.6 6.6 M6.6 1.4 L1.4 6.6" stroke="#7a0d06" stroke-width="1.3" stroke-linecap="round"/>', '关闭'),
      tl('min', '<path d="M1.2 4 L6.8 4" stroke="#8a5a00" stroke-width="1.4" stroke-linecap="round"/>', '最小化'),
      tl('max', '<path d="M1.5 6.5 L1.5 1.5 L6.5 1.5 M6.5 1.5 L6.5 6.5 L1.5 6.5" fill="none" stroke="#0a5c17" stroke-width="1.2"/>', '全屏')
    );
    lights.children[0].addEventListener('click', e => { e.stopPropagation(); this.close(win); });
    lights.children[1].addEventListener('click', e => { e.stopPropagation(); this.minimize(win); });
    lights.children[2].addEventListener('click', e => { e.stopPropagation(); this.toggleFullscreen(win); });

    const titleEl = el('div', { class: 'win-title' }, iconImg(win.icon, '', ''), el('span', { class: 't', text: win.title }));
    const titlebar = el('div', { class: 'win-titlebar' }, lights, titleEl);
    const body = el('div', { class: 'win-body' });
    const winEl = el('div', { class: 'window opening', role: 'dialog', 'aria-label': win.title }, titlebar, body);
    if (!win.noResize) ['n','s','e','w','ne','nw','se','sw'].forEach(dir => {
      const hEl = el('div', { class: `rz ${dir}` });
      hEl.addEventListener('pointerdown', e => this.startResize(e, win, dir));
      winEl.append(hEl);
    });
    win.el = winEl; win.body = body; win.titleEl = titleEl;
    this.applyRect(win);
    $('#window-layer').append(winEl);
    this.windows.push(win);
    winEl.addEventListener('pointerdown', () => this.focus(win), true);
    setTimeout(() => winEl.classList.remove('opening'), 260);

    titlebar.addEventListener('pointerdown', e => {
      if (e.target.closest('.tl') || win.state === 'fullscreen') return;
      this.startDrag(e, win);
    });
    titlebar.addEventListener('dblclick', e => {
      if (e.target.closest('.tl')) return;
      this.toggleZoom(win);
    });
    this.focus(win);
    Bus.emit('wm:changed');
    return win;
  },

  applyRect(win) {
    const r = win.rect;
    Object.assign(win.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  },

  focus(win) {
    if (win.state === 'minimized') this.restore(win);
    if (this.activeWin === win) { win.el.style.zIndex = ++this.zTop; return; }
    if (this.activeWin) this.activeWin.el.classList.add('inactive');
    this.activeWin = win;
    win.el.classList.remove('inactive');
    win.el.style.zIndex = ++this.zTop;
    Bus.emit('wm:focus', win);
    Bus.emit('wm:changed');
  },

  /* 关闭窗口：Promise 化，防重入。
   * 返回 'closed' | 'cancelled' | 'alreadyClosed'。
   * confirmClose(done, cancel)：应用需在用户取消时调用 cancel()。 */
  close(win) {
    if (this.windows.indexOf(win) < 0) return Promise.resolve('alreadyClosed');
    if (win.closePromise) return win.closePromise; // 关闭动画/保存确认期间的重入直接复用
    let resolveP;
    win.closePromise = new Promise(r => { resolveP = r; });
    const finalize = result => {
      win.closePromise = null;
      resolveP(result);
    };
    const doClose = () => {
      if (win._closed) return finalize('closed');
      win._closed = true;
      win.timers.forEach(t => { clearInterval(t); clearTimeout(t); });
      win.timers.length = 0;
      try { win.onClose && win.onClose(); } catch (e) { console.error('[wm] onClose', e); }
      win.el.remove();
      const idx = this.windows.indexOf(win); // 重查，绝不允许 splice(-1, 1)
      if (idx >= 0) this.windows.splice(idx, 1);
      if (this.activeWin === win) {
        const rest = this.windows.filter(w => w.state !== 'minimized');
        this.activeWin = null;
        if (rest.length) this.focus(rest[rest.length - 1]);
        else Bus.emit('wm:focus', null);
      }
      if (win.state === 'fullscreen') this.exitFullscreenChrome();
      Bus.emit('wm:changed');
      finalize('closed');
    };
    const cancel = () => { win.el.classList.remove('closing'); finalize('cancelled'); };
    if (win.confirmClose) {
      let settled = false;
      const once = fn => () => { if (settled) return; settled = true; fn(); };
      try { win.confirmClose(once(doClose), once(cancel)); }
      catch (e) { console.error('[wm] confirmClose', e); once(doClose)(); }
    } else {
      win.el.classList.add('closing');
      setTimeout(doClose, 150);
    }
    return win.closePromise;
  },

  minimize(win) {
    if (win.state === 'fullscreen') return;
    win.stateBeforeMin = win.state;
    win.state = 'minimized';
    win.el.classList.add('minimized');
    if (this.activeWin === win) {
      const rest = this.windows.filter(w => w.state !== 'minimized');
      this.activeWin = null;
      if (rest.length) this.focus(rest[rest.length - 1]); else Bus.emit('wm:focus', null);
    }
    Bus.emit('wm:changed');
  },
  restore(win) {
    win.state = win.stateBeforeMin && win.stateBeforeMin !== 'minimized' ? win.stateBeforeMin : 'normal';
    win.el.classList.remove('minimized');
    this.focus(win);
    Bus.emit('wm:changed');
  },

  toggleZoom(win) {
    if (win.state === 'fullscreen') return;
    if (win.state === 'minimized') this.restore(win);
    if (win.state === 'zoomed') {
      win.rect = { ...win.prevRect };
      win.state = 'normal';
    } else {
      win.prevRect = { ...win.rect };
      const u = this.usableRect();
      win.rect = { x: u.x + 4, y: u.y + 4, w: u.w - 8, h: u.h - 8 };
      win.state = 'zoomed';
    }
    this.applyRect(win);
  },

  toggleFullscreen(win) {
    if (win.state === 'fullscreen') {
      win.el.classList.remove('fullscreen');
      win.rect = { ...win.prevRect };
      win.state = win.stateBeforeFs === 'zoomed' ? 'zoomed' : 'normal';
      this.applyRect(win);
      this.exitFullscreenChrome();
    } else {
      if (win.state === 'minimized') this.restore(win);
      win.stateBeforeFs = win.state;
      win.prevRect = { ...win.rect };
      win.state = 'fullscreen';
      win.el.classList.add('fullscreen');
      Object.assign(win.el.style, { left: '0px', top: '0px', width: '100vw', height: '100vh' });
      this.enterFullscreenChrome(win);
    }
    this.focus(win);
  },
  enterFullscreenChrome(win) {
    Sys.fullscreenWin = win;
    $('#menubar').classList.add('autohide');
    Sys.dockHide(true);
  },
  exitFullscreenChrome() {
    Sys.fullscreenWin = null;
    $('#menubar').classList.remove('autohide');
    Sys.dockHide(false);
  },

  startDrag(e, win) {
    if (win.state === 'fullscreen') return;
    const startX = e.clientX, startY = e.clientY;
    const orig = { ...win.rect };
    if (win.state === 'zoomed') {
      // 从缩放状态拖出：恢复普通矩形并保持相对位置
      const ratio = (startX - orig.x) / orig.w;
      win.rect = { ...(win.prevRect || { w: 720, h: 480 }), x: orig.x, y: orig.y };
      win.rect.x = startX - win.rect.w * ratio;
      win.rect.y = startY - 14;
      win.state = 'normal';
      this.applyRect(win);
      orig.x = win.rect.x; orig.y = win.rect.y; orig.w = win.rect.w; orig.h = win.rect.h;
    }
    document.body.classList.add('wm-dragging');
    const move = ev => {
      let nx = orig.x + ev.clientX - startX;
      let ny = orig.y + ev.clientY - startY;
      // 不允许完全拖出可视区域
      ny = clamp(ny, 30, innerHeight - 28);
      nx = clamp(nx, -win.rect.w + 80, innerWidth - 80);
      win.rect.x = nx; win.rect.y = ny;
      win.el.style.left = nx + 'px'; win.el.style.top = ny + 'px';
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.body.classList.remove('wm-dragging');
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  },

  startResize(e, win, dir) {
    if (win.state === 'fullscreen') return;
    e.stopPropagation(); e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const orig = { ...win.rect };
    const move = ev => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      let { x, y, w, h } = orig;
      if (dir.includes('e')) w = orig.w + dx;
      if (dir.includes('s')) h = orig.h + dy;
      if (dir.includes('w')) { w = orig.w - dx; x = orig.x + dx; }
      if (dir.includes('n')) { h = orig.h - dy; y = orig.y + dy; }
      if (w < win.minW) { if (dir.includes('w')) x -= (win.minW - w); w = win.minW; }
      if (h < win.minH) { if (dir.includes('n')) y -= (win.minH - h); h = win.minH; }
      y = Math.max(y, 30);
      Object.assign(win.rect, { x, y, w, h });
      this.applyRect(win);
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  },

  setTitle(win, title, edited) {
    win.title = title;
    win.titleEl.querySelector('.t').textContent = title;
    let mark = win.titleEl.querySelector('.edited');
    if (edited && !mark) win.titleEl.append(el('span', { class: 'edited', text: ' — 已编辑' }));
    if (!edited && mark) mark.remove();
    Bus.emit('wm:changed');
  },

  windowsForApp(appId) { return this.windows.filter(w => w.appId === appId); },
  anyVisible() { return this.windows.some(w => w.state !== 'minimized'); },

  clampAll() {
    for (const win of this.windows) {
      if (win.state === 'fullscreen') continue;
      const r = win.rect;
      r.w = clamp(r.w, win.minW, innerWidth);
      r.h = clamp(r.h, win.minH, innerHeight - 30);
      r.x = clamp(r.x, -r.w + 80, innerWidth - 80);
      r.y = clamp(r.y, 30, innerHeight - 28);
      if (win.state === 'zoomed') {
        const u = this.usableRect();
        win.rect = { x: u.x + 4, y: u.y + 4, w: u.w - 8, h: u.h - 8 };
      }
      this.applyRect(win);
    }
  }
};

/* ============ 通用浮层 UI ============ */
const UI = {
  openMenus: [],
  closeAllMenus() { this.openMenus.forEach(m => m.remove()); this.openMenus = []; document.removeEventListener('pointerdown', this._outside); },
  _outside: null,

  /* items: {label, key, checked, disabled, submenu:[], action, sep:true, icon} */
  menu(items, x, y, { sub = false, onClose } = {}) {
    const pop = el('div', { class: 'menu-pop' + (sub ? ' sub' : ''), role: 'menu' });
    let hoverTimer = null, subPop = null;
    const closeSub = () => { if (subPop) { subPop.remove(); subPop = null; } };
    for (const it of items) {
      if (!it) continue;
      if (it.sep) { pop.append(el('div', { class: 'menu-sep' })); continue; }
      const mi = el('div', { class: 'menu-item ' + (it.disabled ? 'disabled' : 'enabled'), role: 'menuitem' },
        el('span', { class: 'mi-check', text: it.checked ? '✓' : '' }),
        el('span', { class: 'mi-label', text: it.label }),
        it.key ? el('span', { class: 'mi-key', text: it.key }) : null,
        it.submenu ? el('span', { class: 'mi-sub', text: '▶' }) : null
      );
      if (!it.disabled) {
        mi.addEventListener('click', e => {
          e.stopPropagation();
          if (it.submenu) return;
          this.closeAllMenus();
          it.action && it.action();
        });
        mi.addEventListener('pointerenter', () => {
          clearTimeout(hoverTimer);
          if (it.submenu) {
            hoverTimer = setTimeout(() => {
              closeSub();
              $$('.menu-item', pop).forEach(n => n.classList.remove('hover'));
              mi.classList.add('hover');
              const r = mi.getBoundingClientRect();
              subPop = this.menu(it.submenu, r.right - 2, r.top - 5, { sub: true });
            }, 160);
          } else {
            hoverTimer = setTimeout(() => { closeSub(); $$('.menu-item', pop).forEach(n => n.classList.remove('hover')); }, 160);
          }
        });
      }
      pop.append(mi);
    }
    document.body.append(pop);
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = clamp(x, 4, innerWidth - pw - 4) + 'px';
    pop.style.top = clamp(y, 34, innerHeight - ph - 4) + 'px';
    this.openMenus.push(pop);
    if (!this._outside) {
      this._outside = e => { if (!e.target.closest('.menu-pop') && !e.target.closest('.mb-item')) this.closeAllMenus(); };
      document.addEventListener('pointerdown', this._outside);
    }
    return pop;
  },

  contextMenu(items, e) {
    e.preventDefault(); e.stopPropagation();
    this.closeAllMenus();
    this.menu(items, e.clientX, e.clientY);
  },

  /* 模态对话框 */
  dialog({ icon = 'assets/icons/finder.png', title = '', msg = '', buttons = ['好'], input = null, danger = 0 }) {
    return new Promise(resolve => {
      const mask = el('div', { class: 'modal-mask' });
      let inputEl = null;
      const dlg = el('div', { class: 'dialog', role: 'alertdialog' },
        iconImg(icon, 'dlg-icon'),
        el('div', { class: 'dlg-title', text: title }),
        el('div', { class: 'dlg-msg', text: msg })
      );
      if (input != null) {
        inputEl = el('input', { class: 'text-input dlg-input', type: 'text', value: input });
        dlg.append(inputEl);
      }
      const btnRow = el('div', { class: 'dlg-btns' + (buttons.length === 2 ? ' row' : '') });
      buttons.forEach((b, i) => {
        const btn = el('button', {
          class: 'btn' + (i === danger ? ' danger' : i === buttons.length - 1 ? ' primary' : ''), text: b,
          onclick: () => { cleanup(); resolve({ index: i, value: inputEl ? inputEl.value : null }); }
        });
        btnRow.append(btn);
      });
      dlg.append(btnRow); mask.append(dlg); document.body.append(mask);
      const onKey = e => {
        if (e.key === 'Escape') { cleanup(); resolve({ index: -1, value: null }); }
        if (e.key === 'Enter' && (!inputEl || document.activeElement === inputEl)) { cleanup(); resolve({ index: buttons.length - 1, value: inputEl ? inputEl.value : null }); }
      };
      const cleanup = () => { document.removeEventListener('keydown', onKey, true); mask.remove(); };
      document.addEventListener('keydown', onKey, true);
      (inputEl || btnRow.lastChild).focus();
      if (inputEl) inputEl.select();
    });
  },
  alert(title, msg, icon) { return this.dialog({ title, msg, icon, buttons: ['好'] }); },
  confirm(title, msg, { ok = '好', cancel = '取消', danger = false, icon } = {}) {
    return this.dialog({ title, msg, icon, buttons: [cancel, ok], danger: danger ? 1 : -1 }).then(r => r.index === 1);
  },
  prompt(title, msg, value = '') {
    return this.dialog({ title, msg, buttons: ['取消', '好'], input: value }).then(r => r.index === 1 ? r.value : null);
  }
};
window.WM = WM; window.UI = UI;
