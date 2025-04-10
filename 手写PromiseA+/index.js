// 三种内置状态
const PROMISE_STATUS = {
  PENDING: "pending",
  FULFILLED: "fulfilled",
  REJECTED: "rejected",
};

// 因为promise A+规范中，成功和失败的回调函数要放在为队列中执行，所以提供一个创建微任务的方法
function createMicroTask(fn) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
  } else if (typeof process?.nextTick === "function") {
    process.nextTick(fn);
  } else if (typeof MutationObserver === "function") {
    const ele = document.createTextNode();
    const observer = new MutationObserver(fn);
    observer.observe(ele, {
      characterData: true,
    });
    ele.data = "1";
  } else {
    setTimeout(fn);
  }
}

class _Promise {
  // 当前状态，默认为PENDING
  #state = PROMISE_STATUS.PENDING;
  // 成功的结果
  #result;
  // 失败的原因
  #reason;
  // 成功回调队列
  #onFulfilledCallbacks = [];
  // 拒绝回调队列
  #onRejectedCallbacks = [];

  constructor(executor) {
    if (typeof executor !== "function") {
      throw new TypeError(`_Promise executor is not a function`);
    }
    // 立即运行执行器
    try {
      executor(this.#resolve.bind(this), this.#reject.bind(this));
    } catch (error) {
      // 执行器里如果报错了，直接拒绝
      this.#reject(error);
    }
  }

  // 成功后的回调
  #resolve(result) {
    // 只有当处于等待状态的时候，才能转换状态，转换后不能改变
    if (this.#state !== PROMISE_STATUS.PENDING) return;
    this.#result = result;
    this.#state = PROMISE_STATUS.FULFILLED;
    // 执行所有暂存的成功回调
    while (this.#onFulfilledCallbacks.length) {
      this.#onFulfilledCallbacks.shift()(this.#result);
    }
  }

  // 拒绝后的回调
  #reject(reason) {
    // 只有当处于等待状态的时候，才能转换状态，转换后不能改变
    if (this.#state !== PROMISE_STATUS.PENDING) return;
    this.#reason = reason;
    this.#state = PROMISE_STATUS.REJECTED;
    // 执行所有暂存的拒绝回调
    while (this.#onRejectedCallbacks.length) {
      this.#onRejectedCallbacks.shift()(this.#reason);
    }
  }

  // 把then方法返回的结果，包装成新的promise
  #resolveNextPromise(promise, value, resolve, reject) {
    // A+规范，不允许自己返回自己，会死循环
    if (promise === value) {
      throw new TypeError("No cycle chaining");
    }
    // 如果value是一个thenable的参数（promiseLike）
    if (
      (typeof value === "object" || typeof value === "function") &&
      null !== value
    ) {
      let HAS_CALLED = false;
      try {
        const then = value.then;
        if (typeof then === "function") {
          then.call(
            value,
            (result) => {
              if (HAS_CALLED) return;
              HAS_CALLED = true;
              this.#resolveNextPromise(promise, result, resolve, reject);
            },
            (reason) => {
              if (HAS_CALLED) return;
              HAS_CALLED = true;
              reject(reason);
            }
          );
        } else {
          if (HAS_CALLED) return;
          HAS_CALLED = true;
          resolve(value);
        }
      } catch (error) {
        if (HAS_CALLED) return;
        HAS_CALLED = true;
        reject(error);
      }
    } else {
      resolve(value);
    }
  }

