/* ============ 工具库：DOM / 存储 / 事件总线 ============ */
'use strict';
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v; // 仅用于受信任的静态内容
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(9)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* 事件总线 */
const Bus = {
  map: {},
  on(ev, fn) { (this.map[ev] ||= []).push(fn); return () => this.off(ev, fn); },
  off(ev, fn) { this.map[ev] = (this.map[ev] || []).filter(f => f !== fn); },
  emit(ev, data) { (this.map[ev] || []).slice().forEach(fn => { try { fn(data); } catch (e) { console.error('[bus]', ev, e); } }); }
};

/* localStorage 安全封装：每类数据独立 key，解析失败回退默认值 */
const Store = {
  PREFIX: 'macos-web:',
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(this.PREFIX + key);
      if (raw == null) return structuredClone(fallback);
      const v = JSON.parse(raw);
      return v == null ? structuredClone(fallback) : v;
    } catch (e) { console.warn('[store] 解析失败，回退默认:', key); return structuredClone(fallback); }
  },
  set(key, val) {
    try { localStorage.setItem(this.PREFIX + key, JSON.stringify(val)); }
    catch (e) { console.warn('[store] 写入失败:', key, e); }
  },
  remove(key) { localStorage.removeItem(this.PREFIX + key); },
  clearAll() {
    Object.keys(localStorage).filter(k => k.startsWith(this.PREFIX)).forEach(k => localStorage.removeItem(k));
  }
};

/* 时间格式化 */
const WEEK_CN = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
function fmtDateCN(d) { return `${d.getMonth() + 1}月${d.getDate()}日${WEEK_CN[d.getDay()]}`; }
/* 本地日期键 YYYY-MM-DD（避免 toISOString().slice(0,10) 的 UTC 错位） */
const localDateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/* IANA 时区有效性检查（'local' 表示跟随浏览器本地时区） */
const tzValid = tz => {
  if (!tz || tz === 'local') return false;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; }
};
function fmtTime(d, h24, tz) {
  if (tzValid(tz)) return new Intl.DateTimeFormat('zh-CN', { hour: 'numeric', minute: '2-digit', hour12: !h24, timeZone: tz }).format(d);
  let h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
  if (h24) return `${h}:${m}`;
  const ap = h < 12 ? '上午' : '下午'; h = h % 12 || 12;
  return `${ap}${h}:${m}`;
}
function fmtTimeHM(d, h24, tz) {
  if (typeof tzValid === 'function' && tzValid(tz)) return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: !h24, timeZone: tz }).format(d);
  let h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
  if (h24) return `${String(h).padStart(2, '0')}:${m}`;
  const ap = h < 12 ? '上午' : '下午'; h = h % 12 || 12;
  return `${ap} ${h}:${m}`;
}
function fmtMenuClock(d, h24, tz) {
  if (typeof tzValid === 'function' && tzValid(tz)) {
    const date = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: tz }).format(d);
    return `${date} ${fmtTime(d, h24, tz)}`;
  }
  const base = `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK_CN[d.getDay()]} `;
  let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
  if (h24) return base + `${h}:${m}`;
  const ap = h < 12 ? '上午' : '下午'; h = h % 12 || 12;
  return base + `${ap}${h}:${m}`;
}
function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}
function fmtDur(sec) {
  if (!isFinite(sec)) return '--:--';
  sec = Math.round(sec);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function relTime(ts) {
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return fmtTimeHM(d, Sys?.settings?.h24);
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/* 资源路径（带回退的图片） */
function iconImg(src, cls, alt) {
  const img = el('img', { src, class: cls || '', alt: alt || '', draggable: 'false' });
  img.addEventListener('error', () => {
    if (img.dataset.fbk) return;
    img.dataset.fbk = '1';
    const span = el('span', { class: 'icon-fallback', text: '❓', style: { fontSize: 'inherit' } });
    img.replaceWith(span);
  }, { once: true });
  return img;
}
window.$ = $; window.$$ = $$; window.el = el; window.esc = esc; window.clamp = clamp;
window.debounce = debounce; window.uid = uid; window.Bus = Bus; window.Store = Store;
window.fmtDateCN = fmtDateCN; window.fmtTime = fmtTime; window.fmtTimeHM = fmtTimeHM;
window.fmtMenuClock = fmtMenuClock; window.fmtBytes = fmtBytes; window.fmtDur = fmtDur;
window.relTime = relTime; window.iconImg = iconImg;
window.localDateKey = localDateKey; window.tzValid = tzValid;
