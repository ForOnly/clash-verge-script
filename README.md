# Clash Verge Rev 全局扩展脚本

> 通过自定义 DSL 声明式扩展 Clash 配置，支持 prepend / append / replace / remove 四种操作。

---

## 目录

- [背景与问题](#背景与问题)
- [DSL 说明](#dsl-说明)
- [支持哪些资源类型](#支持哪些资源类型)
- [支持哪些操作](#支持哪些操作)
- [操作行为详解](#操作行为详解)
- [完整示例](#完整示例)
- [使用方法](#使用方法)
- [设计思路](#设计思路)
- [扩展方法](#扩展方法)
  - [新增资源类型](#新增资源类型)
  - [新增操作类型](#新增操作类型)
  - [新增数据结构策略](#新增数据结构策略)
- [架构总览](#架构总览)
- [注意事项](#注意事项)

---

## 背景与问题

Clash Verge Rev 提供了 **Global Override Config** 功能，允许用户覆盖最终的 Clash 配置。但该功能**不支持** `prepend` / `append`／`replace`／`remove` 这类声明式操作，导致用户必须手动维护完整的配置值。

例如：当用户只想在已有 `proxy-groups` 列表的**开头**插入一个策略组时，Global Override Config 无法实现。用户只能覆写整个 `proxy-groups` 字段。

本脚本通过 **Global Extension Script** 机制，在 Clash Verge Rev 调用 `main(config)` 时拦截配置对象，解析 `config.extensions` 中声明的 DSL，自动执行相应的操作。

---

## DSL 说明

DSL 位于配置的 `extensions` 字段下，结构为：

```yaml
extensions:
  <资源类型>:
    <操作类型>: <操作数据>
```

### 完整结构

```yaml
extensions:
  # ---- 对象类型（key-value） ----
  rule-providers:
    prepend: { ... }    # 合并到已有对象，不覆盖已有 key
    append: { ... }     # 同 prepend（对象无顺序概念）
    replace: { ... }    # 按 key 覆盖或新增
    remove: [...]       # 按 key 列表删除

  proxy-providers:
    prepend: { ... }
    append: { ... }
    replace: { ... }
    remove: [...]

  # ---- 对象数组类型（带 name 字段） ----
  proxy-groups:
    prepend: [...]      # 插入到数组开头，按 name 去重
    append: [...]       # 追加到数组末尾，按 name 去重
    replace: [...]      # 按 name 替换或新增
    remove: [...]       # 按 name 列表删除

  proxies:
    prepend: [...]
    append: [...]
    replace: [...]
    remove: [...]

  # ---- 字符串数组类型 ----
  rules:
    prepend: [...]      # 插入到数组开头，字符串去重
    append: [...]       # 追加到数组末尾，字符串去重
    replace: [...]      # [{ old: "...", new: "..." }] 格式
    remove: [...]       # 按字符串精确匹配删除
```

---

## 支持哪些资源类型

| 资源类型 | 配置字段 | 数据结构 | 唯一标识 |
|---------|---------|---------|---------|
| rule-providers | `config['rule-providers']` | 对象 `{ "key": definition }` | 对象的 key |
| proxy-providers | `config['proxy-providers']` | 对象 `{ "key": definition }` | 对象的 key |
| proxy-groups | `config['proxy-groups']` | 对象数组 `[{ name, ... }]` | `item.name` |
| proxies | `config['proxies']` | 对象数组 `[{ name, ... }]` | `item.name` |
| rules | `config['rules']` | 字符串数组 `["RULE-SET,..."]` | 字符串自身 |

---

## 支持哪些操作

| 操作 | 说明 | 去重 | 执行顺序 |
|------|------|------|---------|
| prepend | 插入到目标头部 | 自动跳过已存在的条目 | 第 1 步 |
| append | 追加到目标尾部 | 自动跳过已存在的条目 | 第 2 步 |
| replace | 按标识符替换，不存在则追加 | 查找时精确匹配标识符 | 第 3 步 |
| remove | 按标识符删除 | 匹配后删除 | 第 4 步 |

操作按 **prepend → append → replace → remove** 的顺序执行，避免逻辑冲突。

---

## 操作行为详解

### prepend / append

| 资源类型 | 行为 |
|---------|------|
| rule-providers / proxy-providers | 遍历扩展对象的 entries，仅当 `target` 中不存在该 key 时才设置值 |
| proxy-groups / proxies | 遍历扩展数组，仅当 `target` 中没有相同 `name` 的项时才插入 |
| rules | 遍历扩展数组，仅当 `target` 中没有相同字符串时才插入 |

### replace

| 资源类型 | 行为 | 格式 |
|---------|------|------|
| rule-providers / proxy-providers | 按 key 覆盖，不存在则新增 | 同 prepend 格式 |
| proxy-groups / proxies | 按 `name` 匹配替换，不存在则追加到末尾 | 普通策略组对象数组 |
| rules | 按旧字符串精确匹配，替换为新字符串，不存在则追加 | `[{ old: "旧规则", new: "新规则" }]` |

### remove

| 资源类型 | 支持格式 |
|---------|---------|
| rule-providers / proxy-providers | 数组 `["key1", "key2"]` 或对象 `{ key1: null }` |
| proxy-groups / proxies | 数组 `["name1", "name2"]` 或 `[{ name: "name1" }]` |
| rules | 数组 `["RULE-SET,AI,AI"]` |

---

## 完整示例

```yaml
extensions:
  # ---------- 规则集 ----------
  rule-providers:
    prepend:
      AI:
        type: http
        behavior: classical
        format: text
        interval: 86400
        path: ./ruleset/AI.list
        url: https://example.com/AI.list

    replace:
      Google:
        type: http
        behavior: classical
        format: text
        interval: 86400
        path: ./ruleset/Google.list
        url: https://example.com/Google.list

    remove:
      - DeprecatedProvider

  # ---------- 策略组 ----------
  proxy-groups:
    prepend:
      - name: AI
        type: select
        proxies:
          - 美国自动
          - 日本自动
          - 新加坡自动

    append:
      - name: 漏网之鱼
        type: select
        proxies:
          - DIRECT
          - 美国自动
          - 日本自动

    replace:
      - name: 全球直连
        type: select
        proxies:
          - DIRECT
          - 美国自动

    remove:
      - 旧策略组

  # ---------- 规则 ----------
  rules:
    prepend:
      - RULE-SET,AI,AI

    append:
      - DOMAIN-SUFFIX,example.com,DIRECT

    replace:
      - old: "DOMAIN-SUFFIX,google.com,Proxy"
        new: "DOMAIN-SUFFIX,google.com,DIRECT"

    remove:
      - DOMAIN-SUFFIX,old-service.com,Proxy
```

---

## 使用方法

1. 打开 Clash Verge Rev → 设置 → 扩展脚本（Global Extension Script）
2. 将 `src/clash-verge-extension-script.js` 的内容粘贴到脚本编辑器中
3. 在 `config.yaml` 或 Override Config 中添加 `extensions` 字段，按 DSL 格式声明配置
4. 保存并重启 Clash Verge Rev（或重载配置）

脚本会自动：
- 检测 `config.extensions` 是否存在
- 按类型和操作依次执行
- 自动清理 `extensions` 字段（不会出现在最终配置中）
- 异常时保持原有配置不变

---

## 设计思路

### 为什么采用策略模式 + 处理器模式？

Clash 的 5 种资源类型可以归纳为 **3 种数据结构**：

1. **纯对象**：`rule-providers`、`proxy-providers`（key-value 对象）
2. **对象数组**：`proxy-groups`、`proxies`（含 `name` 字段的对象数组）
3. **字符串数组**：`rules`（纯字符串数组）

3 种数据结构 × 4 种操作 = 12 种不同的行为。

如果用 `if/else` 或 `switch` 处理这些组合，代码会迅速退化为难以维护的意大利面条。策略模式将每种数据结构的 4 种操作封装为独立的策略对象，处理器模式则通过统一的接口调度执行。

### 核心优势

| 原则 | 实现方式 |
|------|---------|
| **单一职责** | 每个策略对象只负责一种数据结构的操作 |
| **开闭原则** | 新增资源类型只需添加映射条目，无需修改现有策略代码 |
| **里氏替换** | 所有策略实现相同的接口签名 |
| **依赖倒置** | main() 依赖抽象的策略接口，而非具体实现 |

### 为什么对象类型的 prepend 和 append 行为相同？

JavaScript 对象的属性没有可靠的顺序保证。Clash YAML 最终会被解析为普通对象，因此在对象上区分 prepend 和 append 没有实际意义。两者行为一致：仅添加不存在的 key。

### 为什么 rules 的 replace 使用 {old, new} 格式？

因为规则的唯一标识是字符串本身。如果 replace 只传新字符串：

```yaml
rules:
  replace:
    - RULE-SET,AI,DIRECT
```

脚本无法判断这是新的规则还是替换目标。使用 `{old, new}` 格式明确区分了"替换谁"和"替换成什么"。

### 异常隔离设计

每种资源类型的每种操作都有独立的 `try-catch`。这意味着：
- `rules.append` 失败不会影响 `rules.remove`
- `proxy-groups.replace` 失败不会影响 `rule-providers.prepend`
- 任何异常都不会导致整个配置失效

---

## 扩展方法

### 新增资源类型

假设要新增 `dns` 资源类型支持（对象类型）：

**步骤 1：** 在 `RESOURCE_TYPES` 中添加常量

```js
const RESOURCE_TYPES = Object.freeze({
  // ... 现有类型 ...
  DNS: 'dns',
});
```

**步骤 2：** 在 `REGISTRY` 中添加映射

```js
const REGISTRY = Object.freeze({
  // ... 现有映射 ...
  [RESOURCE_TYPES.DNS]: {
    strategy: ObjectStrategy,
    dataType: DATA_TYPES.OBJECT,
  },
});
```

完成。无需修改任何其他代码。

### 新增操作类型

假设要新增 `mergeDeep` 操作（深度合并）：

**步骤 1：** 在 `OPERATION_TYPES` 中添加常量

```js
const OPERATION_TYPES = Object.freeze({
  // ... 现有操作 ...
  MERGE_DEEP: 'merge-deep',
});
```

**步骤 2：** 在 `OPERATION_ORDER` 中添加执行顺序

```js
const OPERATION_ORDER = Object.freeze([
  OPERATION_TYPES.PREPEND,
  OPERATION_TYPES.APPEND,
  OPERATION_TYPES.MERGE_DEEP,  // 在 replace 之前
  OPERATION_TYPES.REPLACE,
  OPERATION_TYPES.REMOVE,
]);
```

**步骤 3：** 在三个策略对象中各添加同名方法

```js
const ObjectStrategy = Object.freeze({
  // ... 现有方法 ...
  [OPERATION_TYPES.MERGE_DEEP](target, items) {
    // 深度合并实现
    return target;
  },
});
```

### 新增数据结构策略

假设要新增自定义类型（如 `Set` 类型）：

**步骤 1：** 新建策略对象

```js
const SetStrategy = Object.freeze({
  prepend(target, items) { /* Set 特有实现 */ },
  append(target, items) { /* Set 特有实现 */ },
  replace(target, items) { /* Set 特有实现 */ },
  remove(target, items) { /* Set 特有实现 */ },
});
```

**步骤 2：** 在 `DATA_TYPES` 中添加新类型

```js
const DATA_TYPES = Object.freeze({
  // ... 现有类型 ...
  SET: 'set',
});
```

**步骤 3：** 在 `REGISTRY` 中注册新资源

```js
[RESOURCE_TYPES.CUSTOM]: {
  strategy: SetStrategy,
  dataType: DATA_TYPES.SET,
},
```

---

## 架构总览

```
config.extensions
       │
       ▼
   main(config)
       │
       ├── validateConfig()          ← 校验顶层配置
       ├── validateExtensions()      ← 校验扩展字段
       │
       ├── processResourceType()     ← 逐类型循环
       │   │
       │   ├── ensureTargetField()   ← 确保目标字段存在
       │   │
       │   ├── entry.strategy.prepend()    ─┐
       │   ├── entry.strategy.append()      │  ← 策略对象分发
       │   ├── entry.strategy.replace()     │
       │   └── entry.strategy.remove()      ─┘
       │
       ├── delete config.extensions  ← 清理扩展配置
       │
       └── return config             ← 返回最终配置
```

### 文件结构

```
clash-verge-script/
├── README.md
├── example.yaml
├── src/
│   └── clash-verge-extension-script.js    ← 唯一产物
└── test/
    └── test.js                             ← 单元验证脚本
```

### 模块划分（单文件内 9 个模块）

| 模块 | 职责 | 核心导出口 |
|------|------|-----------|
| Module 1 - Logger | 统一日志输出 | `Logger.{info, warn, error}` |
| Module 2 - Constants | Magic string 管理 | `RESOURCE_TYPES`, `OPERATION_TYPES` 等 |
| Module 3 - Validation | 数据校验 | `validateConfig`, `validateExtensions` |
| Module 4 - Identity | 标识符提取 | `getIdentityForType` |
| Module 5 - ObjectStrategy | 对象类型操作实现 | `ObjectStrategy.{prepend, append, replace, remove}` |
| Module 6 - ArrayOfObjectsStrategy | 对象数组操作实现 | `ArrayOfObjectsStrategy.{prepend, append, replace, remove}` |
| Module 7 - ArrayOfStringsStrategy | 字符串数组操作实现 | `ArrayOfStringsStrategy.{prepend, append, replace, remove}` |
| Module 8 - Registry | 类型 → 策略映射 | `REGISTRY`, `processResourceType` |
| Module 9 - Main | 入口函数 | `main(config)` |

---

## 注意事项

1. **脚本兼容性**：本脚本使用标准 ES6+ 语法，适用于 Clash Verge Rev v1.5+ 的扩展脚本引擎
2. **extensions 会被自动删除**：脚本执行完毕后 `config.extensions` 会被删除，不会出现在最终配置中
3. **错误隔离**：单个操作异常不会影响其他操作，日志会输出错误信息供排查
4. **去重规则**：prepend/append 自动去重，replace 允许覆盖，remove 多次删除安全
5. **对象无顺序**：`rule-providers` 和 `proxy-providers` 的 prepend/append 行为一致
6. **rules replace 必须使用 {old, new} 格式**：其他格式会被忽略并记录警告日志