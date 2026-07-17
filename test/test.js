/**
 * Clash Verge Rev 扩展脚本 — 单元验证测试
 *
 * 本测试覆盖所有 5 种资源类型 × 4 种操作，以及边界情况。
 *
 * 运行方式：
 *   node test/test.js
 */

'use strict';

const path = require('path');
const fs = require('fs');

// ─── 加载目标脚本 ──────────────────────────────────────────────
// 通过 module._compile 将源脚本作为 CommonJS 模块加载
const srcPath = path.join(__dirname, '..', 'src', 'clash-verge-extension-script.js');
const srcCode = fs.readFileSync(srcPath, 'utf8');
const wrapperCode = srcCode + '\n\nmodule.exports = { main };\n';

const Module = require('module');
const loader = new Module();
loader.paths = module.paths;
loader._compile(wrapperCode, srcPath);
const { main } = loader.exports;

// ─── 测试计数器 ────────────────────────────────────────────────
let passed = 0;
let failed = 0;

/**
 * 断言函数
 * @param {unknown} actual - 实际值
 * @param {unknown} expected - 期望值
 * @param {string} label - 测试标签
 */
function assert(actual, expected, label) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);

  if (actualStr === expectedStr) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`    期望: ${expectedStr}`);
    console.log(`    实际: ${actualStr}`);
    failed++;
  }
}

/**
 * 测试分组
 * @param {string} name - 分组名
 * @param {() => void} fn - 测试函数
 */
function describe(name, fn) {
  console.log(`\n▸ ${name}`);
  fn();
}

/**
 * 深拷贝辅助
 * @template T
 * @param {T} obj - 要拷贝的对象
 * @returns {T}
 */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}


// ==============================================================
// 测试套件
// ==============================================================

// ─── 测试 1：空配置安全 ────────────────────────────────────
describe('空配置 / 边界情况', () => {
  // 1a. config 为 undefined
  assert(
    main(undefined),
    undefined,
    'config 为 undefined 时返回 undefined',
  );

  // 1b. config 为 null
  assert(
    main(null),
    null,
    'config 为 null 时返回 null',
  );

  // 1c. config 无 extensions
  assert(
    main({ mode: 'rule' }),
    { mode: 'rule' },
    '无 extensions 时原样返回',
  );

  // 1d. extensions 为空对象
  assert(
    main({ mode: 'rule', extensions: {} }),
    { mode: 'rule' },
    'extensions 为空对象时原样返回（且删除了 extensions）',
  );

  // 1e. extensions 为数组（非法）
  assert(
    main({ mode: 'rule', extensions: [] }),
    { mode: 'rule', extensions: [] },
    'extensions 为数组时原样返回',
  );
});


// ─── 测试 2：rule-providers（对象类型） ─────────────────────
describe('rule-providers', () => {
  const baseConfig = {
    'rule-providers': {
      Google: { type: 'http', interval: 86400 },
      YouTube: { type: 'http', interval: 86400 },
    },
    extensions: {
      'rule-providers': {
        prepend: {
          AI: { type: 'http', interval: 86400 },
          // Google 已存在，不应覆盖
          Google: { type: 'file', interval: 43200 },
        },
        append: {
          Steam: { type: 'http', interval: 43200 },
        },
        replace: {
          // 覆盖 Google
          Google: { type: 'http', interval: 99999, url: 'https://new.com' },
          // 新增
          Netflix: { type: 'http', interval: 86400 },
        },
        remove: ['YouTube'],
      },
    },
  };

  const result = main(clone(baseConfig));
  const rp = result['rule-providers'];

  assert(
    rp.AI.type,
    'http',
    'prepend：新增 AI 规则集',
  );
  assert(
    rp.Google.interval,
    99999,
    'prepend：不覆盖已存在的 Google；replace 覆盖',
  );
  assert(
    rp.Google.url,
    'https://new.com',
    'replace：更新 Google 的 url',
  );
  assert(
    rp.Steam.type,
    'http',
    'append：新增 Steam 规则集',
  );
  assert(
    rp.Netflix.type,
    'http',
    'replace：新增不存在的 Netflix',
  );
  assert(
    rp.YouTube,
    undefined,
    'remove：YouTube 已被删除',
  );
  assert(
    result.extensions,
    undefined,
    'extensions 字段已被删除',
  );
});


