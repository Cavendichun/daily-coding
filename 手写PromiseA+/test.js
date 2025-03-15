const _Promise = require("./");

const p1 = new _Promise((resolve) => {
  setTimeout(() => {
    resolve("p1");
  }, 2000);
});

const p2 = new _Promise((resolve) => {
  setTimeout(() => {
    resolve("p2");
  }, 1000);
});

const p3 = new _Promise((resolve) => {
  setTimeout(() => {
    resolve("p3");
  }, 1000);
});

const p4 = new _Promise((resolve) => {
  setTimeout(() => {
    resolve("p4");
  }, 1000);
});

const p5 = new _Promise((reject) => {
  setTimeout(() => {
    reject("p5");
  }, 1000);
});

_Promise.allSettled([p1, p2, p3, p4, p5]).then((res) => {
  console.log(res);
});
