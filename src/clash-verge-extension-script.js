/**
 * =====================================================================
 * Clash Verge Rev 全局扩展脚本
 * ---------------------------------------------------------------------
 * 本脚本通过自定义 DSL（位于 config.extensions）实现对 Clash 配置的
 * 声明式操作，支持 5 种资源类型 × 4 种操作（prepend / append / replace / remove）。
 *
 * @author  AI Assistant
 * @version 1.0.0
 * @license MIT
 *
 * 设计模式：策略模式（Strategy Pattern）+ 处理器模式（Processor Pattern）
 * 三种数据策略：对象策略、对象数组策略、字符串数组策略
 * =====================================================================
 */

'use strict';

/* ============================================================== *
 *  Module 1: 日志系统                                              *
 *  提供统一的日志输出接口，便于调试和问题追踪                          *
 * ============================================================== */

/**
 * @namespace Logger
 * @description 日志工具，输出带前缀的格式化日志信息
 */
const Logger = Object.freeze({
  /**
   * 输出普通信息日志
   * @param {string} message - 日志消息
   * @param {...*} args - 附加参数
   */
  info(message, ...args) {
    console.log(`[Extensions] [INFO] ${message}`, ...args);
  },

  /**
   * 输出警告日志
   * @param {string} message - 警告消息
   * @param {...*} args - 附加参数
   */
  warn(message, ...args) {
    console.warn(`[Extensions] [WARN] ${message}`, ...args);
  },

  /**
   * 输出错误日志
   * @param {string} message - 错误消息
   * @param {...*} args - 附加参数
   */
  error(message, ...args) {
    console.error(`[Extensions] [ERROR] ${message}`, ...args);
  },
});


/* ============================================================== *
 *  Module 2: 常量定义                                              *
 *  统一管理所有 Magic String，避免散落在代码各处                      *
 * ============================================================== */

/**
 * @enum {string}
 * @description 支持的资源类型常量
 */
const RESOURCE_TYPES = Object.freeze({
  /** 规则集提供者（对象类型） */
  RULE_PROVIDERS: 'rule-providers',
  /** 代理集提供者（对象类型） */
  PROXY_PROVIDERS: 'proxy-providers',
  /** 策略组（对象数组类型） */
  PROXY_GROUPS: 'proxy-groups',
  /** 代理节点（对象数组类型） */
  PROXIES: 'proxies',
  /** 规则列表（字符串数组类型） */
  RULES: 'rules',
});

/**
 * @enum {string}
 * @description 支持的操作类型常量
 */
const OPERATION_TYPES = Object.freeze({
  /** 插入到开头 */
  PREPEND: 'prepend',
  /** 追加到末尾 */
  APPEND: 'append',
  /** 按标识替换 */
  REPLACE: 'replace',
  /** 按标识移除 */
  REMOVE: 'remove',
});

/** @const {string} 扩展配置在 config 中的顶层 key */
const EXTENSIONS_KEY = 'extensions';

/** @const {string} 规则 replace 操作中表示旧规则的字段名 */
const RULE_OLD_KEY = 'old';

/** @const {string} 规则 replace 操作中表示新规则的字段名 */
const RULE_NEW_KEY = 'new';

/** @const {string} 策略组/代理节点的名称字段 */
const NAME_KEY = 'name';

/**
 * @enum {string}
 * @description 数据结构类型
 */
const DATA_TYPES = Object.freeze({
  /** key-value 对象结构 */
  OBJECT: 'object',
  /** 包含 name 字段的对象数组 */
  ARRAY_OF_OBJECTS: 'array-of-objects',
  /** 普通字符串数组 */
  ARRAY_OF_STRINGS: 'array-of-strings',
});

/** @const {string[]} 操作执行顺序：先新增，再替换，最后删除 */
const OPERATION_ORDER = Object.freeze([
  OPERATION_TYPES.PREPEND,
  OPERATION_TYPES.APPEND,
  OPERATION_TYPES.REPLACE,
  OPERATION_TYPES.REMOVE,
]);


/* ============================================================== *
 *  Module 3: 数据校验工具                                          *
 *  所有配置校验集中管理，保障脚本健壮性                                *
 * ============================================================== */

/**
 * 校验顶层 config 对象是否合法
 * @param {unknown} config - 待校验的配置对象
 * @returns {boolean} 校验通过返回 true
 */