// ─── 测试 3：proxy-providers（对象类型，与 rule-providers 同策)略） ─────
describe('proxy-providers', () => {
  const baseConfig = {
    'proxy-providers': {
      Auto: { type: 'http', interval: 86400 },
    },
    extensions: {
      'proxy-providers': {
        prepend: {
          Manual: { type: 'http', interval: 43200 },
        },
        replace: {
          Auto: { type: 'http', interval: 99999 },
        },
        remove: ['Deprecated'],
      },
    },
  };

  const result = main(clone(baseConfig));
  const pp = result['proxy-providers'];

  assert(
    pp.Auto.interval,
    99999,
    'replace：覆盖 Auto 的 interval',
  );
  assert(
    pp.Manual.interval,
    43200,
    'prepend：新增 Manual',
  );
  // Deprecated 不存在，remove 应静默通过
  assert(
    Object.keys(pp).length,
    2,
    'remove：不存在 key 时静默通过',
  );
});


// ─── 测试 4：proxy-groups（对象数组类型） ──────────────────
describe('proxy-groups', () => {
  const baseConfig = {
    'proxy-groups': [
      { name: 'Proxy', type: 'select', proxies: ['Auto'] },
      { name: 'Global', type: 'select', proxies: ['Proxy', 'DIRECT'] },
    ],
    extensions: {
      'proxy-groups': {
        prepend: [
          { name: 'AI', type: 'select', proxies: ['JP', 'US', 'DIRECT'] },
          // Proxy 已存在，不应重复
          { name: 'Proxy', type: 'select', proxies: ['Duplicate'] },
        ],
        append: [
          { name: 'Final', type: 'select', proxies: ['DIRECT'] },
        ],
        replace: [
          // 替换已存在的
          { name: 'Global', type: 'url-test', proxies: ['Auto', 'Manual'] },
          // 新增不存在的
          { name: 'NewGroup', type: 'select', proxies: ['DIRECT'] },
        ],
        remove: ['Proxy'],
      },
    },
  };

  const result = main(clone(baseConfig));
  const pg = result['proxy-groups'];

  assert(
    pg.length,
    4,
    'proxy-groups 最终长度为 4（AI + Global + Final + NewGroup）',
  );
  assert(
    pg[0].name,
    'AI',
    'prepend：AI 在数组最前面',
  );
  assert(
    pg[1].name,
    'Global',
    'replace：Global 在第二位（AI 之后，Proxy 已被删除）',
  );
  assert(
    pg[1].type,
    'url-test',
    'replace：Global 的 type 已被替换',
  );
  assert(
    pg[2].name,
    'Final',
    'append：Final 在第三位',
  );
  assert(
    pg[3].name,
    'NewGroup',
    'replace：NewGroup 在最后（不存在则追加）',
  );
  // Proxy 被删除了
  assert(
    pg.some((item) => item.name === 'Proxy'),
    false,
    'remove：Proxy 已被删除',
  );
});


// ─── 测试 5：proxies（对象数组类型，与 proxy-groups 同策略） ─────
describe('proxies', () => {
  const baseConfig = {
    proxies: [
      { name: 'US-01', type: 'ss', server: 'us.example.com' },
      { name: 'JP-01', type: 'ss', server: 'jp.example.com' },
    ],
    extensions: {
      proxies: {
        prepend: [
          { name: 'SG-01', type: 'ss', server: 'sg.example.com' },
        ],
        append: [
          { name: 'HK-01', type: 'ss', server: 'hk.example.com' },
        ],
        replace: [
          { name: 'US-01', type: 'vmess', server: 'new-us.example.com' },
        ],
        remove: ['JP-01'],
      },
    },
  };

  const result = main(clone(baseConfig));
  const proxies = result.proxies;

  assert(
    proxies.length,
    3,
    'proxies 最终长度为 3（SG-01 + US-01 + HK-01）',
  );
  assert(
    proxies[0].name,
    'SG-01',
    'prepend：SG-01 在最前面',
  );
  assert(
    proxies[1].name,
    'US-01',
    'US-01 在第二位',
  );
  assert(
    proxies[1].type,
    'vmess',
    'replace：US-01 的 type 已更新',
  );
  assert(
    proxies[2].name,
    'HK-01',
    'append：HK-01 在最后',
  );
});


