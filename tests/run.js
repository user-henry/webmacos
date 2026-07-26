/* 轻量 Playwright 回归测试运行器
 * 用法：node tests/run.js [关键字过滤]
 * 每个用例独立浏览器上下文（localStorage 隔离），HTTP 模式由内置静态服务器提供。 */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./helpers');

const filter = process.argv[2] || '';
const caseDir = path.join(__dirname, 'cases');
const files = fs.readdirSync(caseDir).filter(f => f.endsWith('.test.js')).sort();

let pass = 0, fail = 0;
const failures = [];

function makeT(name) {
  return {
    name,
    ok(cond, msg) { if (!cond) throw new Error('断言失败: ' + msg); },
    eq(a, b, msg) { if (a !== b) throw new Error(`断言失败: ${msg}\n  期望: ${JSON.stringify(b)}\n  实际: ${JSON.stringify(a)}`); },
    includes(hay, needle, msg) { if (!String(hay).includes(needle)) throw new Error(`断言失败: ${msg}\n  “${String(hay).slice(0, 200)}” 不包含 “${needle}”`); },
  };
}

(async () => {
  const server = await H.serveStatic(8177);
  const cases = files.map(f => require(path.join(caseDir, f)))
    .filter(c => !filter || c.name.includes(filter) || (c.title || '').includes(filter));
  console.log(`\n▶ macos-web 回归测试  共 ${cases.length} 组${filter ? `（过滤: ${filter}）` : ''}\n`);
  for (const c of cases) {
    const t = makeT(c.name);
    const started = Date.now();
    let ctxPages = [];
    const env = {
      ...H, t,
      http: server.url, file: H.FILE_URL,
      track(p) { ctxPages.push(p); return p; },
    };
    try {
      // 每用例 150s 超时保护，防止 evaluate 挂起拖死整个运行
      await Promise.race([
        c.run(env),
        new Promise((_, rej) => setTimeout(() => rej(new Error('用例超时(150s)')), 150000)),
      ]);
      pass++;
      console.log(`  ✓ ${c.name}  ${c.title || ''}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    } catch (e) {
      fail++;
      failures.push({ name: c.name, title: c.title, error: e });
      console.log(`  ✗ ${c.name}  ${c.title || ''}`);
      console.log(`      ${String(e.message || e).split('\n').join('\n      ')}`);
    }
    // 关闭本用例打开的上下文
    for (const p of ctxPages) { try { await p.ctx.close(); } catch (e) {} }
  }
  await H.closeBrowser();
  await server.close();
  console.log(`\n──────────────────────────────`);
  console.log(`通过 ${pass} / ${pass + fail}，失败 ${fail}`);
  if (failures.length) {
    console.log('\n失败明细:');
    failures.forEach(f => console.log(`  ✗ ${f.name}: ${(f.title || '')}`));
  }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('运行器异常:', e); process.exit(2); });