function validateConfig(config) {
  if (config == null || typeof config !== 'object' || Array.isArray(config)) {
    Logger.warn('config 不是有效的对象，跳过扩展处理');
    return false;
  }
  return true;
}

/**
 * 校验 extensions 子段是否合法
 * @param {unknown} extensions - 待校验的扩展配置
 * @returns {boolean} 校验通过返回 true
 */
function validateExtensions(extensions) {
  if (extensions == null) {
    Logger.info('config 中不存在 extensions 字段，跳过扩展处理');
    return false;
  }
  if (typeof extensions !== 'object' || Array.isArray(extensions)) {
    Logger.warn('extensions 不是有效的对象，跳过扩展处理');
    return false;
  }
  return true;
}

/**
 * 校验某个资源类型的扩展配置是否合法
 * @param {string} type - 资源类型
 * @param {unknown} extensionConfig - 该资源类型下的扩展配置
 * @returns {boolean} 校验通过返回 true
 */
function validateResourceExtension(type, extensionConfig) {
  if (extensionConfig == null) {
    return false;
  }
  if (typeof extensionConfig !== 'object' || Array.isArray(extensionConfig)) {
    Logger.warn(`[${type}] 扩展配置不是有效的对象，已跳过`);
    return false;
  }
  return true;
}


/* ============================================================== *
 *  Module 4: 标识符提取器                                          *
 *  每种资源类型有唯一的标识字段，用于去重和查找                        *
 * ============================================================== */

/**
 * 提取资源条目的唯一标识符
 *
 * @param {string} type - 资源类型
 * @param {unknown} item - 资源条目
 * @returns {string} 唯一标识符
 *
 * @example
 * // 策略组：通过 name 字段标识
 * getIdentityForType('proxy-groups', { name: 'AI', type: 'select' }) // → 'AI'
 *
 * // 规则：字符串自身即为标识
 * getIdentityForType('rules', 'RULE-SET,AI,AI') // → 'RULE-SET,AI,AI'
 */
function getIdentityForType(type, item) {
  switch (type) {
    case RESOURCE_TYPES.RULE_PROVIDERS:
    case RESOURCE_TYPES.PROXY_PROVIDERS:
      // 对象类型的 key 就是标识
      return String(item);

    case RESOURCE_TYPES.PROXY_GROUPS:
    case RESOURCE_TYPES.PROXIES:
      // 对象数组类型通过 name 字段标识
      return item[NAME_KEY];

    case RESOURCE_TYPES.RULES:
      // 字符串数组类型，replace 时使用 old 字段，否则字符串自身
      if (typeof item === 'object' && item !== null) {
        return item[RULE_OLD_KEY];
      }
      return String(item);

    default:
      return String(item);
  }
}


/* ============================================================== *
 *  Module 5: 对象类型策略（ObjectStrategy）                          *
 *  适用于 rule-providers / proxy-providers 这类 key-value 对象结构    *
 * ----------------------------------------------------------------- *
 *  数据结构：{ "key": { ...definition } }                            *
 *  去重依据：对象的 key                                              *
 * ============================================================== */

/**
 * @namespace ObjectStrategy
 * @description 对象类型资源的操作策略实现
 */
const ObjectStrategy = Object.freeze({
  /**
   * 前置合并：遍历扩展中定义的 key，仅当目标中不存在时才添加
   *
   * @param {Record<string, unknown>} target - 目标对象（如 config['rule-providers']）
   * @param {Record<string, unknown>} items - 要合并的扩展对象
   * @returns {Record<string, unknown>} 处理后的目标对象
   */
  prepend(target, items) {
    const entries = Object.entries(items);
    for (const [key, value] of entries) {
      if (!(key in target)) {
        target[key] = value;
      }
    }
    return target;
  },

  /**
   * 追加合并：与 prepend 行为一致，因为对象属性没有顺序概念
   *
   * @param {Record<string, unknown>} target - 目标对象
   * @param {Record<string, unknown>} items - 要合并的扩展对象
   * @returns {Record<string, unknown>} 处理后的目标对象
   */
  append(target, items) {
    const entries = Object.entries(items);
    for (const [key, value] of entries) {
      if (!(key in target)) {
        target[key] = value;
      }
    }
    return target;
  },

  /**
   * 替换或新增：遍历扩展对象，直接覆盖目标中同 key 的值
   * 不存在则新增，存在则替换
   *
   * @param {Record<string, unknown>} target - 目标对象
   * @param {Record<string, unknown>} items - 替换用扩展对象
   * @returns {Record<string, unknown>} 处理后的目标对象
   */
  replace(target, items) {
    const entries = Object.entries(items);
    for (const [key, value] of entries) {
      target[key] = value;
    }
    return target;
  },

  /**
   * 移除：按 key 数组或对象 key 删除目标中的条目
   *
   * @param {Record<string, unknown>} target - 目标对象
   * @param {string[]|Record<string, unknown>} items - 要删除的 key 列表（数组或对象）
   * @returns {Record<string, unknown>} 处理后的目标对象
   */
  remove(target, items) {
    const keysToRemove = Array.isArray(items) ? items : Object.keys(items);
    for (const key of keysToRemove) {
      delete target[key];
    }
    return target;
  },
});