// ─── 测试 6：rules（字符串数组类型） ───────────────────────
describe('rules', () => {
  const baseConfig = {
    rules: [
      'GEOIP,CN,DIRECT',
      'DOMAIN-SUFFIX,google.com,Proxy',
      'MATCH,Proxy',
    ],
    extensions: {
      rules: {
        prepend: [
          'RULE-SET,AI,AI',
          // 已存在，不重复插入
          'GEOIP,CN,DIRECT',
        ],
        append: [
          'DOMAIN-SUFFIX,example.com,DIRECT',
        ],
        replace: [
          { old: 'DOMAIN-SUFFIX,google.com,Proxy', new: 'DOMAIN-SUFFIX,google.com,DIRECT' },
          { old: 'DOMAIN-SUFFIX,nonexistent.com,Proxy', new: 'DOMAIN-SUFFIX,new.com,DIRECT' },
        ],
        remove: ['MATCH,Proxy'],
      },
    },
  };

  const result = main(clone(baseConfig));
  const rules = result.rules;

  assert(
    rules.length,
    5,
    'rules 最终长度为 5（prepend×1 + 原去重 + replace替换 + append + replace追加，remove 删 1）',
  );
  assert(
    rules[0],
    'RULE-SET,AI,AI',
    'prepend：RULE-SET,AI,AI 在最前面',
  );
  assert(
    rules[1],
    'GEOIP,CN,DIRECT',
    'prepend：GEOIP,CN,DIRECT 在第二位（去重后未重复插入）',
  );
  assert(
    rules[2],
    'DOMAIN-SUFFIX,google.com,DIRECT',
    'replace：google.com 规则已被替换',
  );
  assert(
    rules.includes('DOMAIN-SUFFIX,new.com,DIRECT'),
    true,
    'replace：不存在的 old 映射到 new 追加到末尾',
  );
  assert(
    rules.includes('MATCH,Proxy'),
    false,
    'remove：MATCH,Proxy 已被删除',
  );
});


// ─── 测试 7：综合场景 ─────────────────────────────────────
describe('综合场景：所有资源类型同时操作', () => {
  const baseConfig = {
    'rule-providers': {
      Existing: { type: 'http', interval: 86400 },
    },
    'proxy-providers': {
      Existing: { type: 'http', interval: 86400 },
    },
    'proxy-groups': [
      { name: 'Proxy', type: 'select', proxies: ['Auto'] },
    ],
    proxies: [
      { name: 'Node-01', type: 'ss', server: 'server1.com' },
    ],
    rules: [
      'MATCH,Proxy',
    ],
    extensions: {
      'rule-providers': {
        prepend: { NewRule: { type: 'http', interval: 43200 } },
      },
      'proxy-providers': {
        prepend: { NewProxy: { type: 'http', interval: 43200 } },
      },
      'proxy-groups': {
        prepend: [{ name: 'AI', type: 'select', proxies: ['DIRECT'] }],
      },
      proxies: {
        prepend: [{ name: 'New-Node', type: 'ss', server: 'new.com' }],
      },
      rules: {
        prepend: ['RULE-SET,AI,AI'],
      },
    },
  };

  const result = main(clone(baseConfig));

  assert(
    result['rule-providers'].NewRule.interval,
    43200,
    '综合：rule-providers prepend 生效',
  );
  assert(
    result['proxy-providers'].NewProxy.interval,
    43200,
    '综合：proxy-providers prepend 生效',
  );
  assert(
    result['proxy-groups'][0].name,
    'AI',
    '综合：proxy-groups prepend 生效',
  );
  assert(
    result.proxies[0].name,
    'New-Node',
    '综合：proxies prepend 生效',
  );
  assert(
    result.rules[0],
    'RULE-SET,AI,AI',
    '综合：rules prepend 生效',
  );
  assert(
    result.extensions,
    undefined,
    '综合：extensions 已被删除',
  );
});


