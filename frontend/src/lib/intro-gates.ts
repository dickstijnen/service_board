let preloaderComplete = false;
const subscribers: Array<() => void> = [];

export function markPreloaderComplete() {
  preloaderComplete = true;
  subscribers.forEach((fn) => fn());
  subscribers.length = 0;
}

export function isPreloaderComplete() {
  return preloaderComplete;
}

export function subscribePreloaderComplete(callback: () => void) {
  if (preloaderComplete) {
    callback();
    return () => {};
  }
  subscribers.push(callback);
  return () => {
    const index = subscribers.indexOf(callback);
    if (index > -1) subscribers.splice(index, 1);
  };
}
