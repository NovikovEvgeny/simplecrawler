import { Crawler } from "../../src";

export async function waitForCrawler(crawler: Crawler, timeout: number = 5000) {
  let timeoutId: NodeJS.Timeout;

  const promise1 = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      crawler.stop(true);
      crawler.removeAllListeners();
      reject(`crawler job did not finished within ${timeout} ms`);
    }, timeout);
  });

  const promise2 = new Promise<void>((resolve) => {
    crawler.on("complete", () => {
      clearTimeout(timeoutId);
      crawler.removeAllListeners();
      resolve();
    });
  });

  return Promise.race([promise1, promise2]);
}
