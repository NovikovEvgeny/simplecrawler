/* eslint-env jest */
import "jest-extended";

import * as http from "http";
import { promisify } from "util";
import { Crawler } from "../../src";
import { QueueItem } from "../../src/types";
import { waitForCrawler } from "../util";
import { queue } from "async";


function makeCrawler(url: string): Crawler {
  const crawler = new Crawler(url);
  crawler.interval = 5;
  return crawler;
};

describe("Fetch conditions", () => {
  it("should be able to add a fetch condition", () => {
    const crawler = makeCrawler("http://127.0.0.1:3000");
    const condition = function () { };
    const conditionID = crawler.addFetchCondition(condition);

    expect(conditionID).toBeNumber();
    expect((crawler as any)._fetchConditions[conditionID]).toBe(condition);
  });

  describe("Removing fetch conditions", () => {
    it("should be able to remove a fetch condition by ID", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000");
      const condition = function () { };
      const conditionID = crawler.addFetchCondition(condition);

      expect((crawler as any)._fetchConditions[conditionID]).toBe(condition);
      crawler.removeFetchCondition(conditionID);
      expect((crawler as any)._fetchConditions[conditionID]).not.toEqual(condition);
    });

    it("should be able to remove a fetch condition by reference", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000");
      const condition = function () { };
      const conditionID = crawler.addFetchCondition(condition);

      expect((crawler as any)._fetchConditions[conditionID]).toBe(condition);
      crawler.removeFetchCondition(condition);
      expect((crawler as any)._fetchConditions[conditionID]).not.toEqual(condition);
    });

    it("should be able to remove a fetch condition by ID (multiple)", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000"),
        condition1 = function () { },
        condition2 = function () { },
        condition3 = function () { },
        conditionID1 = crawler.addFetchCondition(condition1),
        conditionID2 = crawler.addFetchCondition(condition2),
        conditionID3 = crawler.addFetchCondition(condition3);

      expect((crawler as any)._fetchConditions[conditionID1]).toEqual(condition1);
      expect((crawler as any)._fetchConditions[conditionID2]).toEqual(condition2);
      expect((crawler as any)._fetchConditions[conditionID3]).toEqual(condition3);
      crawler.removeFetchCondition(conditionID2);
      expect((crawler as any)._fetchConditions[conditionID1]).toEqual(condition1);
      expect((crawler as any)._fetchConditions[conditionID2]).not.toEqual(condition2);
      expect((crawler as any)._fetchConditions[conditionID3]).toEqual(condition3);
    });

    it("should be able to remove a fetch condition by reference (multiple)", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000"),
        condition1 = function () { },
        condition2 = function () { },
        condition3 = function () { },
        conditionID1 = crawler.addFetchCondition(condition1),
        conditionID2 = crawler.addFetchCondition(condition2),
        conditionID3 = crawler.addFetchCondition(condition3);

      expect((crawler as any)._fetchConditions[conditionID1]).toEqual(condition1);
      expect((crawler as any)._fetchConditions[conditionID2]).toEqual(condition2);
      expect((crawler as any)._fetchConditions[conditionID3]).toEqual(condition3);
      crawler.removeFetchCondition(condition2);
      expect((crawler as any)._fetchConditions[conditionID1]).toEqual(condition1);
      expect((crawler as any)._fetchConditions[conditionID2]).not.toEqual(condition1);
      expect((crawler as any)._fetchConditions[conditionID3]).toEqual(condition3);
    });

    it("should throw when it can't remove a fetch condition by ID", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000"),
        condition = function () { },
        conditionID = crawler.addFetchCondition(condition);

      expect((crawler as any)._fetchConditions[conditionID]).toEqual(condition);
      expect(() => crawler.removeFetchCondition(-1)).toThrow();
      expect(() => crawler.removeFetchCondition(conditionID + 1)).toThrow();
      expect((crawler as any)._fetchConditions[conditionID]).toEqual(condition);
    });

    it("should throw when it can't remove a fetch condition by reference", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000"),
        condition = function () { },
        conditionID = crawler.addFetchCondition(condition);

      expect((crawler as any)._fetchConditions[conditionID]).toEqual(condition);
      expect(() => crawler.removeFetchCondition(function () { })).toThrow();

      expect((crawler as any)._fetchConditions[conditionID]).toEqual(condition);
    });

    it("should throw when removing a fetch condition twice by ID", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000"),
        condition = function () { },
        conditionID = crawler.addFetchCondition(condition);

      expect((crawler as any)._fetchConditions[conditionID]).toEqual(condition);
      crawler.removeFetchCondition(conditionID);
      expect((crawler as any)._fetchConditions[conditionID]).not.toEqual(condition);
      expect(() => crawler.removeFetchCondition(conditionID)).toThrow();
    });

    it("should throw when removing a fetch condition twice by reference", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000"),
        condition = function () { },
        conditionID = crawler.addFetchCondition(condition);

      expect((crawler as any)._fetchConditions[conditionID]).toEqual(condition);
      crawler.removeFetchCondition(condition);
      expect((crawler as any)._fetchConditions[conditionID]).not.toEqual(condition);
      expect(() => crawler.removeFetchCondition(condition)).toThrow();
    });

  });

  it("should provide fetch conditions with the right data", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000");
    let fetchConditionCallCount = 0;

    // TODO fix expect in callback
    crawler.addFetchCondition((queueItem: QueueItem, referrerQueueItem: QueueItem) => {
      if (fetchConditionCallCount++ > 0) {
        expect(referrerQueueItem).toBeObject();
        expect(referrerQueueItem).toMatchObject({
          url: "http://127.0.0.1:3000/",
          depth: 1,
          protocol: "http",
          host: "127.0.0.1",
          port: 3000,
          path: "/"
        });

        expect(referrerQueueItem.stateData).toBeObject();
        expect(referrerQueueItem.stateData).toHaveProperty("requestLatency");
        expect(referrerQueueItem.stateData).toHaveProperty("requestTime");
        expect(referrerQueueItem.stateData).toMatchObject({
          contentLength: 68,
          contentType: "text/html",
          code: 200
        });
        expect(referrerQueueItem.stateData).toHaveProperty("headers");
        expect(referrerQueueItem.stateData.headers).toMatchObject({
          "content-length": "68"
        });

        expect(queueItem).toBeObject();
        expect(queueItem).toMatchObject({
          url: "http://127.0.0.1:3000/stage2",
          status: "created",
          fetched: false,
          depth: 2,
          protocol: "http",
          host: "127.0.0.1",
          port: 3000,
          path: "/stage2"
        });

        crawler.stop(true);
        done();
      }
    });

    crawler.on("fetchconditionerror", (queueItem, error) => {
      done(error);
    });

    crawler.start();
  });

  it("should respect synchronous fetch conditions", async () => {
    const crawler = makeCrawler("http://127.0.0.1:3000");

    crawler.addFetchCondition(() => {
      return false;
    });

    crawler.start();
    await waitForCrawler(crawler);
    const length = await promisify(crawler.queue.getLength.bind(crawler.queue))();
    expect(length).toEqual(1);
  });

  it("should respect asynchronous fetch conditions", async () => {
    const crawler = makeCrawler("http://127.0.0.1:3000");

    crawler.addFetchCondition((queueItem: QueueItem, referrerQueueItem: QueueItem, callback: Function) => {
      callback(null, false);
    });

    crawler.start();
    await waitForCrawler(crawler);
    const length = await promisify(crawler.queue.getLength.bind(crawler.queue))();
    expect(length).toEqual(1);
  });

  it("should emit fetchprevented events", async () => {
    const crawler = makeCrawler("http://127.0.0.1:3000");
    let fetchPrevented = false;
    let preventedQueueItem: any;

    crawler.addFetchCondition((queueItem: QueueItem, referrerQueueItem: QueueItem, callback: Function) => {
      callback(null, false);
    });

    crawler.on("fetchprevented", (queueItem) => {
      preventedQueueItem = queueItem;
      fetchPrevented = true;
    });

    crawler.start();
    await waitForCrawler(crawler);
    expect(preventedQueueItem).toBeDefined();
    expect(preventedQueueItem.url).toContain("http://127.0.0.1:3000/");
    expect(fetchPrevented).toBeTrue();
  });

  it("should emit fetchconditionerror events", async () => {
    const crawler = makeCrawler("http://127.0.0.1:3000");
    let caughtFetchError = false;
    let fetchConditionErrorQueueItem: any;
    let fetchConditionError: string | undefined = undefined;

    crawler.addFetchCondition((queueItem: QueueItem, referrerQueueItem: QueueItem, callback: Function) => {
      callback("error");
    });

    crawler.on("fetchconditionerror", (queueItem, error) => {
      caughtFetchError = true;
      fetchConditionErrorQueueItem = queueItem;
      fetchConditionError = error;
    });

    crawler.start();
    await waitForCrawler(crawler);
    expect(caughtFetchError).toBeTrue();
    expect(fetchConditionErrorQueueItem.url).toContain("http://127.0.0.1:3000/");
    expect(fetchConditionError).toEqual("error");
  });
});