/* ============================================================== *
 *  Module 6: 对象数组类型策略（ArrayOfObjectsStrategy）              *
 *  适用于 proxy-groups / proxies 这类带 name 字段的对象数组           *
 * ----------------------------------------------------------------- *
 *  数据结构：[{ name: "AI", type: "select", ... }, ...]             *
 *  去重依据：item.name                                              *
 * ============================================================== */

/**
 * 从数组类型 remove 配置中提取标识符列表
 *
 * remove 配置可能有多种格式：
 *   - 字符串数组：["AI", "Proxy"] → 直接作为 name
 *   - 对象数组：  [{ name: "AI" }, { name: "Proxy" }] → 提取 name
 *
 * @param {Array<unknown>} items - remove 配置数组
 * @returns {string[]} 标识符列表
 */
function extractRemoveIdentifiers(items) {
  return items.map((item) => {
    if (typeof item === 'object' && item !== null && NAME_KEY in item) {
      return item[NAME_KEY];
    }
    return String(item);
  });
}

/**
 * @namespace ArrayOfObjectsStrategy
 * @description 对象数组类型资源的操作策略实现
 */
const ArrayOfObjectsStrategy = Object.freeze({
  /**
   * 前置插入：将扩展项插入目标数组开头，自动去重
   *
   * @param {Array<Record<string, unknown>>} target - 目标数组
   * @param {Array<Record<string, unknown>>} items - 要插入的扩展项
   * @returns {Array<Record<string, unknown>>} 处理后的目标数组
   */
  prepend(target, items) {
    const existingIds = new Set(target.map((item) => item[NAME_KEY]));
    const toAdd = items.filter((item) => !existingIds.has(item[NAME_KEY]));
    target.unshift(...toAdd);
    return target;
  },

  /**
   * 追加插入：将扩展项追加到目标数组末尾，自动去重
   *
   * @param {Array<Record<string, unknown>>} target - 目标数组
   * @param {Array<Record<string, unknown>>} items - 要追加的扩展项
   * @returns {Array<Record<string, unknown>>} 处理后的目标数组
   */
  append(target, items) {
    const existingIds = new Set(target.map((item) => item[NAME_KEY]));
    const toAdd = items.filter((item) => !existingIds.has(item[NAME_KEY]));
    target.push(...toAdd);
    return target;
  },

  /**
   * 替换或新增：按 name 查找目标项并替换
   * 存在则替换，不存在则追加到末尾
   *
   * @param {Array<Record<string, unknown>>} target - 目标数组
   * @param {Array<Record<string, unknown>>} items - 替换用扩展项
   * @returns {Array<Record<string, unknown>>} 处理后的目标数组
   */
  replace(target, items) {
    for (const item of items) {
      const index = target.findIndex(
        (existing) => existing[NAME_KEY] === item[NAME_KEY],
      );
      if (index >= 0) {
        target[index] = item;
      } else {
        target.push(item);
      }
    }
    return target;
  },

  /**
   * 移除：按 name 匹配删除目标中的条目
   *
   * @param {Array<Record<string, unknown>>} target - 目标数组
   * @param {Array<unknown>} items - 要移除的标识列表（字符串或对象数组）
   * @returns {Array<Record<string, unknown>>} 过滤后的新数组
   */
  remove(target, items) {
    const idsToRemove = new Set(extractRemoveIdentifiers(items));
    return target.filter((item) => !idsToRemove.has(item[NAME_KEY]));
  },
});


