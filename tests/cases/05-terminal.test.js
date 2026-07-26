'use strict';
/* ⑦ 终端 tokenizer 与 cp/mv/rm/touch 语义 */
module.exports = {
  name: '05-terminal',
  title: '终端引号/转义、cp/mv 目标语义、rm -r、touch mtime、错误不重复',
  async run({ t, track, newPage, unlock, http }) {
    const env = track(await newPage(http));
    const { page } = env;
    await unlock(page);
    const H = '/Users/guest';
    await page.evaluate(() => window.Apps.open('terminal'));
    await page.waitForTimeout(300);
    const type = cmd => page.evaluate(c => {
      const win = window.WM.windowsForApp('terminal')[0];
      const input = win.body.querySelector('.term-input');
      input.value = c;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    }, cmd);
    const lines = () => page.evaluate(() => [...window.WM.windowsForApp('terminal')[0].body.querySelectorAll('.term-line')].map(n => n.textContent));
    const errLines = () => page.evaluate(() => [...window.WM.windowsForApp('terminal')[0].body.querySelectorAll('.term-line.term-err')].map(n => n.textContent));
    const exists = p => page.evaluate(pp => window.FS.exists(pp), p);
    const isDir = p => page.evaluate(pp => window.FS.isDir(pp), p);

    // ---- tokenizer：引号 ----
    await type(`mkdir '${H}/Desktop/Test Dir'`);
    await page.waitForTimeout(120);
    t.ok(await isDir(`${H}/Desktop/Test Dir`), `mkdir 'Test Dir' 单引号生效`);
    await type(`cd "${H}/Desktop/Test Dir"`);
    await page.waitForTimeout(120);
    let prompt = await page.evaluate(() => window.WM.windowsForApp('terminal')[0].appState.cwd);
    t.eq(prompt, `${H}/Desktop/Test Dir`, 'cd "…/Test Dir" 双引号生效');
    await type(`cd ~/Desktop/'Test Dir'`);
    await page.waitForTimeout(120);
    prompt = await page.evaluate(() => window.WM.windowsForApp('terminal')[0].appState.cwd);
    t.eq(prompt, `${H}/Desktop/Test Dir`, `cd ~/Desktop/'Test Dir' 拼接引号生效`);
    await type(`cd ${H.replace(/\//g, '\\/')}/Desktop/Test\\ Dir`.replace('\\/', '/')); // 反斜杠转义空格
    await page.waitForTimeout(120);
    prompt = await page.evaluate(() => window.WM.windowsForApp('terminal')[0].appState.cwd);
    t.eq(prompt, `${H}/Desktop/Test Dir`, '反斜杠转义空格生效');

    // ---- touch 更新 mtime ----
    await type('touch a.txt');
    await page.waitForTimeout(120);
    const m1 = await page.evaluate(p => window.FS.node(p).mtime, `${H}/Desktop/Test Dir/a.txt`);
    await page.waitForTimeout(30);
    await type('touch a.txt');
    await page.waitForTimeout(120);
    const m2 = await page.evaluate(p => window.FS.node(p).mtime, `${H}/Desktop/Test Dir/a.txt`);
    t.ok(m2 > m1, `touch 已存在文件更新 mtime（${m1} → ${m2}）`);

    // ---- cp / mv 目标文件名语义 ----
    await type('cp a.txt b.txt');            // 目标文件路径：改名复制
    await page.waitForTimeout(120);
    t.ok(await exists(`${H}/Desktop/Test Dir/b.txt`), 'cp a.txt b.txt 生成 b.txt');
    let errs = await errLines();
    t.eq(errs.filter(e => e.includes('cp')).length, 0, 'cp 成功无错误输出');
    await type(`mkdir sub`);
    await type('cp a.txt sub');              // 目标目录：保留原名
    await page.waitForTimeout(120);
    t.ok(await exists(`${H}/Desktop/Test Dir/sub/a.txt`), 'cp 到目录保留原名');
    await type('mv b.txt c.txt');            // 目标文件路径：改名移动
    await page.waitForTimeout(120);
    t.ok(await exists(`${H}/Desktop/Test Dir/c.txt`), 'mv b.txt c.txt 生成 c.txt');
    t.eq(await exists(`${H}/Desktop/Test Dir/b.txt`), false, 'mv 后源消失');
    errs = await errLines();
    t.eq(errs.filter(e => e.includes('mv')).length, 0, 'mv 改名成功且无错误输出（只移动一次）');
    await type('mv c.txt sub');              // 目标目录
    await page.waitForTimeout(120);
    t.ok(await exists(`${H}/Desktop/Test Dir/sub/c.txt`), 'mv 到目录保留原名');

    // ---- rm 语义 ----
    await type('rm sub');                    // 目录不带 -r → 报错
    await page.waitForTimeout(120);
    t.ok(await isDir(`${H}/Desktop/Test Dir/sub`), 'rm 目录不带 -r 不得删除');
    errs = await errLines();
    const rmErr = errs.filter(e => e.includes('是一个目录'));
    t.eq(rmErr.length, 1, '目录无 -r 报错且只输出一次');
    await type('rm -r sub');                 // 递归删除
    await page.waitForTimeout(120);
    t.eq(await exists(`${H}/Desktop/Test Dir/sub`), false, 'rm -r 递归删除目录');
    await type('rm not-exist.txt');          // 不存在 → 报错一次
    await page.waitForTimeout(120);
    errs = await errLines();
    t.eq(errs.filter(e => e.includes('not-exist')).length, 1, '删除不存在文件报错一次');

    // ---- 清理 ----
    await page.evaluate(h => window.FS.remove(h + '/Desktop/Test Dir'), H);
    t.eq(env.errors.length, 0, '全程无未捕获异常: ' + env.errors.join(' | '));
  },
};