// ─── 测试 8：remove 两种格式兼容 ───────────────────────────
describe('remove 多种格式兼容', () => {
  // 对象类型：remove 接受数组或对象
  assert(
    (() => {
      const c = {
        'rule-providers': { A: {}, B: {}, C: {} },
        extensions: { 'rule-providers': { remove: ['A', 'B'] } },
      };
      const r = main(clone(c));
      return Object.keys(r['rule-providers']);
    })(),
    ['C'],
    '对象类型 remove 接受字符串数组',
  );

  assert(
    (() => {
      const c = {
        'rule-providers': { A: {}, B: {}, C: {} },
        extensions: { 'rule-providers': { remove: { A: null, B: null } } },
      };
      const r = main(clone(c));
      return Object.keys(r['rule-providers']);
    })(),
    ['C'],
    '对象类型 remove 接受对象',
  );

  // 对象数组类型：remove 接受字符串数组或对象数组
  assert(
    (() => {
      const c = {
        'proxy-groups': [
          { name: 'A' }, { name: 'B' }, { name: 'C' },
        ],
        extensions: { 'proxy-groups': { remove: ['A', 'B'] } },
      };
      const r = main(clone(c));
      return r['proxy-groups'].map((x) => x.name);
    })(),
    ['C'],
    '对象数组类型 remove 接受字符串数组',
  );

  assert(
    (() => {
      const c = {
        'proxy-groups': [
          { name: 'A' }, { name: 'B' }, { name: 'C' },
        ],
        extensions: { 'proxy-groups': { remove: [{ name: 'A' }, { name: 'B' }] } },
      };
      const r = main(clone(c));
      return r['proxy-groups'].map((x) => x.name);
    })(),
    ['C'],
    '对象数组类型 remove 接受对象数组',
  );
});


// ─── 测试 9：rules replace 无效格式 ────────────────────────
describe('rules replace 无效格式处理', () => {
  // 传入无效的 replace 项（不是 {old, new} 格式）应被跳过
  const baseConfig = {
    rules: ['RULE-1', 'RULE-2'],
    extensions: {
      rules: {
        replace: [
          // 有效的
          { old: 'RULE-1', new: 'RULE-1-NEW' },
          // 无效的（字符串而非对象）
          'INVALID_STRING',
          // 无效的（缺少 new 字段）
          { old: 'RULE-2' },
        ],
      },
    },
  };

  const result = main(clone(baseConfig));
  const rules = result.rules;

  assert(
    rules.includes('RULE-1-NEW'),
    true,
    '有效 replace 项生效',
  );
  assert(
    rules.includes('RULE-1'),
    false,
    'RULE-1 已被替换',
  );
  // 无效项不应影响结果
  assert(
    rules.length,
    2,
    '无效项被跳过，总规则数为 2',
  );
});


// ─── 测试 10：extensions 中各资源类型缺失 ──────────────────
describe('extensions 子字段缺失', () => {
  // 只定义了部分资源类型
  const baseConfig = {
    'rule-providers': { A: { type: 'http' } },
    rules: ['MATCH,Proxy'],
    extensions: {
      // 只定义 rules，不定义 rule-providers
      rules: {
        prepend: ['RULE-SET,AI,AI'],
      },
    },
  };

  const result = main(clone(baseConfig));

  assert(
    result.rules[0],
    'RULE-SET,AI,AI',
    'rules prepend 生效',
  );
  assert(
    result['rule-providers'].A.type,
    'http',
    'rule-providers 未受影响',
  );
});


// ─── 结果汇总 ──────────────────────────────────────────────
console.log('\n' + '='.repeat(48));
console.log(`总测试: ${passed + failed}  |  通过: ${passed}  |  失败: ${failed}`);
console.log('='.repeat(48));

if (failed > 0) {
  process.exit(1);
}