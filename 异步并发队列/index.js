class TaskQueue {
  // 最大并发数
  #maxConcurency;
  // 剩余任务队列
  #restTasks = [];
  // 正在执行的任务队列
  #runningTasks = new Map();
  // 是否暂停
  #IS_PAUSE = false;

  constructor({ maxConcurency = 1 }) {
    this.#maxConcurency = maxConcurency;
    this.#init();
  }

  #init() {
    const _this = this;

    // 监听剩余任务队列的push事件，触发后，尝试填满正在执行队列
    Reflect.defineProperty(this.#restTasks, "push", {
      value(...args) {
        Array.prototype.push.call(this, ...args);
        _this.#tryFillRunningTasks();
      },
      enumerable: false,
    });

    // 监听正在执行队列的delete事件，触发后，尝试填满正在执行队列
    Reflect.defineProperty(this.#runningTasks, "delete", {
      value(...args) {
        Map.prototype.delete.call(this, ...args);
        _this.#tryFillRunningTasks();
      },
      enumerable: false,
    });
  }

  /**
   * 尝试填满正在执行任务队列
   * 当正在执行任务数<最大并发数的时候，就可以填满
   * 反之什么都不做
   */
  #tryFillRunningTasks() {
    // 如果是暂停状态，什么都不做
    if (this.#IS_PAUSE) return false;

    while (this.#runningTasks.size < this.#maxConcurency) {
      // 没有挤压任务了，直接返回
      if (this.#restTasks.length <= 0) return false;
      // 取出前面第一个任务，放入执行队列中
      const next = this.#restTasks.shift();
      this.#runningTasks.set(next, this.#createPromise(next));
    }
  }

  /**
   * 创建一个立即执行的Promise
   * 不管成功还是失败，都要从正在执行队列中清除，不能阻塞后续任务
   */
  #createPromise(task) {
    return new Promise(async (resolve, reject) => {
      try {
        await task();
        resolve();
      } catch (error) {
        reject(error);
      }
      this.#runningTasks.delete(task);
    });
  }

  // 添加任务就是单纯的向剩余任务队列里push一个，其他的工作由队列自己完成
  add(task) {
    this.#restTasks.push(task);
  }

  // 暂停
  pause() {
    this.#IS_PAUSE = true;
  }

  // 继续
  continue() {
    // 没有暂停，不需要执行第二次
    if (!this.#IS_PAUSE) return false;
    this.#IS_PAUSE = false;
    this.#tryFillRunningTasks();
  }
}
