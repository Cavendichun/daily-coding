/**
 * 要保证仅针对被修改的子树进行替换，其他还保持原来的引用的话，
 * 就需要记下来修改过了哪些对象，和修改前后是什么样子，
 * 所以方案是保持原对象source不变，修改对象前，对被修改的对象做浅拷贝，修改这个拷贝对象
 * 并且需要记录下访问过哪些路径，方便后续比对
 */

/**
 * 传入原数据，进行任意修改，返回新数据，
 * 如果传入的数据为嵌套对象或嵌套数组的话，
 * 保证没有被改动过的部分还保持原来的引用
 * @param {object} source 原始的数据结构
 * @param {function} action 修改的动作
 * @returns {object}
 */
function produce(source, action) {
  /**
   * 所有被访问过的对象都存在这里, 对应捕获器的get操作
   * 比如做a.b.c = 1的赋值操作的时候，a和b都是对象，那么proxyRecord里就存入a和b，如 a => Proxy(a)
   * 做a.b.c的访问操作同理，也存储一下
   * 后面可以判断这个map，如果某个节点不在这个map里，就说明没有访问到，那么他的子树当然也不会被修改
   */
  const proxyRecords = new WeakMap();

  /**
   * 对某个对象进行确切的修改时，保存一份浅拷贝
   * 如果某个节点在这里，就说明被修改过，生成结果时，替换结果树对应节点
   */
  const copyRecords = new WeakMap();

  // 代理捕获器
  const proxyHandler = {
    get(target, prop) {
      // 每次访问都返回一个新代理
      return createProxy(target[prop]);
    },
    set(target, prop, value) {
      // 用拷贝出来的对象来修改，不影响原对象
      const copy = createShallowCopy(target);
      copy[prop] = value;
      return true;
    },
  };

  /**
   * 创建一个proxy对象并存储值proxyRecord中
   * @param {any} o
   * @returns {object} 代理对象
   */
  function createProxy(o) {
    /**
     * 任何经过get捕获器的节点都会进到这里
     * 所以这个节点可能时任何类型
     * 除了朴素对象和数组，其他的都直接返回，不做代理
     */
    if (!isPlainObject(o) && !Array.isArray(o)) return o;

    // 如果proxyRecord里已存在的话，直接返回，否则创建一份存进去
    if (proxyRecords.has(o)) return proxyRecords.get(o);

    const oProxy = new Proxy(o, proxyHandler);
    proxyRecords.set(o, oProxy);

    return oProxy;
  }

  /**
   * 给对象创建一份浅拷贝放进copyRecords里
   * @param {*} o
   * @return {obj} 浅拷贝对象
   */
  function createShallowCopy(o) {
    // 如果copyRecord里已存在的话，直接返回，否则创建一份存进去
    if (copyRecords.has(o)) return copyRecords.get(o);

    // 区分两种类型
    const oCopy = Array.isArray(o) ? [...o] : { ...o };
    copyRecords.set(o, oCopy);

    return oCopy;
  }

  /**
   * 扫描原数据，看下一层节点有没有被修改过，如果有，则替换；没有，则直接返回
   * @param {any} o 原数据中的节点
   */
  function finalize(o) {
    /**
     * 如果不是朴素对象或数组，则直接返回，修改则为直接切断与变量的联系
     * 如果proxyRecords中没有这个节点，说明没有被访问过，自然没有被修改过
     */
    if (
      (!isPlainObject(o) && !Array.isArray(o)) ||
      !proxyRecords.has(o) ||
      !hasChanged(o)
    ) {
      return o;
    }

    /**
     * 不满足上面的情况说明：自己或所有子树有任意一个被修改
     * 所以先生成一个自己的浅拷贝
     * 再一层一层的递归
     */
    const oCopy = createShallowCopy(o);

    // 区分两种情况
    if (isPlainObject(oCopy)) {
      const keys = Reflect.ownKeys(oCopy);
      for (const k of keys) {
        oCopy[k] = finalize(oCopy[k]);
      }
    }

    if (Array.isArray(oCopy)) {
      for (let i = 0; i < oCopy.length; i++) {
        oCopy[i] = finalize(oCopy[i]);
      }
    }

    return oCopy;
  }

  /**
   * 判断朴素对象和数组有没有被修改过，被修改过的概念为：自己或所有子树有任意一个被修改
   * @param {*} o 任何数据对象
   */
  function hasChanged(o) {
    // 如果存在copyRecord里，则被直接修改过
    if (copyRecords.has(o)) {
      return true;
    }
    // 区分朴素对象和数组
    if (isPlainObject(o)) {
      // 用reflect，可以保留symbol类型key
      const keys = Reflect.ownKeys(o);
      for (const k of keys) {
        if (hasChanged(o[k])) return true;
      }
    }

    if (Array.isArray(o)) {
      for (const item of o) {
        if (hasChanged(o)) return true;
      }
    }

    // 其他情况直接切断即可
    return false;
  }

  // 使用者实际操作的是被代理的对象，原对象一直没变
  const sourceProxy = createProxy(source);

  action(sourceProxy);

  return finalize(source);
}

/**
 * 工具函数：判断传入参数是否为朴素对象，
 * 朴素对象的意思是：字面量对象（不包含null、数组、高级对象，如Date、RegExp等）
 * @param {any} o 判断的对象
 * @returns {boolean} 是否为朴素对象
 */
function isPlainObject(o) {
  if (
    typeof o !== "object" ||
    null === "object" ||
    Array.isArray(o) ||
    Object.getPrototypeOf(o) !== Object.prototype
  ) {
    return false;
  }
  return true;
}