  // 注册成功和失败的回调
  then(onFulfilled, onRejected) {
    // 如果onFulfilled不是函数，默认返回promise的结果
    if (typeof onFulfilled !== "function") {
      onFulfilled = (result) => {
        return result;
      };
    }
    // 如果onRejected不是函数，默认抛出promise错误的原因
    if (typeof onRejected !== "function") {
      onRejected = (reason) => {
        throw reason;
      };
    }

    /**
     * 每个then方法必须返回一个promise
     * 执行onFulfilled或onRejected方法，得到一个结果或undefined
     * 把这个参数包装成新的promise
     */
    const nextPromise = new _Promise((resolve, reject) => {
      // 三种不同的状态处理方式不同
      switch (this.#state) {
        // 如果注册方法时，promies已经成功，直接执行onFulfilled
        case PROMISE_STATUS.FULFILLED:
          // 按照A+规范，then方法会把回调传进微队列中，下面同理
          createMicroTask(() => {
            try {
              const value = onFulfilled(this.#result);
              this.#resolveNextPromise(nextPromise, value, resolve, reject);
            } catch (error) {
              reject(error);
            }
          });
          break;
        // 如果注册方法时，promies已经拒绝，直接执行onRejected
        case PROMISE_STATUS.REJECTED:
          createMicroTask(() => {
            try {
              const value = onRejected(this.#reason);
              this.#resolveNextPromise(nextPromise, value, resolve, reject);
            } catch (error) {
              reject(error);
            }
          });
          break;
        // 如果注册方法时，promise仍然是等待状态（执行器异步），则把方法推入两个回调队列中
        case PROMISE_STATUS.PENDING:
          this.#onFulfilledCallbacks.push(() => {
            createMicroTask(() => {
              try {
                const value = onFulfilled(this.#result);
                this.#resolveNextPromise(nextPromise, value, resolve, reject);
              } catch (error) {
                reject(error);
              }
            });
          });
          this.#onRejectedCallbacks.push(() => {
            createMicroTask(() => {
              try {
                const value = onRejected(this.#reason);
                this.#resolveNextPromise(nextPromise, value, resolve, reject);
              } catch (error) {
                reject(error);
              }
            });
          });
          break;
        default:
          break;
      }
    });

    return nextPromise;
  }

  // ES6的catch方法
  catch(onRejected) {
    return this.then(null, onRejected);
  }

  /**
   * ES6的finally方法
   * callback不接受参数
   * 并且finall会把值穿透到下一层
   */
  finally(callback) {
    return this.then(
      (result) => {
        callback();
        return result;
      },
      (reason) => {
        callback();
        throw reason;
      }
    );
  }

  /**
   * 静态方法_Promise.resolve
   * 传入的值有三种情况
   * 1. 是当前类的实例
   * 2. 符合promiseA+标准的thenable对象
   * 3. 普通值
   */
  static resolve(value) {
    if (value instanceof _Promise) {
      return value;
    }
    return new _Promise((resolve, reject) => {
      if (
        (typeof value === "object" || typeof value === "function") &&
        value !== null
      ) {
        try {
          const then = value.then;
          if (typeof then === "function") {
            then.call(value, resolve, reject);
          } else {
            resolve(value);
          }
        } catch (error) {
          reject(error);
        }
      } else {
        resolve(value);
      }
    });
  }

  // 静态方法
  static reject(value) {
    return new _Promise((_, reject) => {
      reject(value);
    });
  }

  // 静态方法
  static all(target) {
    return new _Promise((resolve, reject) => {
      let restNum = 0;
      const results = [];

      for (const item of target) {
        const index = restNum++;
        _Promise.resolve(item).then((res) => {
          results[index] = res;
          restNum--;
          if (!restNum) {
            resolve(results);
          }
        }, reject);
      }

      if (restNum === 0) {
        resolve([]);
      }
    });
  }

  // 静态方法
  static race(target) {
    return new _Promise((resolve, reject) => {
      for (const item of target) {
        _Promise.resolve(item).then((res) => {
          resolve(res);
        }, reject);
      }
    });
  }

  // 静态方法

  static allSettled(target) {
    return new _Promise((resolve) => {
      let restNum = 0;
      const results = [];

      for (const item of target) {
        const index = restNum++;
        _Promise.resolve(item).then(
          (result) => {
            results[index] = {
              status: PROMISE_STATUS.FULFILLED,
              value: result,
            };
            restNum--;
            if (restNum === 0) {
              resolve(results);
            }
          },
          (reason) => {
            results[index] = {
              status: PROMISE_STATUS.REJECTED,
              reason,
            };
            restNum--;
            if (restNum === 0) {
              resolve(results);
            }
          }
        );
      }

      if (restNum === 0) {
        resolve([]);
      }
    });
  }
}
