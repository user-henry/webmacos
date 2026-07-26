/* ============ 系统设置 ============ */
'use strict';
const SettingsApp = {
  id: 'settings', name: '系统设置', icon: 'assets/icons/settings.png',
  w: 780, h: 560, minW: 620, minH: 420,
  panes: [],
  menus(win) {
    return stdMenus(this, {
      view: this.panes.slice(0, 6).map(p => ({ label: p.name, action: () => win?.appState?.go(p.id) })),
    });
  },
  onArgs(args, win) { if (args.pane) win.appState?.go(args.pane); },
  definePanes() {
    const S = Sys.settings;
    const row = (label, control, sub) => {
      const r = el('div', { class: 'set-row' },
        el('div', { class: 'set-label' }, el('span', { text: label }), sub ? el('small', { text: sub }) : null),
        el('div', { class: 'set-ctl' }, control));
      return r;
    };
    /* toggle：完整 aria（role/aria-checked/tabindex/键盘）。
     * io 可选：{ get(), set(v) } 用于嵌套或计算状态（如 notifAllow、Wi-Fi 网络）。 */
    const toggle = (key, onChange, io) => {
      const get = io ? io.get : () => S[key];
      const set = io ? io.set : v => { S[key] = v; };
      const sw = el('div', { class: 'switch' + (get() ? ' on' : ''), role: 'switch', 'aria-checked': String(!!get()), tabindex: '0' });
      const flip = () => {
        const v = !get(); set(v);
        sw.classList.toggle('on', v); sw.setAttribute('aria-checked', String(v));
        Sys.save(); Sys.applyAll(); onChange && onChange(v);
      };
      sw.addEventListener('click', flip);
      sw.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
      return sw;
    };
    const slider = (key, min, max, pct, onInput) => {
      const r = el('input', { type: 'range', class: 'slider', min: String(min), max: String(max), value: String(S[key] * (pct ? 100 : 1)) });
      r.style.setProperty('--fill', (r.value / (pct ? 1 : max)) * (pct ? 1 : 1) + '%');
      const sync = () => r.style.setProperty('--fill', ((r.value - min) / (max - min)) * 100 + '%');
      sync();
      r.addEventListener('input', () => { S[key] = pct ? r.value / 100 : +r.value; sync(); onInput && onInput(+r.value); Sys.applyAll(); });
      r.addEventListener('change', () => Sys.save());
      return r;
    };
    const card = (...rows) => el('div', { class: 'set-card' }, ...rows.filter(Boolean));
    const title = t => el('div', { class: 'set-section', text: t });
    const note = t => el('div', { class: 'set-note', text: t });
    const P = (id, name, ico, group, render) => this.panes.push({ id, name, ico, group, render });

    P('wifi', 'Wi-Fi', '📶', '网络', box => {
      box.append(card(row('Wi-Fi', toggle('wifi', on => { Sys._mbWifi.innerHTML = ''; Sys._mbWifi.append(Sys.wifiSvg()); }))));
      box.append(title('已知网络'));
      const list = card();
      ['家庭网络 5G', 'CoffeeShop_Guest', 'Office-2.4G'].forEach((n, i) => {
        const connected = () => S.wifi && S.wifiNetwork === n;
        const btn = el('button', { class: 'btn', text: connected() ? '已连接' : '连接', disabled: !S.wifi || connected() });
        btn.addEventListener('click', () => {
          S.wifiNetwork = n; Sys.save();
          $$('.set-card .btn', list).forEach(b => { b.textContent = '连接'; b.disabled = false; });
          btn.textContent = '已连接'; btn.disabled = true;
        });
        list.append(row(n, btn, i === 0 ? 'WPA2 个人级' : '开放'));
      });
      box.append(list, note(S.wifi ? '网络连接为模拟数据；连接状态会保存在本机并在重新打开后恢复。' : 'Wi-Fi 已关闭，打开后可加入网络。'));
    });
    P('bluetooth', '蓝牙', '🔵', '网络', box => {
      box.append(card(row('蓝牙', toggle('bluetooth'))));
      box.append(title('附近的设备'));
      const c = card();
      [['AirPods Pro', '耳机'], ['Magic Keyboard', '键盘'], ['MX Master 3S', '鼠标']].forEach(([n, t]) => {
        const connected = () => S.bluetooth && S.btDevices[n] === true;
        const b = el('button', { class: 'btn', text: connected() ? '已连接' : '连接', disabled: !S.bluetooth || connected() });
        b.addEventListener('click', () => {
          if (!S.bluetooth) return;
          const now = !(S.btDevices[n] === true);
          S.btDevices[n] = now; Sys.save();
          b.textContent = now ? '已连接' : '连接';
        });
        c.append(row(n, b, t));
      });
      box.append(c, note('蓝牙设备为模拟数据；连接状态会保存在本机并在重新打开后恢复。'));
    });
    P('network', '网络', '🌐', '网络', box => {
      box.append(card(
        row('状态', el('span', { class: S.wifi ? 'set-ok' : 'set-bad', text: S.wifi ? '● 已连接（Wi-Fi）' : '● 未连接' })),
        row('IP 地址', el('span', { text: '192.168.1.23' })),
        row('路由器', el('span', { text: '192.168.1.1' })),
        row('DNS', el('span', { text: '223.5.5.5, 8.8.8.8' }))));
      box.append(note('网络信息为本地模拟数据。'));
    });
    P('vpn', 'VPN', '🛡', '网络', box => {
      box.append(card(row('VPN', toggle('vpn'), S.vpn ? '已连接到 公司内网' : '未连接')));
      box.append(title('配置'));
      box.append(card(row('公司内网', el('span', { text: 'IKEv2 · vpn.example.com' }))));
      box.append(note('VPN 为模拟项：开关状态会保存，但不产生真实网络连接。'));
    });
    P('notifications', '通知', '🔔', '系统', box => {
      box.append(card(row('允许通知', toggle('notificationsEnabled'), '关闭后所有应用不再产生横幅、通知中心记录或 Dock 徽标')));
      box.append(title('应用通知'));
      const c = card();
      ['mail', 'messages', 'calendar', 'reminders', 'weather', 'appstore', 'clock'].forEach(id => {
        const app = Apps.get(id); if (!app) return;
        const io = { get: () => S.notifAllow[id] !== false, set: v => { S.notifAllow[id] = v; } };
        c.append(row(app.name, toggle(null, null, io), '横幅与通知中心'));
      });
      box.append(c);
    });
    P('sound', '声音', '🔊', '系统', box => {
      box.append(card(
        row('输出音量', slider('volume', 0, 100, true, () => Sys.applyVolume())),
        row('静音', toggle('muted', () => Sys.applyVolume()))));
      box.append(title('提示音'));
      const c = card();
      ['玻璃', '水滴', '风铃'].forEach((n, i) => {
        const key = 'alertSound';
        if (!S[key]) S[key] = '玻璃';
        const r = el('input', { type: 'radio', name: 'alert-sound' });
        r.checked = S[key] === n;
        r.addEventListener('change', () => { S[key] = n; Sys.save(); });
        c.append(row(n, r));
      });
      box.append(c);
    });
    P('focus', '专注模式', '🌙', '系统', box => {
      box.append(card(row('勿扰模式', toggle('focus'), '打开后暂停大多数通知横幅')));
      box.append(note('打开专注模式时，通知仍会记录在通知中心，但不会弹出横幅打扰你。'));
    });
    P('about', '关于本机', '💻', '通用', box => {
      const head = el('div', { class: 'about-head' },
        iconImg('assets/icons/settings.png', 'about-icon'),
        el('div', null,
          el('div', { class: 'about-name', text: S.computerName }),
          el('div', { class: 'about-sub', text: 'macOS 网页版 1.0 (Sonoma 风格)' })));
      box.append(head, card(
        row('芯片', el('span', { text: 'Apple M4 Web' })),
        row('内存', el('span', { text: '16 GB' })),
        row('启动磁盘', el('span', { text: 'Macintosh HD（虚拟）' })),
        row('序列号', el('span', { text: 'C02WEB2026MAC' }))));
      const upd = el('button', { class: 'btn', text: '软件更新…' });
      upd.addEventListener('click', () => this.panes.find(p => p.id === 'update') && win_go('update'));
      box.append(el('div', { style: { marginTop: '12px' } }, upd));
    });
    P('update', '软件更新', '🔄', '通用', box => {
      const st = el('div', { class: 'empty-state', style: { height: '200px' } }, el('div', { class: 'es-icon', text: '⏳' }), el('div', { text: '正在检查更新…' }));
      box.append(st);
      setTimeout(() => {
        if (!document.body.contains(st)) return;
        st.innerHTML = '';
        st.append(el('div', { class: 'es-icon', text: '✅' }), el('div', { text: '你的 Mac 已是最新版本' }), el('div', { class: 'set-note', text: 'macOS 网页版 1.0' }));
      }, 1600);
    });
    P('storage', '储存空间', '💾', '通用', box => {
      const fsSize = FS.size('/');
      const total = 64 * 1024 * 1024;
      const used = 12 * 1024 * 1024 + fsSize * 8; // 模拟系统占用 + 用户数据
      const pct = Math.min(96, Math.round(used / total * 100));
      const bar = el('div', { class: 'storage-bar' },
        el('div', { class: 'storage-seg sys', style: { width: pct - 8 + '%' } }),
        el('div', { class: 'storage-seg doc', style: { width: '8%' } }));
      box.append(card(row('Macintosh HD', el('span', { text: `${fmtBytes(used)} / ${fmtBytes(total)} 已使用` }))), bar,
        card(
          row('系统数据', el('span', { text: fmtBytes(used - fsSize * 8) })),
          row('文稿与文件', el('span', { text: fmtBytes(fsSize * 8) })),
          row('可用', el('span', { text: fmtBytes(total - used) }))));
    });
    P('datetime', '日期与时间', '🕐', '通用', box => {
      box.append(card(
        row('当前时间', el('span', { text: new Date().toLocaleString('zh-CN') })),
        row('24 小时制', toggle('h24', () => Sys.tickClock())),
        row('时区', (() => {
          // 保存到 settings.timezone，并实时影响菜单栏时钟、锁屏时钟与相关显示
          const ZONES = [
            ['local', '跟随本机（浏览器时区）'],
            ['Asia/Shanghai', '亚洲/上海'], ['Asia/Tokyo', '亚洲/东京'], ['Asia/Singapore', '亚洲/新加坡'],
            ['Asia/Dubai', '亚洲/迪拜'], ['Europe/London', '欧洲/伦敦'], ['Europe/Paris', '欧洲/巴黎'],
            ['America/New_York', '美洲/纽约'], ['America/Los_Angeles', '美洲/洛杉矶'], ['Australia/Sydney', '澳洲/悉尼'],
          ];
          const s = el('select', { class: 'text-input' }, ...ZONES.map(([v, label]) => el('option', { text: label, value: v })));
          s.value = S.timezone || 'local';
          s.addEventListener('change', () => {
            S.timezone = s.value; Sys.save();
            Sys.tickClock(); Sys.tickLockClock();
          });
          return s;
        })())));
      box.append(note('菜单栏与锁屏时钟会立即应用 24 小时制设置。'));
    });
    P('language', '语言与地区', '🌍', '通用', box => {
      box.append(card(
        row('首选语言', el('span', { text: '简体中文' })),
        row('地区', (() => { const s = el('select', { class: 'text-input' }, ...['中国', '中国香港', '中国台湾', '新加坡'].map(z => el('option', { text: z, selected: z === S.region }))); s.addEventListener('change', () => { S.region = s.value; Sys.save(); }); return s; })(),
        row('每周第一天', (() => { const s = el('select', { class: 'text-input' }, el('option', { text: '星期一', value: '1', selected: S.firstDayMonday }), el('option', { text: '星期日', value: '0', selected: !S.firstDayMonday })); s.addEventListener('change', () => { S.firstDayMonday = s.value === '1'; Sys.save(); }); return s; })()))));
    });
    P('loginitems', '登录项', '🔑', '通用', box => {
      box.append(title('登录时打开'));
      const c = card();
      ['mail', 'messages', 'notes', 'calendar', 'music'].forEach(id => {
        const app = Apps.get(id); if (!app) return;
        const io = { get: () => S.loginItems[id] === true, set: v => { S.loginItems[id] = v; } };
        c.append(row(app.name, toggle(null, null, io)));
      });
      box.append(c, note('勾选的 App 会在解锁进入桌面时自动打开。'));
    });
    P('sharing', '共享', '📡', '通用', box => {
      const inp = el('input', { class: 'text-input', value: S.computerName });
      inp.addEventListener('change', () => { S.computerName = inp.value.trim() || 'MacBook Pro'; Sys.save(); });
      box.append(card(row('电脑名称', inp)), card(row('屏幕共享', toggle('_shareScreen')), row('文件共享', toggle('_shareFile'))));
      box.append(note('共享开关为模拟项：状态会保存，但不会开启真实共享服务。'));
    });
    P('transfer', '传输或还原', '♻️', '通用', box => {
      const b1 = el('button', { class: 'btn', text: '还原所有设置…' });
      b1.addEventListener('click', () => Sys.resetAll());
      const b2 = el('button', { class: 'btn danger', text: '抹掉所有内容和设置…' });
      b2.addEventListener('click', async () => {
        if (await UI.confirm('抹掉所有内容和设置？', '将删除此浏览器中保存的全部 macOS 网页版数据并恢复到初始状态。', { ok: '抹掉', danger: true })) { Store.clearAll(); location.reload(); }
      });
      box.append(card(row('还原', b1, '清除所有设置与数据并恢复默认值')), card(row('抹掉', b2, '删除全部本地数据')));
    });
    P('appearance', '外观', '🎨', '系统外观', box => {
      const seg = el('div', { class: 'appearance-cards' });
      [['light', '浅色', '☀️'], ['dark', '深色', '🌙'], ['auto', '自动', '🌓']].forEach(([v, n, i]) => {
        const c = el('div', { class: 'ap-card' + (S.appearance === v ? ' sel' : '') },
          el('div', { class: 'ap-preview ap-' + v, text: i }),
          el('div', { class: 'ap-name', text: n }));
        c.addEventListener('click', () => { S.appearance = v; Sys.save(); Sys.applyAppearance(); $$('.ap-card', seg).forEach(x => x.classList.remove('sel')); c.classList.add('sel'); });
        seg.append(c);
      });
      box.append(seg);
      box.append(title('强调色'));
      const colors = el('div', { class: 'accent-row' });
      ['#0a84ff', '#bf5af2', '#ff453a', '#ff9f0a', '#32d74b', '#64d2ff'].forEach(col => {
        const dot = el('button', { class: 'accent-dot' + (S.accent === col ? ' sel' : ''), style: { background: col }, 'aria-label': '强调色 ' + col });
        dot.addEventListener('click', () => { S.accent = col; Sys.save(); Sys.applyAll(); $$('.accent-dot', colors).forEach(x => x.classList.remove('sel')); dot.classList.add('sel'); });
        colors.append(dot);
      });
      box.append(colors);
    });
    P('accessibility', '辅助功能', '♿', '系统外观', box => {
      box.append(card(
        row('减少透明度', toggle('reduceTransparency'), '将磨砂玻璃替换为实色背景'),
        row('增强对比度', toggle('increaseContrast'), '提高边框与分隔线对比度'),
        row('减少动态效果', toggle('reduceMotion'), '显著削弱窗口与界面动画')));
    });
    P('controlcenter', '控制中心', '🎛', '系统外观', box => {
      box.append(card(
        row('Wi-Fi 模块', el('span', { text: '始终显示' })),
        row('专注模式模块', el('span', { text: '始终显示' })),
        row('亮度与声音', el('span', { text: '始终显示' }))));
      box.append(note('模块布局为固定展示（模拟）；通过菜单栏右上角图标随时打开控制中心。'));
    });
    P('siri', 'Siri 与聚焦', '🔍', '系统外观', box => {
      box.append(card(
        row('在聚焦中搜索应用', toggle('siriApps')),
        row('在聚焦中搜索文件', toggle('siriFiles')),
        row('在聚焦中搜索设置', toggle('siriSettings'))));
      box.append(note('快捷键：Ctrl + 空格 或 ⌘ + 空格。支持输入算式即时计算。'));
    });
    P('privacy', '隐私与安全性', '🔒', '系统外观', box => {
      box.append(card(row('防火墙', toggle('_firewall'), '阻止未授权的传入连接（模拟，不影响真实网络）')));
      box.append(title('App 权限'));
      box.append(card(
        row('邮件 — 通知', el('span', { class: 'set-ok', text: '已允许' })),
        row('信息 — 通知', el('span', { class: 'set-ok', text: '已允许' })),
        row('天气 — 位置', el('span', { text: '使用期间允许' }))));
    });
    P('dock', '桌面与程序坞', '🖥', '系统外观', box => {
      const sizeRow = row('大小', (() => {
        const r = el('input', { type: 'range', class: 'slider', min: '36', max: '72', value: String(S.dockSize) });
        const sync = () => r.style.setProperty('--fill', ((r.value - 36) / 36 * 100) + '%');
        sync();
        r.addEventListener('input', () => { S.dockSize = +r.value; sync(); Sys.save(); Sys.renderDock(); });
        return r;
      })());
      const magRow = row('放大', (() => {
        const wrap = el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flex: '1' } });
        const r = el('input', { type: 'range', class: 'slider', min: '10', max: '25', value: String(Math.round(S.dockMagnifyLevel * 10)) });
        const sync = () => r.style.setProperty('--fill', ((r.value - 10) / 15 * 100) + '%');
        sync();
        r.addEventListener('input', () => { S.dockMagnifyLevel = r.value / 10; sync(); Sys.save(); });
        wrap.append(toggle('dockMagnify'), r);
        return wrap;
      })());
      box.append(card(sizeRow, magRow));
      box.append(title('置于屏幕上的位置'));
      const seg = el('div', { class: 'segmented' }, ...[['left', '左边'], ['bottom', '底部'], ['right', '右边']].map(([v, n]) => {
        const b = el('button', { text: n, class: S.dockPosition === v ? 'on' : '' });
        b.addEventListener('click', () => { S.dockPosition = v; Sys.save(); Sys.layoutDock(); $$('button', seg).forEach(x => x.classList.remove('on')); b.classList.add('on'); });
        return b;
      }));
      box.append(el('div', { style: { marginBottom: '12px' } }, seg));
      box.append(card(row('自动隐藏和显示程序坞', toggle('dockAutohide', () => Sys.layoutDock()))));
    });
    P('displays', '显示器', '🖵', '系统外观', box => {
      box.append(card(
        row('亮度', slider('brightness', 20, 100, true, () => Sys.applyBrightness())),
        row('夜览', toggle('nightShift', () => Sys.applyNightShift()), '日落后自动将屏幕调暖'),
        row('夜览强度', slider('nightShiftStrength', 0, 100, true, () => Sys.applyNightShift()))));
      box.append(card(row('分辨率', el('span', { text: `${innerWidth} × ${innerHeight}` })), row('刷新率', el('span', { text: '60 Hz' }))));
    });
    P('screensaver', '屏幕保护程序', '🌌', '系统外观', box => {
      const seg = el('div', { class: 'segmented' }, ...[['off', '关闭'], ['clock', '数字时钟'], ['slides', '壁纸幻灯片']].map(([v, n]) => {
        const b = el('button', { text: n, class: S.screensaverType === v ? 'on' : '' });
        b.addEventListener('click', () => { S.screensaverType = v; Sys.save(); Sys.resetIdle(); $$('button', seg).forEach(x => x.classList.remove('on')); b.classList.add('on'); });
        return b;
      }));
      box.append(el('div', { style: { marginBottom: '12px' } }, seg));
      const sel = el('select', { class: 'text-input' }, ...[1, 3, 5].map(m => el('option', { value: String(m), text: `${m} 分钟`, selected: S.screensaverDelay === m })));
      sel.addEventListener('change', () => { S.screensaverDelay = +sel.value; Sys.save(); Sys.resetIdle(); });
      box.append(card(row('闲置多久后启动', sel)));
      const pv = el('button', { class: 'btn', text: '预览屏保' });
      pv.addEventListener('click', () => { if (S.screensaverType === 'off') UI.alert('屏保已关闭', '请先选择一种屏保类型。', this.icon); else Sys.showScreensaver(); });
      box.append(el('div', { style: { marginTop: '10px' } }, pv));
    });
    P('wallpaper', '墙纸', '🏞', '系统外观', box => {
      const grid = el('div', { class: 'wall-grid' });
      WALLPAPERS.forEach(w => {
        const cell = el('div', { class: 'wall-cell' + (S.wallpaper === w.id ? ' sel' : '') },
          iconImg(w.src, '', w.name), el('div', { class: 'wall-name', text: w.name }));
        cell.addEventListener('click', () => { S.wallpaper = w.id; Sys.save(); Sys.applyWallpaper(); $$('.wall-cell', grid).forEach(x => x.classList.remove('sel')); cell.classList.add('sel'); });
        grid.append(cell);
      });
      box.append(grid, note('锁屏与桌面共享同一墙纸；深色模式下部分墙纸会自动切换为暗色版本。'));
    });
    P('lockscreen', '锁定屏幕', '🔐', '安全', box => {
      const sw = el('div', { class: 'switch' + (S.passwordEnabled ? ' on' : ''), role: 'switch', 'aria-checked': String(!!S.passwordEnabled), tabindex: '0' });
      const flip = async () => {
        if (!S.passwordEnabled) {
          const p1 = await UI.prompt('设置密码', '请输入锁屏密码（本地保存，仅用于演示）：', '');
          if (p1 == null) return;
          const p2 = await UI.prompt('确认密码', '请再次输入密码：', '');
          if (p1 !== p2) { UI.alert('两次输入不一致', '请重试。', this.icon); return; }
          S.password = p1; S.passwordEnabled = true;
        } else { S.passwordEnabled = false; S.password = ''; }
        sw.classList.toggle('on', S.passwordEnabled);
        sw.setAttribute('aria-checked', String(S.passwordEnabled));
        Sys.save();
        UI.alert('已更新', S.passwordEnabled ? '锁屏密码已启用。' : '锁屏密码已关闭。', this.icon);
      };
      sw.addEventListener('click', flip);
      sw.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
      box.append(card(row('锁屏密码', sw, S.passwordEnabled ? '已启用' : '未启用')));
      box.append(note('启用后，解锁时需要输入密码。'));
    });
    P('touchid', '触控 ID 与密码', '👆', '安全', box => {
      box.append(el('div', { class: 'empty-state', style: { height: '140px' } },
        el('div', { class: 'es-icon', text: '👆' }),
        el('div', { text: '此 Mac 不支持触控 ID' }),
        el('div', { class: 'set-note', text: '可以在「锁定屏幕」中管理锁屏密码。' })));
      const b = el('button', { class: 'btn', text: '前往锁定屏幕设置' });
      b.addEventListener('click', () => win_go('lockscreen'));
      box.append(el('div', { style: { textAlign: 'center' } }, b));
    });
    P('users', '用户与群组', '👤', '安全', box => {
      const avRow = el('div', { class: 'avatar-row' });
      ['assets/icons/avatar.svg', 'assets/icons/bear.png', 'assets/icons/facetime.png'].forEach(src => {
        const im = iconImg(src, 'avatar-choice' + (S.avatar === src ? ' sel' : ''));
        im.addEventListener('click', () => { S.avatar = src; Sys.save(); $$('.avatar-choice', avRow).forEach(x => x.classList.remove('sel')); im.classList.add('sel'); });
        avRow.append(im);
      });
      const nameIn = el('input', { class: 'text-input', value: S.userName });
      nameIn.addEventListener('change', () => { S.userName = nameIn.value.trim() || '客人用户'; Sys.save(); });
      box.append(card(row('当前用户', el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, avRow)), row('用户名', nameIn)));
      box.append(note('头像与用户名会显示在锁屏界面。'));
    });
    P('keyboard', '键盘', '⌨️', '输入', box => {
      box.append(card(
        row('按键重复速度', slider('kbRepeat', 1, 10, false)),
        row('重复前延迟', slider('kbDelay', 1, 10, false))));
      box.append(card(row('输入法', el('span', { text: '简体拼音' })), row('键盘亮度', el('span', { text: '自动' }))));
      box.append(note('键盘参数为模拟项：值会保存在本模拟器中，不会影响真实系统。'));
    });
    P('mouse', '鼠标', '🖱', '输入', box => {
      box.append(card(
        row('跟踪速度', slider('mouseSpeed', 1, 10, false)),
        row('自然滚动', toggle('_naturalScroll'))));
      box.append(note('鼠标参数为模拟项：值会保存在本模拟器中，不会影响真实系统。'));
    });
    P('trackpad', '触控板', '⬜', '输入', box => {
      box.append(card(
        row('轻点来点按', toggle('_tapClick')),
        row('双指滚动', toggle('_twoFingerScroll')),
        row('三指拖移', toggle('_threeDrag'))));
      box.append(note('触控板手势为模拟展示，不会影响真实系统。'));
    });
    P('printers', '打印机与扫描仪', '🖨', '输入', box => {
      box.append(el('div', { class: 'empty-state', style: { height: '160px' } },
        el('div', { class: 'es-icon', text: '🖨' }), el('div', { text: '没有打印机' })));
      const b = el('button', { class: 'btn', text: '添加打印机…' });
      b.addEventListener('click', () => UI.alert('未找到打印机', '网络上没有可用的打印机。', this.icon));
      box.append(el('div', { style: { textAlign: 'center' } }, b));
    });
    P('safari', 'Safari 浏览器', '🧭', 'App', box => {
      const sel = el('select', { class: 'text-input' },
        el('option', { value: 'bing', text: 'Bing', selected: S.searchEngine === 'bing' }),
        el('option', { value: 'baidu', text: '百度', selected: S.searchEngine === 'baidu' }));
      sel.addEventListener('change', () => { S.searchEngine = sel.value; Sys.save(); });
      box.append(card(row('搜索引擎', sel)));
      box.append(note('离线环境下，外部网页会显示设计好的回退页，可选择在系统浏览器新标签页打开。'));
    });

    function win_go(id) { WM.windowsForApp('settings')[0]?.appState?.go(id); }
  },

  render(win, args) {
    if (!this.panes.length) this.definePanes();
    const st = win.appState = { pane: null, q: '' };
    win.body.classList.add('settings-body');
    const search = el('input', { class: 'text-input set-search', type: 'search', placeholder: '搜索' });
    const nav = el('div', { class: 'set-nav' });
    const side = el('div', { class: 'set-sidebar' }, el('div', { style: { padding: '8px 8px 4px' } }, search), nav);
    const content = el('div', { class: 'set-content' });
    win.body.append(side, content);
    const groups = ['网络', '系统', '通用', '系统外观', '安全', '输入', 'App'];
    const renderNav = () => {
      nav.innerHTML = '';
      for (const g of groups) {
        const items = this.panes.filter(p => p.group === g && (!st.q || p.name.toLowerCase().includes(st.q.toLowerCase())));
        if (!items.length) continue;
        nav.append(el('div', { class: 'fb-side-title', text: g }));
        for (const p of items) {
          const rowEl = el('div', { class: 'fb-side-item set-nav-item' + (st.pane === p.id ? ' sel' : '') },
            el('span', { class: 'fb-side-ico', text: p.ico }), el('span', { text: p.name }));
          rowEl.addEventListener('click', () => st.go(p.id));
          nav.append(rowEl);
        }
      }
    };
    st.go = id => {
      const p = this.panes.find(p => p.id === id) || this.panes[0];
      st.pane = p.id;
      renderNav();
      content.innerHTML = '';
      content.scrollTop = 0;
      WM.setTitle(win, p.name + ' — 系统设置');
      content.append(el('div', { class: 'set-pane-title' }, el('span', { text: p.ico, style: { fontSize: '20px' } }), el('span', { text: p.name })));
      try { p.render(content); } catch (e) { console.error('[settings]', e); content.append(el('div', { class: 'empty-state', text: '此设置页加载失败' })); }
    };
    search.addEventListener('input', debounce(() => { st.q = search.value.trim(); renderNav(); }, 150));
    renderNav();
    st.go(args.pane || 'appearance');
  }
};
Apps.register(SettingsApp);
window.SettingsApp = SettingsApp;
