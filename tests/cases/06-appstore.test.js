'use strict';
/* ⑧ App Store 安装模型（任务书测试 9） */
module.exports = {
  name: '06-appstore',
  title: '安装前 Applications/Launchpad/Spotlight 无商店应用；安装后出现；旧数据迁移不删用户文件',
  async run({ t, track, newPage, unlock, http }) {
    const env = track(await newPage(http));
    const { page } = env;
    await unlock(page);
    const H = '/Users/guest';
    const STORE_IDS = ['bear', 'typora', 'vscode', 'keynote', 'podcasts', 'news', 'github', 'tv'];

    // ---- 安装前：/Applications 不得有商店应用 ----
    const appsDir = await page.evaluate(h => window.FS.list(h + '/Applications').map(i => i.name), H);
    const storeNames = await page.evaluate(ids => ids.map(id => window.Apps.get(id).name + '.app'), STORE_IDS);
    for (const n of storeNames) t.ok(!appsDir.includes(n), `安装前 Applications 不得出现 ${n}`);

    // ---- Launchpad 不得出现 ----
    const lpApps = await page.evaluate(() => {
      window.Launchpad.show();
      const names = [...document.querySelectorAll('.launchpad .lp-name')].map(n => n.textContent);
      window.Launchpad.hide();
      return names;
    });
    for (const id of ['bear', 'typora', 'vscode', 'tv']) {
      const nm = await page.evaluate(i => window.Apps.get(i).name, id);
      t.ok(!lpApps.includes(nm), `Launchpad 不得出现 ${nm}`);
    }

    // ---- Spotlight 不得出现 ----
    const spFound = await page.evaluate(() => {
      window.Spotlight.open();
      window.Spotlight.render('VS Code');
      const found = window.Spotlight.items.filter(i => i.title && i.title.includes('VS Code')).length;
      window.Spotlight.render('熊掌记');
      const found2 = window.Spotlight.items.length;
      window.Spotlight.close();
      return found + found2;
    });
    t.eq(spFound, 0, 'Spotlight 搜索不到未安装商店应用');

    // ---- 迁移清理：污染数据被删除，用户同名文件保留 ----
    await page.evaluate(h => {
      const dir = window.FS.node(h + '/Applications');
      dir.c['熊掌记.app'] = { t: 'a', app: 'bear', mtime: Date.now() };      // 旧版本错误写入的占位条目
      dir.c['Typora.app'] = { t: 'd', c: {}, mtime: Date.now() };          // 用户自建同名文件夹
      window.FS.save();
      window.FS.syncApps();
    }, H);
    const after = await page.evaluate(h => {
      const dir = window.FS.node(h + '/Applications');
      return { bear: dir.c['熊掌记.app'], typora: dir.c['Typora.app'] };
    }, H);
    t.eq(after.bear, undefined, '未安装 storeApp 占位条目被迁移清理');
    t.ok(after.typora && after.typora.t === 'd', '用户同名文件夹不受影响');

    // ---- 安装后立即出现 ----
    await page.evaluate(() => window.AppStoreApp.setInstalled('bear'));
    await page.waitForTimeout(200);
    t.ok(await page.evaluate(h => window.FS.list(h + '/Applications').some(i => i.name === '熊掌记.app'), H), '安装后 /Applications 出现 熊掌记.app');
    const lp2 = await page.evaluate(() => {
      window.Launchpad.show();
      const names = [...document.querySelectorAll('.launchpad .lp-name')].map(n => n.textContent);
      window.Launchpad.hide();
      return names;
    });
    t.ok(lp2.includes('熊掌记'), '安装后 Launchpad 出现');
    const sp2 = await page.evaluate(() => {
      window.Spotlight.open(); window.Spotlight.render('熊掌记');
      const n = window.Spotlight.items.length;
      window.Spotlight.close(); return n;
    });
    t.ok(sp2 > 0, '安装后 Spotlight 可搜索到');
    // 双击 .app 可打开
    await page.evaluate(h => window.Apps.openPath(h + '/Applications/熊掌记.app'), H);
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(() => window.WM.windowsForApp('bear').length), 1, '安装后可从 Applications 打开');

    // ---- tv.png 资源存在且可加载 ----
    const tvOk = await page.evaluate(() => new Promise(r => {
      const im = new Image();
      im.onload = () => r(true); im.onerror = () => r(false);
      im.src = 'assets/icons/tv.png';
    }));
    t.ok(tvOk, 'assets/icons/tv.png 可加载');
    t.eq(env.errors.length, 0, '全程无未捕获异常: ' + env.errors.join(' | '));
  },
};
