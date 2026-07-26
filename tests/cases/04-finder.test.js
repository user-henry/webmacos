'use strict';
/* ④⑤⑥ Finder 历史、双击/选择渲染、桌面重绘限制、复制移动与废纸篓 */
module.exports = {
  name: '04-finder',
  title: 'Finder 历史前进后退、双击、多选、重命名、复制移动、废纸篓还原、桌面重绘限制',
  async run({ t, track, newPage, unlock, http }) {
    const env = track(await newPage(http));
    const { page } = env;
    await unlock(page);
    const H = '/Users/guest';

    // ============ ④ 历史：Desktop → Documents → Downloads ============
    await page.evaluate(() => window.Apps.open('finder', { path: '/Users/guest/Desktop' }));
    await page.waitForTimeout(300);
    const fstate = () => page.evaluate(() => {
      const w = window.WM.windowsForApp('finder').find(x => x.appState.path.startsWith('/Users/guest'));
      const s = w.appState;
      return {
        path: s.path, hi: s.hi, hist: [...s.history],
        backDis: w.body.querySelector('.fb-btn').disabled,
        fwdDis: w.body.querySelectorAll('.fb-btn')[1].disabled,
      };
    });
    let s0 = await fstate();
    t.eq(s0.hist.length, 1, 'args.path 打开时历史只有 1 条（不得重复写入）');
    t.eq(s0.backDis, true, '初始后退禁用');
    t.eq(s0.fwdDis, true, '初始前进禁用');
    await page.evaluate(h => { const w = window.WM.windowsForApp('finder')[0]; w.appState.navigate(h + '/Documents'); w.appState.navigate(h + '/Downloads'); }, H);
    let s1 = await fstate();
    t.eq(JSON.stringify(s1.hist), JSON.stringify([H + '/Desktop', H + '/Documents', H + '/Downloads']), '导航后历史为完整路径序列');
    t.eq(s1.hi, 2, 'index 指向当前路径');
    // 连续后退
    await page.evaluate(() => window.WM.windowsForApp('finder')[0].appState.back());
    s1 = await fstate();
    t.eq(s1.path, H + '/Documents', '后退一步到 Documents');
    t.eq(s1.backDis, false, '后退按钮仍可用');
    t.eq(s1.fwdDis, false, '前进按钮可用');
    await page.evaluate(() => window.WM.windowsForApp('finder')[0].appState.back());
    s1 = await fstate();
    t.eq(s1.path, H + '/Desktop', '后退两步到 Desktop');
    t.eq(s1.backDis, true, '到顶后后退禁用');
    // 连续前进
    await page.evaluate(() => window.WM.windowsForApp('finder')[0].appState.fwd());
    s1 = await fstate();
    t.eq(s1.path, H + '/Documents', '前进一步到 Documents');
    await page.evaluate(() => window.WM.windowsForApp('finder')[0].appState.fwd());
    s1 = await fstate();
    t.eq(s1.path, H + '/Downloads', '前进两步到 Downloads');
    t.eq(s1.fwdDis, true, '到底后前进禁用');
    t.eq(s1.hist.length, 3, '后退/前进不写历史');
    // 后退后新导航删除 forward 分支
    await page.evaluate(() => window.WM.windowsForApp('finder')[0].appState.back());
    await page.evaluate(h => window.WM.windowsForApp('finder')[0].appState.navigate(h + '/Pictures'), H);
    s1 = await fstate();
    t.eq(JSON.stringify(s1.hist), JSON.stringify([H + '/Desktop', H + '/Documents', H + '/Pictures']), '新导航删除 forward 分支');
    t.eq(s1.fwdDis, true, 'forward 分支删除后前进禁用');

    // ============ ⑤ 单击不重建 DOM ============
    await page.evaluate(h => window.WM.windowsForApp('finder')[0].appState.navigate(h + '/Desktop'), H);
    await page.waitForTimeout(200);
    const stable = await page.evaluate(() => {
      const w = window.WM.windowsForApp('finder')[0];
      const before = w.body.querySelector('.fb-item');
      const beforeName = before.querySelector('.fi-name').textContent;
      before.click(); // 单击
      const after = w.body.querySelector('.fb-item');
      return { same: before === after, sel: before.classList.contains('sel'), name: beforeName };
    });
    t.ok(stable.same, '单击后列表节点保持同一引用（未重建 DOM）');
    t.ok(stable.sel, '单击后选中 class 生效');

    // ============ ⑤ Cmd/Shift 多选 ============
    const multi = await page.evaluate(() => {
      const w = window.WM.windowsForApp('finder')[0];
      const items = [...w.body.querySelectorAll('.fb-item')];
      const ev = (node, opts) => node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...opts }));
      ev(items[0], {});
      ev(items[1], { metaKey: true });
      const afterCmd = w.appState.selection.size;
      ev(items[0], {}); // 重设锚点
      ev(items[items.length - 1], { shiftKey: true });
      return { afterCmd, afterShift: w.appState.selection.size, total: items.length };
    });
    t.eq(multi.afterCmd, 2, 'Cmd 多选 2 项');
    t.eq(multi.afterShift, multi.total, 'Shift 范围选择覆盖全部');

    // ============ ⑤ 真实双击 ============
    const dbl = await page.evaluate(h => {
      const w = window.WM.windowsForApp('finder')[0];
      const folder = [...w.body.querySelectorAll('.fb-item')].find(n => n.querySelector('.fi-name').textContent === 'Sample Folder');
      folder.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      folder.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      folder.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      return w.appState.path;
    });
    t.eq(dbl, H + '/Desktop/Sample Folder', '真实双击文件夹必须进入文件夹');
    // 双击文本打开文本编辑
    await page.evaluate(h => window.WM.windowsForApp('finder')[0].appState.navigate(h + '/Desktop'), H);
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('finder')[0];
      const f = [...w.body.querySelectorAll('.fb-item')].find(n => n.querySelector('.fi-name').textContent === 'welcome.txt');
      f.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      f.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(() => window.WM.windowsForApp('textedit').length), 1, '双击文本打开文本编辑');
    await page.evaluate(() => { window.WM.windowsForApp('textedit')[0] && window.WM.close(window.WM.windowsForApp('textedit')[0]); });
    await page.waitForTimeout(250);

    // ============ ⑤ 重命名（Enter 提交）============
    const ren = await page.evaluate(() => {
      const w = window.WM.windowsForApp('finder')[0];
      const f = [...w.body.querySelectorAll('.fb-item')].find(n => n.querySelector('.fi-name').textContent === 'welcome.txt');
      w.appState.selection = new Set([f.dataset.path]);
      w.appState.startRename(f.dataset.path);
      const input = w.body.querySelector('.fi-rename');
      input.value = 'welcome-renamed.txt';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      return true;
    });
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(h => window.FS.exists(h + '/Desktop/welcome-renamed.txt'), H), true, '重命名生效');
    t.eq(await page.evaluate(h => window.FS.exists(h + '/Desktop/welcome.txt'), H), false, '旧名已消失');
    t.eq(await page.$$eval('.modal-mask', n => n.length), 0, '重命名无残留模态框');

    // ============ 复制 / 移动 ============
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('finder')[0];
      const f = [...w.body.querySelectorAll('.fb-item')].find(n => n.querySelector('.fi-name').textContent === 'welcome-renamed.txt');
      w.appState.selection = new Set([f.dataset.path]);
      w.appState.copySel('copy');
      w.appState.navigate('/Users/guest/Documents');
      w.appState.paste();
    });
    await page.waitForTimeout(250);
    t.eq(await page.evaluate(h => window.FS.exists(h + '/Documents/welcome-renamed.txt'), H), true, '⌘C/⌘V 复制到 Documents');
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('finder')[0];
      const f = [...w.body.querySelectorAll('.fb-item')].find(n => n.querySelector('.fi-name').textContent === 'welcome-renamed.txt');
      w.appState.selection = new Set([f.dataset.path]);
      w.appState.copySel('cut');
      w.appState.navigate('/Users/guest/Downloads');
      w.appState.paste();
    });
    await page.waitForTimeout(250);
    t.eq(await page.evaluate(h => window.FS.exists(h + '/Downloads/welcome-renamed.txt'), H), true, '剪切粘贴移动到 Downloads');
    t.eq(await page.evaluate(h => window.FS.exists(h + '/Documents/welcome-renamed.txt'), H), false, '移动后源已消失');

    // ============ 废纸篓还原 ============
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('finder')[0];
      const f = [...w.body.querySelectorAll('.fb-item')].find(n => n.querySelector('.fi-name').textContent === 'welcome-renamed.txt');
      w.appState.selection = new Set([f.dataset.path]);
      w.appState.trashSelection();
    });
    await page.waitForTimeout(250);
    t.eq(await page.evaluate(h => window.FS.exists(h + '/Downloads/welcome-renamed.txt'), H), false, '已移到废纸篓');
    const trashed = await page.evaluate(() => {
      const w = window.WM.windowsForApp('finder')[0];
      w.appState.navigate(window.FS.TRASH);
      const items = window.FS.list(window.FS.TRASH);
      if (!items.length) return null;
      window.FS.restore(items.find(i => i.name.includes('welcome-renamed')).name);
      return true;
    });
    t.ok(trashed, '废纸篓中执行放回原处');
    await page.waitForTimeout(250);
    t.eq(await page.evaluate(h => window.FS.exists(h + '/Downloads/welcome-renamed.txt'), H), true, '还原回到原位置 Downloads');

    // ============ ⑥ 桌面重绘限制 ============
    // 记录桌面图标 DOM 引用：Documents 写入不得重建，Desktop 写入必须重建
    const deskRef = await page.evaluate(() => {
      const el1 = document.querySelector('#desktop-icons .desk-icon');
      window.__deskEl = el1;
      return !!el1;
    });
    t.ok(deskRef, '桌面有图标');
    await page.evaluate(h => window.FS.write(h + '/Documents/internal-op.txt', 'x'), H);
    await page.waitForTimeout(200);
    t.eq(await page.evaluate(() => document.querySelector('#desktop-icons .desk-icon') === window.__deskEl), true, '文稿内部变化不重建桌面图标');
    await page.evaluate(h => window.FS.write(h + '/Desktop/desk-op.txt', 'x'), H);
    await page.waitForTimeout(200);
    t.eq(await page.evaluate(() => document.querySelector('#desktop-icons .desk-icon') === window.__deskEl), false, 'Desktop 直接子项变化重建桌面图标');
    await page.evaluate(h => window.FS.trash(h + '/Desktop/desk-op.txt'), H);
    t.eq(env.errors.length, 0, '全程无未捕获异常: ' + env.errors.join(' | '));
  },
};
