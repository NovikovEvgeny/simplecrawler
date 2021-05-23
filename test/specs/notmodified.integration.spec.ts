/* eslint-env jest */
import "jest-extended";

import * as path from "path";
import * as fs from "fs";

import { Crawler, Cache } from "../../src";
import { waitForCrawler } from "../util/waitForCrawler";

function makeCrawler(url: string) {
  const crawler = new Crawler(url);
  const cachedir = path.join(__dirname, "..", "cache");
  if (!fs.existsSync(cachedir)) {
    fs.mkdirSync(cachedir);
  }
  crawler.cache = new Cache(cachedir);
  return crawler;
};

async function notmodifiedTest(url: string): Promise<void> {
  const crawler1 = makeCrawler(url);

  crawler1.start();
  await waitForCrawler(crawler1);

  crawler1.cache!.saveCache();

  const crawler2 = makeCrawler(url);
  let notmodified = false;
  crawler2.on("notmodified", () => {
    notmodified = true;
  });
  crawler2.start();
  await waitForCrawler(crawler2);
  expect(notmodified).toBeTrue();
}

describe("Cache and notmodified event", () => {

  it("should emit a notmodified when given a 304 status code by ETag", async () => {
    await notmodifiedTest("http://127.0.0.1:3000/etag");
  });

  it("should emit a notmodified when given a 304 status code by Last-Modified", async () => {
    await notmodifiedTest("http://127.0.0.1:3000/last-modified");
  });
});