/* ============================================================== *
 *  Module 7: 字符串数组类型策略（ArrayOfStringsStrategy）           *
 *  适用于 rules 这类纯字符串数组                                      *
 * ----------------------------------------------------------------- *
 *  数据结构：["RULE-SET,AI,AI", "DOMAIN-SUFFIX,google.com,Proxy"]   *
 *  去重依据：字符串全等匹配                                          *
 *  注意：replace 使用 { old: string, new: string } 格式              *
 * ============================================================== */

/**
 * 校验规则 replace 项是否为合法的 {old, new} 格式
 *
 * @param {unknown} item - 待校验的替换项
 * @returns {boolean} 格式合法返回 true
 */
function isValidRuleReplaceItem(item) {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  return typeof item[RULE_OLD_KEY] === 'string' && typeof item[RULE_NEW_KEY] === 'string';
}

/**
 * @namespace ArrayOfStringsStrategy
 * @description 字符串数组类型资源的操作策略实现
 */
const ArrayOfStringsStrategy = Object.freeze({
  /**
   * 前置插入：将扩展规则插入目标数组开头，自动去重
   *
   * @param {string[]} target - 目标规则数组
   * @param {string[]} items - 要插入的规则
   * @returns {string[]} 处理后的目标数组
   */
  prepend(target, items) {
    const existingSet = new Set(target);
    const toAdd = items.filter((item) => !existingSet.has(item));
    target.unshift(...toAdd);
    return target;
  },

  /**
   * 追加插入：将扩展规则追加到目标数组末尾，自动去重
   *
   * @param {string[]} target - 目标规则数组
   * @param {string[]} items - 要追加的规则
   * @returns {string[]} 处理后的目标数组
   */
  append(target, items) {
    const existingSet = new Set(target);
    const toAdd = items.filter((item) => !existingSet.has(item));
    target.push(...toAdd);
    return target;
  },

  /**
   * 替换或新增：按旧规则精确匹配并替换为新规则
   *
   * 格式要求：items 中的每个元素必须是 { old: string, new: string }
   * 例如：{ old: "RULE-SET,AI,AI", new: "RULE-SET,AI,DIRECT" }
   *
   * 若 old 匹配到现有规则 → 替换为 new
   * 若 old 未匹配到 → 追加 new 到末尾
   *
   * @param {string[]} target - 目标规则数组
   * @param {Array<{old: string, new: string}>} items - 替换规则定义
   * @returns {string[]} 处理后的目标数组
   */
  replace(target, items) {
    for (const item of items) {
      if (!isValidRuleReplaceItem(item)) {
        Logger.warn(`rules replace 项格式无效，跳过：${JSON.stringify(item)}`);
        continue;
      }
      const index = target.indexOf(item[RULE_OLD_KEY]);
      if (index >= 0) {
        target[index] = item[RULE_NEW_KEY];
      } else {
        target.push(item[RULE_NEW_KEY]);
      }
    }
    return target;
  },

  /**
   * 移除：按字符串精确匹配删除目标中的规则
   *
   * @param {string[]} target - 目标规则数组
   * @param {string[]} items - 要移除的规则列表
   * @returns {string[]} 过滤后的新数组
   */
  remove(target, items) {
    const toRemove = new Set(items);
    return target.filter((item) => !toRemove.has(item));
  },
});


/* ============================================================== *
 *  Module 8: 处理器注册表 & 工厂                                   *
 *  将资源类型映射到对应的数据策略，提供统一的执行入口                    *
 * ----------------------------------------------------------------- *
 *  新增资源类型只需在 REGISTRY 中添加一条映射即可                      *
 *  新增操作类型只需在 Strategy 中添加同名方法即可                      *
 * ============================================================== */

/**
 * 资源类型 → 策略 & 元信息 的映射注册表
 *
 * @type {Record<string, {strategy: Readonly<object>, dataType: string}>}
 */
