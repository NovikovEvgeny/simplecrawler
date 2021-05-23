/* eslint-env jest */
import "jest-extended";

import * as path from "path";
import * as os from "os";


import { Crawler } from "../../src";
import { waitForCrawler } from "../util/waitForCrawler";
import { QueueItem } from "../../src/types";

function makeCrawler(url: string): Crawler {
  const crawler = new Crawler(url);
  crawler.interval = 5;
  return crawler;
}

// Runs a very simple crawl on an HTTP server
describe("Crawler reliability", () => {
  it("should be able to be started, then stopped, then started again", async () => {
    const crawler = makeCrawler("http://127.0.0.1:3000/");
    let stopped = false;
    let counter = 0;

    crawler.on("crawlstart", () => {
      counter++;
      if (!stopped) {
        stopped = true;
        process.nextTick(() => {

          crawler.stop(true);
          crawler.start();
        });
      }
    });

    crawler.start();
    await waitForCrawler(crawler);
    expect(counter).toEqual(2);
  });

  it("should be able to handle a timeout", (done) => {
    const localCrawler = new Crawler("http://127.0.0.1:3000/timeout");
    localCrawler.timeout = 200;

    localCrawler.on("fetchtimeout", (queueItem) => {
      expect(queueItem).toBeObject();
      expect(queueItem).toMatchObject({
        url: "http://127.0.0.1:3000/timeout",
        fetched: true,
        status: "timeout"
      });
      localCrawler.stop(true);
      done();
    });

    localCrawler.start();
  });

  it("should not decrement _openRequests below zero in the event of a timeout", async () => {
    const localCrawler = new Crawler("http://127.0.0.1:3000/timeout");
    localCrawler.timeout = 200;
    localCrawler.maxConcurrency = 1;

    localCrawler.queueURL("http://127.0.0.1:3000/timeout2");

    localCrawler.on("fetchtimeout", () => {
      expect((localCrawler as any)._openRequests).toBeArrayOfSize(0);
    });
    localCrawler.start();
    await waitForCrawler(localCrawler, 3000);
  });

  it("should decrement _openRequests in the event of a non-supported mimetype", async () => {
    const localCrawler = makeCrawler("http://127.0.0.1:3000/");
    localCrawler.downloadUnsupported = false;
    localCrawler.maxConcurrency = 1;
    (localCrawler as any).discoverResources = false;

    localCrawler.queueURL("http://127.0.0.1:3000/img/1");
    localCrawler.queueURL("http://127.0.0.1:3000/img/2");

    localCrawler.start();
    await waitForCrawler(localCrawler, 3000);
    expect((localCrawler as any)._openRequests).toBeArrayOfSize(0);
  });

  it("should add multiple items with the same URL to the queue if forced to", (done) => {
    const localCrawler = makeCrawler("http://127.0.0.1:3000/");
    let addCount = 0;

    localCrawler.on("queueadd", () => {
      addCount++;

      if (addCount >= 2) {
        localCrawler.queue.getLength(function (error: Error | null, length?: number) {
          expect(length).toEqual(2);
          done(error);
        });
      }
    });

    localCrawler.queueURL("http://127.0.0.1:3000/stage2");
    // First, try to add the same URL without a force argument...
    localCrawler.queueURL("http://127.0.0.1:3000/stage2");
    // Then try to add it with a force argument
    localCrawler.queueURL("http://127.0.0.1:3000/stage2", undefined, true);
  });

  it("should emit a fetch404 when given a 404 status code", (done) => {
    const localCrawler = makeCrawler("http://127.0.0.1:3000/404");

    localCrawler.on("fetch404", () => {
      localCrawler.stop(true);
      done();
    });

    localCrawler.start();
  });


  it("should emit a fetch410 when given a 410 status code", (done) => {
    const localCrawler = makeCrawler("http://127.0.0.1:3000/410");

    localCrawler.on("fetch410", () => {
      done();
    });

    localCrawler.start();
  });

  it("should be able to freeze and defrost the queue", (done) => {
    const localCrawler = makeCrawler("http://127.0.0.1:3000/");
    const newCrawler = makeCrawler("http://127.0.0.1:3000/");
    const tmp = os.tmpdir() ? path.join(os.tmpdir(), "queue.json") : path.join(__dirname, "queue.json");

    localCrawler.start();

    // The oldestUnfetchedIndex argument may seem puzzling, but the reason
    // that it differs between localCrawler and newCrawler is that when we
    // freeze the queue, localCrawler hasn't had time to ask for a new
    // unfetched queue item, and it's only when those are asked for that the
    // queue._oldestUnfetchedIndex property is updated. When we defrost the
    // queue however, the property will be set correctly and "catch up"
    function testQueue(crawler: Crawler, oldestUnfetchedIndex: number) {
      expect(crawler.queue).toBeArrayOfSize(5);
      expect((crawler.queue as any)._oldestUnfetchedIndex).toEqual(oldestUnfetchedIndex);
      new Set().keys();
      expect(Array.from((crawler.queue as any)._scanIndex)).toIncludeAllMembers([
        "http://127.0.0.1:3000/",
        "http://127.0.0.1:3000/sitemap.xml",
        "http://127.0.0.1:3000/stage2",
        "http://127.0.0.1:3000/stage/3",
        "http://127.0.0.1:3000/stage/4"
      ]);

      crawler.queue.filterItems(() => true, function (error: Error | null, items?: QueueItem[]) {
        if (error) {
          return done(error);
        }

        expect(items!.map((item) => item.status)).toIncludeSameMembers([
          "downloaded",
          "notfound",
          "downloaded",
          "queued",
          "queued"
        ]);
      });
    }

    function testFreezeDefrost() {
      testQueue(localCrawler, 2);

      localCrawler.queue.freeze(tmp, () => {
        newCrawler.queue.defrost(tmp, () => {
          testQueue(newCrawler, 3);

          newCrawler.queue.oldestUnfetchedItem((err: Error | null, queueItem?: QueueItem | null) => {
            expect(err).toBeNull();
            expect(queueItem!.url).toEqual("http://127.0.0.1:3000/stage/4");
            done();
          });
        });
      });
    }

    let i = 0;

    localCrawler.on("fetchcomplete", function () {
      if (i++ === 1) {
        localCrawler.stop(true);
        // Queue an additional URL so that we can test the
        // queue._oldestUnfetchedItem reviving properly
        localCrawler.queueURL("http://127.0.0.1:3000/stage/4");

        // Lets the queue be populated
        process.nextTick(testFreezeDefrost);
      }
    });

    localCrawler.start();
  });

  it("should only be able to start once per run", (done) => {
    var localCrawler = makeCrawler("http://127.0.0.1:3000/");

    setTimeout(() => {
      const crawlIntervalID = (localCrawler as any).crawlIntervalID;
      localCrawler.start();

      setTimeout(() => {
        expect((localCrawler as any).crawlIntervalID).toEqual(crawlIntervalID);
        localCrawler.stop();
        done();
      }, 10);
    }, 10);

    localCrawler.start();
  });

  it("should only fetch every queue item once", async () => {
    const localCrawler = makeCrawler("http://127.0.0.1:3000/");
    const timeout = localCrawler.interval * 2;
    const buffer = [];

    const _oldestUnfetchedItem = localCrawler.queue.oldestUnfetchedItem;
    const _update = localCrawler.queue.update;

    // emulate these methods are slower than crawler.interval
    localCrawler.queue.oldestUnfetchedItem = function (callback) {
      setTimeout(_oldestUnfetchedItem.bind(this, callback), timeout);
    };
    localCrawler.queue.update = function (id, updates, callback) {
      setTimeout(_update.bind(this, id, updates, callback), timeout);
    };

    localCrawler.on("fetchstart", (queueItem) => {
      buffer.push(queueItem.url);
    });

    localCrawler.start();
    await waitForCrawler(localCrawler);
    expect(buffer.length).toEqual(8);

  });

  describe("when stopping the crawler", () => {

    it("should not terminate open connections unless asked", (done) => {
      const localCrawler = makeCrawler("http://127.0.0.1:3000/");
      let fetchStartCallCount = 0;

      // Speed things up
      localCrawler.interval = 0;

      // Adding routes which will time out, so we don't ever end up
      // completing the crawl before we can instrument the requests
      localCrawler.queueURL("/timeout");
      localCrawler.queueURL("/timeout2");

      localCrawler.on("fetchstart", () => {

        // If we haven't been called previously
        if (!fetchStartCallCount) {
          return fetchStartCallCount++;
        }

        // TODO
        (localCrawler as any)._openRequests.forEach((req: any) => {
          req.abort = function () {
            throw new Error("Should not abort requests!");
          };
        });

        localCrawler.stop();
        done();
      });

      localCrawler.start();
    });

    it("should terminate open connections when requested", (done) => {
      const localCrawler = makeCrawler("http://127.0.0.1:3000/");
      let fetchStartCallCount = 0;
      let abortCallCount = 0;

      // Speed things up
      localCrawler.interval = 0;

      // Adding routes which will time out, so we don't ever end up
      // completing the crawl before we can instrument the requests
      localCrawler.queueURL("/timeout");
      localCrawler.queueURL("/timeout2");

      localCrawler.on("fetchstart", () => {

        // If we haven't been called previously
        if (!fetchStartCallCount) {
          return fetchStartCallCount++;
        }

        expect((localCrawler as any)._openRequests).toBeArrayOfSize(2);

        // TODO fix any
        (localCrawler as any)._openRequests.forEach((req: any) => {
          req.abort = function () {
            abortCallCount++;
          };
        });

        localCrawler.stop(true);
        expect(abortCallCount).toEqual(2);
        done();
      });

      localCrawler.start();
    });
  });
});