describe("Download conditions", () => {
  it("should be able to add a download condition", () => {
    const crawler = makeCrawler("http://127.0.0.1:3000"),
      condition = function () { },
      conditionID = crawler.addDownloadCondition(condition);

    expect((crawler as any)._downloadConditions[conditionID]).toEqual(condition);
    expect(conditionID).toBeNumber();
  });

  describe("Removing download conditions", () => {
    it("should be able to remove a download condition by ID", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000"),
        condition = function () { },
        conditionID = crawler.addDownloadCondition(condition);

      expect((crawler as any)._downloadConditions[conditionID]).toEqual(condition);
      crawler.removeDownloadCondition(conditionID);
      expect((crawler as any)._downloadConditions[conditionID]).not.toEqual(condition);
    });

    it("should be able to remove a download condition by reference", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000"),
        condition = function () { },
        conditionID = crawler.addDownloadCondition(condition);

      expect((crawler as any)._downloadConditions[conditionID]).toEqual(condition);
      crawler.removeDownloadCondition(condition);
      expect((crawler as any)._downloadConditions[conditionID]).not.toEqual(condition);
    });

    it("should be able to remove a download condition by ID (multiple)", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000"),
        condition1 = function () { },
        condition2 = function () { },
        condition3 = function () { },
        conditionID1 = crawler.addDownloadCondition(condition1),
        conditionID2 = crawler.addDownloadCondition(condition2),
        conditionID3 = crawler.addDownloadCondition(condition3);

      expect((crawler as any)._downloadConditions[conditionID1]).toEqual(condition1);
      expect((crawler as any)._downloadConditions[conditionID2]).toEqual(condition2);
      expect((crawler as any)._downloadConditions[conditionID3]).toEqual(condition3);
      crawler.removeDownloadCondition(conditionID2);
      expect((crawler as any)._downloadConditions[conditionID1]).toEqual(condition1);
      expect((crawler as any)._downloadConditions[conditionID2]).not.toEqual(condition2);
      expect((crawler as any)._downloadConditions[conditionID3]).toEqual(condition3);
    });

    it("should be able to remove a download condition by reference (multiple)", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000"),
        condition1 = function () { },
        condition2 = function () { },
        condition3 = function () { },
        conditionID1 = crawler.addDownloadCondition(condition1),
        conditionID2 = crawler.addDownloadCondition(condition2),
        conditionID3 = crawler.addDownloadCondition(condition3);

      expect((crawler as any)._downloadConditions[conditionID1]).toEqual(condition1);
      expect((crawler as any)._downloadConditions[conditionID2]).toEqual(condition2);
      expect((crawler as any)._downloadConditions[conditionID3]).toEqual(condition3);
      crawler.removeDownloadCondition(condition2);
      expect((crawler as any)._downloadConditions[conditionID1]).toEqual(condition1);
      expect((crawler as any)._downloadConditions[conditionID2]).not.toEqual(condition2);
      expect((crawler as any)._downloadConditions[conditionID3]).toEqual(condition3);
    });

    it("should throw when it can't remove a download condition by ID", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000"),
        condition = function () { },
        conditionID = crawler.addDownloadCondition(condition);

      expect((crawler as any)._downloadConditions[conditionID]).toEqual(condition);
      expect(() => crawler.removeDownloadCondition(-1)).toThrow();
      expect(() => crawler.removeDownloadCondition(conditionID + 1)).toThrow();
      expect((crawler as any)._downloadConditions[conditionID]).toEqual(condition);
    });

    it("should throw when it can't remove a download condition by reference", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000"),
        condition = function () { },
        conditionID = crawler.addDownloadCondition(condition);

      expect((crawler as any)._downloadConditions[conditionID]).toEqual(condition);
      expect(() => crawler.removeDownloadCondition(function () { })).toThrow();
      expect((crawler as any)._downloadConditions[conditionID]).toEqual(condition);
    });

    it("should throw when removing a download condition twice by ID", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000"),
        condition = function () { },
        conditionID = crawler.addDownloadCondition(condition);

      expect((crawler as any)._downloadConditions[conditionID]).toEqual(condition);
      crawler.removeDownloadCondition(conditionID);
      expect((crawler as any)._downloadConditions[conditionID]).not.toEqual(condition);
      expect(() => crawler.removeDownloadCondition(conditionID)).toThrow();
    });

    it("should throw when removing a download condition twice by reference", () => {
      const crawler = makeCrawler("http://127.0.0.1:3000"),
        condition = function () { },
        conditionID = crawler.addDownloadCondition(condition);

      expect((crawler as any)._downloadConditions[conditionID]).toEqual(condition);
      crawler.removeDownloadCondition(condition);
      expect((crawler as any)._downloadConditions[conditionID]).not.toEqual(condition);
      expect(() => crawler.removeDownloadCondition(condition)).toThrow();
    });

  });

  it("should provide download conditions with the right data", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000");
    let downloadConditionCalled = false;

    // TODO move expects from callback
    crawler.addDownloadCondition((queueItem: QueueItem, response: http.IncomingMessage) => {
      if (downloadConditionCalled) {
        return false;
      }

      downloadConditionCalled = true;

      expect(queueItem).toBeObject();
      expect(queueItem).toMatchObject({
        url: "http://127.0.0.1:3000/",
        status: "spooled",
        fetched: false,
        depth: 1,
        protocol: "http",
        host: "127.0.0.1",
        port: 3000,
        path: "/"
      });

      expect(response).toBeObject();
      expect(response).toBeInstanceOf(http.IncomingMessage);

      crawler.stop(true);
      done();
    });

    crawler.start();
  });

  it("should not download a resource when prevented by a synchronous download condition", async () => {
    const crawler = makeCrawler("http://127.0.0.1:3000");
    crawler.maxDepth = 1;

    crawler.addDownloadCondition(() => false);

    crawler.start();
    await waitForCrawler(crawler);
    const length = await promisify(crawler.queue.getLength.bind(crawler.queue))();
    expect(length).toEqual(2);
    const queueItem = await promisify(crawler.queue.get.bind(crawler.queue))(0);
    // TODO find out why never
    // @ts-expect-error
    expect(queueItem.status).toEqual("downloadprevented");
  });

  it("should not download a resource when prevented by an asynchronous download condition", async () => {
    const crawler = makeCrawler("http://127.0.0.1:3000");
    crawler.maxDepth = 1;

    crawler.addDownloadCondition(function (queueItem: QueueItem, response: any, callback: Function) {
      setTimeout(function () {
        callback(null, false);
      }, 10);
    });

    crawler.start();
    await waitForCrawler(crawler);
    const length = await promisify(crawler.queue.getLength.bind(crawler.queue))();
    expect(length).toEqual(2);
    const queueItem = await promisify(crawler.queue.get.bind(crawler.queue))(0);
    // TODO find out why never
    // @ts-expect-error
    expect(queueItem.status).toEqual("downloadprevented");
  });

  it("should only apply download conditions when it would normally download the resource", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000/404");

    crawler.addDownloadCondition(() => {
      done(new Error("Shouldn't have evaluated the download condition"));
    });

    // TODO move expects from callback
    crawler.on("fetch404", (queueItem, response) => {
      expect(queueItem).toBeObject();
      expect(queueItem.status).toEqual("notfound");

      expect(response).toBeObject();
      expect(response).toBeInstanceOf(http.IncomingMessage);

      crawler.stop(true);
      done();
    });

    crawler.start();
  });

  it("should emit a downloadprevented event when a download condition returns false", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000");

    crawler.addDownloadCondition((queueItem: QueueItem, response: any, callback: Function) => {
      callback(null, false);
    });

    crawler.on("downloadprevented", (queueItem, response) => {
      expect(queueItem).toBeObject();
      expect(queueItem.status).toEqual("downloadprevented");

      expect(response).toBeObject();
      expect(response).toBeInstanceOf(http.IncomingMessage);

      crawler.stop(true);
      done();
    });

    crawler.start();
  });

  function downloadConditionErrorListener(crawler: Crawler, done: Function) {
    return function (queueItem: QueueItem, error: any) {
      expect(queueItem).toBeObject();
      expect(error).toBeInstanceOf(Error);

      crawler.stop(true);
      done();
    };
  }

  it("should emit a downloadconditionerror event when a download condition throws an error", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000");

    crawler.addDownloadCondition(() => {
      throw new Error();
    });

    crawler.on("downloadconditionerror", downloadConditionErrorListener(crawler, done));
    crawler.start();
  });

  it("should emit a downloadconditionerror event when a download condition returns an error", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000");

    crawler.addDownloadCondition((queueItem: QueueItem, response: any, callback: Function) => {
      callback(new Error());
    });

    crawler.on("downloadconditionerror", downloadConditionErrorListener(crawler, done));
    crawler.start();
  });
});