const REGISTRY = Object.freeze({
  [RESOURCE_TYPES.RULE_PROVIDERS]: {
    strategy: ObjectStrategy,
    dataType: DATA_TYPES.OBJECT,
  },
  [RESOURCE_TYPES.PROXY_PROVIDERS]: {
    strategy: ObjectStrategy,
    dataType: DATA_TYPES.OBJECT,
  },
  [RESOURCE_TYPES.PROXY_GROUPS]: {
    strategy: ArrayOfObjectsStrategy,
    dataType: DATA_TYPES.ARRAY_OF_OBJECTS,
  },
  [RESOURCE_TYPES.PROXIES]: {
    strategy: ArrayOfObjectsStrategy,
    dataType: DATA_TYPES.ARRAY_OF_OBJECTS,
  },
  [RESOURCE_TYPES.RULES]: {
    strategy: ArrayOfStringsStrategy,
    dataType: DATA_TYPES.ARRAY_OF_STRINGS,
  },
});

/**
 * 获取或初始化 config 中的目标字段
 *
 * @param {Record<string, unknown>} config - 完整配置对象
 * @param {string} type - 资源类型
 * @param {string} dataType - 数据结构类型（object / array-of-objects / array-of-strings）
 * @returns {Record<string, unknown>|Array<unknown>} 目标字段（确保存在）
 */
function ensureTargetField(config, type, dataType) {
  const target = config[type];

  if (target != null) {
    return target;
  }

  // 目标字段不存在时，根据数据类型初始化
  if (dataType === DATA_TYPES.OBJECT) {
    Logger.info(`[${type}] 目标字段不存在，初始化为空对象`);
    config[type] = {};
  } else {
    Logger.info(`[${type}] 目标字段不存在，初始化为空数组`);
    config[type] = [];
  }

  return config[type];
}

/**
 * 对单个资源类型执行所有扩展操作
 *
 * 按以下顺序处理：prepend → append → replace → remove
 * 每种操作独立 try-catch，某个操作失败不影响其他操作
 *
 * @param {Record<string, unknown>} config - 完整配置对象
 * @param {string} type - 资源类型
 * @param {Record<string, unknown>} operations - 该资源类型下的操作集合
 */
function processResourceType(config, type, operations) {
  const entry = REGISTRY[type];
  const target = ensureTargetField(config, type, entry.dataType);

  for (const opName of OPERATION_ORDER) {
    const items = operations[opName];

    // 跳过空操作（null / undefined / 空数组 / 空对象）
    if (items == null) {
      continue;
    }
    if (Array.isArray(items) && items.length === 0) {
      continue;
    }
    if (typeof items === 'object' && !Array.isArray(items) && Object.keys(items).length === 0) {
      continue;
    }

    try {
      const result = entry.strategy[opName](target, items);
      Logger.info(`[${type}] ${opName} 操作完成`);

      // 某些操作（如 remove）可能返回新数组，需要写回 config
      if (result !== target) {
        config[type] = result;
      }
    } catch (error) {
      Logger.error(`[${type}] ${opName} 操作异常`, error);
    }
  }
}


/* ============================================================== *
 *  Module 9: 入口函数 main                                         *
 *  脚本的唯一对外接口，供 Clash Verge Rev 调用                       *
 * ============================================================== */

/**
 * 脚本入口 —— Clash Verge Rev Global Extension 主函数
 *
 * 处理流程：
 *   1. 校验 config 合法性
 *   2. 校验 extensions 合法性
 *   3. 遍历所有注册的资源类型，逐一执行扩展操作
 *   4. 清理扩展配置（删除 config.extensions）
 *   5. 返回处理后的 config
 *
 * @param {Record<string, unknown>} config - Clash Verge Rev 最终配置对象
 * @returns {Record<string, unknown>} 处理后的配置对象
 */
function main(config) {
  // 第 1 步：校验顶层 config
  if (!validateConfig(config)) {
    return config;
  }

  // 第 2 步：校验 extensions
  const extensions = config[EXTENSIONS_KEY];
  if (!validateExtensions(extensions)) {
    return config;
  }

  // 第 3 步：遍历所有注册的资源类型，执行扩展操作
  const registeredTypes = Object.keys(REGISTRY);

  for (const type of registeredTypes) {
    const extensionConfig = extensions[type];

    if (!validateResourceExtension(type, extensionConfig)) {
      continue;
    }

    Logger.info(`开始处理 [${type}]`);
    processResourceType(config, type, extensionConfig);
  }

  // 第 4 步：清理扩展配置
  delete config[EXTENSIONS_KEY];
  Logger.info('extensions 字段已清理');

  // 第 5 步：返回处理后的配置
  return config;
}