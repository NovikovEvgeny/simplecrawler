/* eslint-env mocha */
import "jest-extended";

import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

import { AnyObject, QueueItem } from "../../src/types";

import { Crawler } from "../../src";
const queue: AnyObject = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "queue.json")).toString());

function deepAssign(object: AnyObject, source: AnyObject) {
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (typeof object[key] === "object" && typeof source[key] === "object") {
        deepAssign(object[key], source[key]);
      } else {
        object[key] = source[key];
      }
    }
  }

  return object;
}

// TODO move expects from callbacks
describe("Queue methods", () => {
  const crawler = new Crawler("http://127.0.0.1:3000/");

  const addToQueue = function (done: Function) {
    Object.keys(queue).forEach((key) => {
      if (!isNaN(parseInt(key, 10))) {
        crawler.queueURL(queue[key].url);
      }
    });

    // @ts-expect-error
    crawler.queue.getLength((error: any, length: number) => {
      expect(length).toEqual(4);

      // After queueing the fixed queue items, we want to update them to
      // use all of the data stored in queue.json without relying on the
      // freeze/defrost functionality, so instead we asynchronously
      // mutate each queue item
      function updateItem(index: number) {
        if (index < length) {
          // @ts-expect-error
          crawler.queue.get(index, (error: any, item: QueueItem) => {
            for (const key in queue[index]) {
              if (queue[index].hasOwnProperty(key)) {
                // @ts-expect-error
                item[key] = queue[index][key];
              }
            }

            updateItem(index + 1);
          });
        } else {
          done();
        }
      }

      updateItem(0);
    });
  };


  it("should add to the queue", addToQueue);

  it("shouldn't add duplicates to the queue", addToQueue);

  it("should get items from the queue", (done) => {
    crawler.queue.get(2, (error: any, item?: QueueItem) => {
      expect(item?.url).toEqual("http://127.0.0.1:3000/stage2");
      done(error);
    });
  });

  it("should error when getting queue items out of range", async () => {
    // @ts-expect-error
    const length: number = await promisify(crawler.queue.getLength.bind(crawler.queue))();
    const getItemPromise = promisify(crawler.queue.get.bind(crawler.queue))(length * 2);

    await expect(getItemPromise).rejects.toThrow("Index was greater than the queue's length");
  });

  it("should get the oldest unfetched item", (done) => {
    crawler.queue.oldestUnfetchedItem((error: any, item: any) => {
      expect(item.url).toEqual("http://127.0.0.1:3000/stage/3");
      done(error);
    });
  });

  it("should get a max statistic from the queue", (done) => {
    crawler.queue.max("downloadTime", (error: any, max: any) => {
      expect(max).toBeNumber();
      expect(max).toEqual(2);
      done(error);
    });
  });

  it("should get a min statistic from the queue", (done) => {
    crawler.queue.min("requestTime", (error: any, min: any) => {
      expect(min).toBeNumber();
      expect(min).toEqual(2);
      done(error);
    });
  });

  it("should get an average statistic from the queue", (done) => {
    crawler.queue.avg("contentLength", (error: any, avg: any) => {
      expect(avg).toBeNumber();
      expect(avg).toEqual((68 + 14 + 37) / 3);
      done();
    });
  });

  it("should get the number of completed queue items", (done) => {
    crawler.queue.countItems({ fetched: true }, (error: any, complete: any) => {
      expect(complete).toBeNumber();
      expect(complete).toEqual(3);
      done(error);
    });
  });

  it("should get queue items with a specific status", (done) => {
    crawler.queue.filterItems({ status: "downloaded" }, (error: any, items: any) => {
      expect(items).toBeArray();
      expect(items.map((item: any) => item.url))
        .toIncludeAllMembers(["http://127.0.0.1:3000/", "http://127.0.0.1:3000/stage2"]);
      done(error);
    });
  });

  it("should count items with a specific status", (done) => {
    crawler.queue.countItems({ status: "queued" }, (error: any, count: any) => {
      expect(count).toBeNumber();
      expect(count).toEqual(1);
      done(error);
    });
  });

  it("should count items with a 200 HTTP status", (done) => {
    crawler.queue.countItems({
      stateData: { code: 200 }
    }, (error: any, count: any) => {
      expect(count).toBeNumber();
      expect(count).toEqual(2);
      done(error);
    });
  });

  it("should get items that have failed", (done) => {
    crawler.queue.countItems({ status: "failed" }, (error: any, count: any) => {
      expect(count).toBeNumber();
      expect(count).toEqual(0);

      crawler.queue.countItems({ status: "notfound" }, (error: any, count: any) => {
        expect(count).toBeNumber();
        expect(count).toEqual(1);
        done(error);
      });
    });
  });

  it("should error when passing unknown properties to queue methods", (done) => {
    crawler.queue.max("humdidum", (error: any, max: any) => {
      expect(max).toBeUndefined();
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toEqual("Invalid statistic");
      done();
    });
  });

  it("should add existing queueItems if forced to", (done) => {
    const queueItems: any[] = [];
    let finished = 0;

    for (let i = 0; i < 3; i++) {
      queueItems.push(crawler.processURL("http://127.0.0.1/example"));
    }

    function checkDone() {
      if (++finished === queueItems.length + 1) {
        done();
      }
    }

    // @ts-expect-error
    crawler.queue.add(queueItems[0], false, (error: any, newQueueItem: QueueItem) => {
      expect(newQueueItem).toEqual(queueItems[0]);
      checkDone();
    });
    // @ts-expect-error
    crawler.queue.add(queueItems[1], false, (error: any, newQueueItem: QueueItem) => {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toEqual("Resource already exists in queue!");
      expect(newQueueItem).toBeUndefined();
      checkDone();
    });
    // @ts-expect-error
    crawler.queue.add(queueItems[2], true, (error: any, newQueueItem: QueueItem) => {
      expect(error).toBeNull();
      expect(newQueueItem).toEqual(queueItems[2]);
      checkDone();
    });
    // @ts-expect-error
    crawler.queue.add(queueItems[2], true, (error: any, newQueueItem: QueueItem) => {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toMatch(/twice/i);
      expect(newQueueItem).toBeUndefined();
      checkDone();
    });
  });

  it("should update items in the queue", (done) => {
    crawler.queue.update(2, {
      status: "queued",
      fetched: false
    }, (error: any, queueItem: any) => {
      expect(queueItem).toMatchObject({
        url: "http://127.0.0.1:3000/stage2",
        status: "queued",
        fetched: false
      });

      done(error);
    });
  });

  /**
   * This test works by monkey patching the queue `add` and `update` methods
   * and keeping a local copy of the queue, which contains cloned queueItems.
   * Each time the `update` method is called, we deeply compare the copy in
   * the queue with our local one. Same thing when the crawler completes.
   */
  it("should only update queue items asynchronously", (done) => {
    const crawler = new Crawler("http://127.0.0.1:3000");
    const originalQueueAdd = crawler.queue.add;
    const originalQueueUpdate = crawler.queue.update;

    const queueItems: QueueItem[] = [];

    crawler.interval = 5;
    crawler.maxDepth = 2;


    crawler.queue.add = function (queueItem) {
      const args = arguments;

      process.nextTick(function () {
        const storedQueueItem = deepAssign({}, queueItem);
        storedQueueItem.id = crawler.queue.length;
        storedQueueItem.status = "queued";
        queueItems.push(storedQueueItem as QueueItem);

        // @ts-expect-error
        originalQueueAdd.apply(crawler.queue, args);
      });
    };

    crawler.queue.update = function (id, updates) {
      const args = arguments;

      process.nextTick(function () {
        const storedQueueItem = queueItems.find((item) => item.id === id);
        const queueQueueItem = crawler.queue.find((item) => item.id === id);

        expect(queueQueueItem).toEqual(storedQueueItem);
        // @ts-expect-error
        deepAssign(storedQueueItem, updates);

        // @ts-expect-error
        originalQueueUpdate.apply(crawler.queue, args);
      });
    };

    crawler.on("complete", () => {
      crawler.queue.getLength((error: any, length: any) => {
        // Recursively step through items in the real queue and compare
        // them to our local clones
        function getItem(index: number) {
          crawler.queue.get(index, (error: any, queueQueueItem: any) => {
            const storedQueueItem = queueItems.find((item) => item.id === queueQueueItem.id);
            const nextIndex = index + 1;

            expect(queueQueueItem).toEqual(storedQueueItem);

            if (nextIndex < length) {
              getItem(nextIndex);
            } else {
              done();
            }
          });
        }

        getItem(0);
      });
    });

    crawler.start();
  });

  it("emits a queueerror event when update method errors", (done) => {
    const crawler = new Crawler("http://127.0.0.1:3000");
    const originalQueueUpdate = crawler.queue.update;

    crawler.interval = 5;

    crawler.queue.update = function (url, updates, callback) {
      originalQueueUpdate.call(crawler.queue, url, updates, function (error: any, queueItem: any) {
        if (!error) {
          error = new Error("Not updating this queueItem");
        }

        callback(error, queueItem);
      });
    };

    crawler.on("queueerror", (error, queueItem) => {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toEqual("Not updating this queueItem");
      expect(queueItem).toBeObject();
      expect(queueItem).toHaveProperty("url");
      expect(queueItem).toHaveProperty("fetched");
      expect(queueItem).toHaveProperty("status");
      crawler.stop(true);
      done();
    });

    crawler.start();
  });

  it("Doesn't queue URL with reordered query parameters", (done) => {
    const crawler = new Crawler("http://127.0.0.1:3000");
    crawler.sortQueryParameters = true;
    crawler.queueURL("http://127.0.0.1:3000/sample.jsp?a=1&b=2");
    crawler.queueURL("http://127.0.0.1:3000/sample.jsp?b=2&a=1");
    crawler.queue.getLength((error: any, length: any) => {
      expect(length).toEqual(1);
      done();
    });
  });
});
