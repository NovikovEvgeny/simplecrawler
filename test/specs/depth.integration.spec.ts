/* eslint-env jest */
import "jest-extended";

import { Crawler } from "../../src";
import { waitForCrawler } from "../util/waitForCrawler";


async function depthTest(maxDepth: number, linksToDiscover: number) {
  const crawler = new Crawler("http://127.0.0.1:3000/depth/1");
  let linksDiscovered = 0;

  crawler.interval = 5;
  crawler.maxDepth = maxDepth;

  crawler.on("fetchcomplete", () => {
    linksDiscovered++;
  });

  crawler.start();
  await waitForCrawler(crawler);
  expect(linksDiscovered).toEqual(linksToDiscover);
}

describe("Crawler max depth", () => {
  const maxDepthToResourceCount: { [key: number]: number } = {
    0: 11, // maxDepth=0 (no max depth) should return 11 resources
    1: 1,  // maxDepth=1
    2: 3,  // maxDepth=2
    3: 6   // maxDepth=3
  };

  it('should discover resources with different maxDepth', async () => {
    for (let key in maxDepthToResourceCount) {
      if (maxDepthToResourceCount.hasOwnProperty(key)) {
        await depthTest(Number(key), maxDepthToResourceCount[key]);
      }
    }
  });
});
