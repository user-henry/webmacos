'use strict';
/* 基线：冷启动与控制台健康 */
module.exports = {
  name: '01-boot',
  title: 'file:// 与 HTTP 冷启动、解锁、控制台无未捕获异常',
  async run({ t, track, newPage, unlock, bootToLock, http, file }) {
    // 1) file:// 冷启动到锁屏并解锁
    {
      const env = track(await newPage(file));
      await bootToLock(env.page);
      t.ok(await env.page.isVisible('#lockscreen'), 'file:// 应到达锁屏');
      await env.page.click('#lockscreen');
      await env.page.waitForSelector('#desktop:not(.hidden)', { timeout: 8000 });
      t.ok(await env.page.isVisible('#menubar'), '解锁后菜单栏可见');
      t.ok(await env.page.isVisible('#dock'), '解锁后 Dock 可见');
      const icons = await env.page.$$eval('#desktop-icons .desk-icon', n => n.length);
      t.ok(icons >= 2, '桌面应有初始图标（welcome.txt / Sample Folder），实际 ' + icons);
      t.eq(env.errors.length, 0, 'file:// 启动过程无未捕获异常: ' + env.errors.join(' | '));
    }
    // 2) HTTP 模式冷启动
    {
      const env = track(await newPage(http));
      await unlock(env.page);
      t.ok(await env.page.isVisible('#desktop'), 'HTTP 解锁后桌面可见');
      t.eq(env.errors.length, 0, 'HTTP 启动过程无未捕获异常: ' + env.errors.join(' | '));
    }
  },
};
