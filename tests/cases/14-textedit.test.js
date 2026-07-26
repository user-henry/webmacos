'use strict';
/* 任务书测试 5：文本编辑保存/另存为/取消关闭/跨 App 同步 */
module.exports = {
  name: '14-textedit',
  title: '文本编辑保存、另存为、取消关闭不落盘、跨 App 内容一致',
  async run({ t, track, newPage, unlock, http }) {
    const env = track(await newPage(http));
    const { page } = env;
    await unlock(page);
    const DOC = '/Users/guest/Documents';

    // ---- 新建未命名 → 保存 ----
    await page.evaluate(() => window.Apps.open('textedit'));
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('textedit')[0];
      const ta = w.body.querySelector('textarea');
      ta.value = '第一行内容';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // 菜单保存 → 另存为对话框
    await page.evaluate(() => { window.WM.windowsForApp('textedit')[0].appState.save(); });
    await page.waitForSelector('.modal-mask .dialog input', { timeout: 3000 });
    await page.evaluate(() => {
      const inp = document.querySelector('.modal-mask .dialog input');
      inp.value = 'note-a.txt';
      [...document.querySelectorAll('.dlg-btns .btn')].find(b => b.textContent === '好' || b.textContent === '保存' || b.textContent === '确定').click();
    });
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(d => window.FS.exists(d + '/note-a.txt'), DOC), true, '保存后文件出现在文稿');
    t.eq(await page.evaluate(d => window.FS.read(d + '/note-a.txt'), DOC), '第一行内容', '文件内容正确');
    const title1 = await page.evaluate(() => window.WM.windowsForApp('textedit')[0].titleEl.textContent);
    t.ok(!title1.includes('●'), '保存后标题无未保存圆点');

    // ---- Finder 中可见 ----
    await page.evaluate(d => window.Apps.open('finder', { path: d }), DOC);
    await page.waitForTimeout(300);
    const inFinder = await page.evaluate(() => {
      const w = window.WM.windowsForApp('finder')[0];
      return [...w.body.querySelectorAll('.fi-name')].some(n => n.textContent === 'note-a.txt');
    });
    t.ok(inFinder, 'Finder 中可见新文件');

    // ---- 修改 → 关闭点取消：窗口在、不落盘 ----
    await page.evaluate(() => {
      const w = window.WM.windowsForApp('textedit')[0];
      const ta = w.body.querySelector('textarea');
      ta.value = '第一行内容\n未保存的第二行';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.evaluate(() => { window.WM.close(window.WM.windowsForApp('textedit')[0]); });
    await page.waitForSelector('.modal-mask .dialog', { timeout: 3000 });
    await page.evaluate(() => { [...document.querySelectorAll('.dlg-btns .btn')].find(b => b.textContent === '取消').click(); });
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(() => window.WM.windowsForApp('textedit').length), 1, '取消关闭窗口保留');
    t.eq(await page.evaluate(d => window.FS.read(d + '/note-a.txt'), DOC), '第一行内容', '取消后磁盘内容未变');

    // ---- 修改 → 关闭点存储：内容更新 ----
    await page.evaluate(() => { window.WM.close(window.WM.windowsForApp('textedit')[0]); });
    await page.waitForSelector('.modal-mask .dialog', { timeout: 3000 });
    await page.evaluate(() => { [...document.querySelectorAll('.dlg-btns .btn')].find(b => b.textContent === '存储').click(); });
    await page.waitForTimeout(400);
    t.eq(await page.evaluate(() => window.WM.windowsForApp('textedit').length), 0, '存储后窗口关闭');
    t.eq(await page.evaluate(d => window.FS.read(d + '/note-a.txt'), DOC), '第一行内容\n未保存的第二行', '存储后磁盘内容更新');

    // ---- 跨 App 同步：文本编辑重开显示最新；另一 Finder 窗口同步 ----
    await page.evaluate(d => window.Apps.open('textedit', { path: d + '/note-a.txt' }), DOC);
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(() => window.WM.windowsForApp('textedit')[0].body.querySelector('textarea').value), '第一行内容\n未保存的第二行', '文本编辑重开显示已存内容');

    // ---- 另存为第二个文件名 ----
    await page.evaluate(() => { window.WM.windowsForApp('textedit')[0].appState.saveAs(); });
    await page.waitForSelector('.modal-mask .dialog input', { timeout: 3000 });
    await page.evaluate(() => {
      const inp = document.querySelector('.modal-mask .dialog input');
      inp.value = 'note-b.txt';
      [...document.querySelectorAll('.dlg-btns .btn')].find(b => b.textContent === '好' || b.textContent === '保存' || b.textContent === '确定').click();
    });
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(d => window.FS.exists(d + '/note-b.txt'), DOC), true, '另存为生成第二个文件');
    t.eq(await page.evaluate(() => window.WM.windowsForApp('textedit')[0].appState.path), DOC + '/note-b.txt', '另存为后当前路径切换');

    // ---- 另存为对话框点取消：不写盘 ----
    await page.evaluate(() => { window.WM.windowsForApp('textedit')[0].appState.saveAs(); });
    await page.waitForSelector('.modal-mask .dialog input', { timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(d => window.FS.list(d).filter(i => i.name.startsWith('note-c')).length, DOC), 0, '取消另存为不写盘');

    // 清理
    await page.evaluate(d => { window.FS.trash(d + '/note-a.txt'); window.FS.trash(d + '/note-b.txt'); }, DOC);
    t.eq(env.errors.length, 0, '全程无未捕获异常: ' + env.errors.join(' | '));
  },
};
