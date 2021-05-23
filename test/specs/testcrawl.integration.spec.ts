// Runs a very simple crawl on an HTTP server
// This is more of an integration test than a unit test.

/* eslint-env jest */

import "jest-extended";
import { waitForCrawler } from "../util";
import uri from "urijs";
import { Crawler } from "../../src";

import { Server } from "../util";

function makeCrawler(url: string) {
  const crawler = new Crawler(url);
  crawler.interval = 1;
  return crawler;
};

// TODO move expects from callbacks
describe("Test Crawl", () => {

  it("should be able to be started", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000/");

    crawler.on("crawlstart", () => {
      expect((crawler as any).running).toBeTrue();
      crawler.stop(true);
      done();
    });

    crawler.start();
  });

  it("should emit an error when it gets a faulty cookie", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000/");

    crawler.on("cookieerror", (queueItem) => {
      expect(queueItem.url).toEqual("http://127.0.0.1:3000/stage2");
      crawler.stop(true);
      done();
    });

    crawler.start();
  });

  it("should parse, store and send cookies properly", (done) => {
    const crawler = makeCrawler("http://localhost:3000/cookie");
    let fetchstartCount = 0;

    crawler.on("fetchstart", (queueItem, requestOptions) => {
      if (fetchstartCount++ === 2) {
        expect(requestOptions.headers.cookie).toBeString();
        expect(requestOptions.headers.cookie).toMatch(/^thing=stuff$/);
        crawler.stop(true);
        done();
      }
    });

    crawler.start();
  });

  it("should send multiple cookies properly", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000/");
    let fetchstartCount = 0;

    crawler.cookies.addFromHeaders([
      "name1=value1",
      "name2=value2",
      "name3=value3"
    ]);

    crawler.on("fetchstart", (queueItem, requestOptions) => {
      expect(requestOptions.headers.cookie).toBeString();
      expect(requestOptions.headers.cookie).toMatch(/^(name\d=value\d; ){2}(name\d=value\d)$/);

      if (fetchstartCount++ === 6) {
        crawler.stop(true);
        done();
      }
    });

    crawler.start();
  });

  it("should have added the initial item to the queue", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000/");
    crawler.start();

    crawler.queue.getLength((error: any, length?: number) => {
      expect(length).toBeGreaterThan(0);
      crawler.stop(true);
      done();
    });
  });

  it("should discover all available linked resources", async () => {
    const crawler = makeCrawler("http://127.0.0.1:3000/");
    let linksDiscovered = 0;

    crawler.on("discoverycomplete", () => {
      linksDiscovered++;
    });

    crawler.start();
    await waitForCrawler(crawler);
    expect(linksDiscovered).toEqual(6);
  });

  it("should obey robots meta tags", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000/");
    crawler.start();

    crawler.on("discoverycomplete", (queueItem, resources) => {
      if (queueItem.path === "/nofollow") {
        expect(resources).toEqual([]);
        crawler.stop(true);
        done();
      }
    });
  });

  it("should obey rules in robots.txt", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000/");
    crawler.start();

    crawler.on("fetchdisallowed", (parsedURL) => {
      expect(parsedURL.path).toEqual("/forbidden");
      crawler.stop(true);
      done();
    });
  });

  it("should be able to disregard rules in robots.txt", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000/");
    crawler.respectRobotsTxt = false;
    crawler.start();

    crawler.on("fetchcomplete", (queueItem) => {
      if (queueItem.url === "http://127.0.0.1:3000/forbidden") {
        crawler.stop(true);
        done();
      }
    });
    crawler.on("complete", () => {
      done(new Error("Didn't visit forbidden URL (even though it should have)"));
    });
  });

  it("should obey robots.txt on different hosts", (done) => {
    const server = new Server({
      "/robots.txt": function (write: Function) {
        write(200, "User-agent: *\nDisallow: /disallowed\n");
      },

      "/disallowed": function (write: Function) {
        write(200, "This is forbidden crawler fruit");
      }
    });
    server.listen(3001);

    const crawler = makeCrawler("http://127.0.0.1:3000/to/other/port");
    crawler.start();

    crawler.on("fetchdisallowed", (parsedURL) => {
      expect(uri({
        protocol: parsedURL.protocol,
        hostname: parsedURL.host,
        port: parsedURL.port,
        path: parsedURL.path
      }).href()).toEqual("http://127.0.0.1:3001/disallowed");
      crawler.stop(true);
      server.close();
      done();
    });
  });

  it("should emit an error when robots.txt redirects to a disallowed domain", (done) => {
    const server = new Server({
      "/robots.txt": function (write: Function, redir: Function) {
        redir("http://example.com/robots.txt");
      }
    });
    server.listen(3002);

    const crawler = makeCrawler("http://127.0.0.1:3002/");
    crawler.start();

    crawler.on("robotstxterror", (error) => {
      expect(error.message).toContain("redirected to a disallowed domain");
      crawler.stop(true);
      server.close();
      done();
    });
  });

  it("should discover sitemap directives in robots.txt files", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000/");
    let queueaddCount = 0;

    crawler.on("queueadd", (queueItem) => {
      if (queueaddCount++ > 0) {
        return;
      }

      expect(queueItem.path).toEqual("/sitemap.xml");
      done();
    });

    crawler.start();
  });

  it("should support async event listeners for manual discovery", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000/");
    const fetchedResources: string[] = [];

    // @ts-expect-error
    crawler.discoverResources = false;
    crawler.queueURL("http://127.0.0.1:3000/async-stage1");

    crawler.on("fetchcomplete", function (queueItem, data) {
      const evtDone = crawler.wait();

      setTimeout(() => {
        fetchedResources.push(queueItem.url);

        if (String(data).match(/complete/i)) {
          return evtDone();
        }

        // Taking advantage of the fact that for these,
        // the sum total of the body data is a URL.
        expect(crawler.queueURL(String(data))).toBeTrue();

        evtDone();
      }, 10);
    });

    crawler.on("complete", function () {
      expect(fetchedResources).toIncludeSameMembers([
        "http://127.0.0.1:3000/",
        "http://127.0.0.1:3000/async-stage1",
        "http://127.0.0.1:3000/async-stage2",
        "http://127.0.0.1:3000/async-stage3"
      ]);

      done();
    });

    crawler.start();
  });

  it("should not throw an error if header Referer is undefined", async () => {
    const crawler = makeCrawler("http://127.0.0.1:3000/depth/1");
    crawler.maxDepth = 1;

    crawler.start();
    await waitForCrawler(crawler);
  });

  it("it should remove script tags if parseScriptTags is disabled", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000/script");
    crawler.parseScriptTags = false;

    crawler.start();

    crawler.on("complete", () => {
      crawler.queue.exists("http://127.0.0.1:3000/not/existent/file.js", (error: any, exists?: boolean) => {
        expect(exists).toBeFalse();
        done(error);
      });
    });
  });

  it("it should emit an error when resource is too big", async () => {
    const crawler = makeCrawler("http://127.0.0.1:3000/big");
    let visitedUrl = false;

    crawler.on("fetchdataerror", (queueItem) => {
      visitedUrl = visitedUrl || queueItem.url === "http://127.0.0.1:3000/big";
    });

    crawler.start();
    await waitForCrawler(crawler);
  });

  it("should allow initial redirect to different domain if configured", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000/domain-redirect");
    let queueaddCount = 0;

    crawler.allowInitialDomainChange = true;

    crawler.on("queueadd", (queueItem) => {
      if (queueaddCount++ === 1) {
        expect(queueItem.host).toEqual("localhost");
        crawler.stop(true);
        done();
      }
    });

    crawler.start();
  });

  it("should only allow redirect to different domain for initial request", async () => {
    const crawler = makeCrawler("http://127.0.0.1:3000/to-domain-redirect");
    let linksDiscovered = 0;

    crawler.on("discoverycomplete", () => {
      linksDiscovered++;
    });

    crawler.start();
    await waitForCrawler(crawler);
    expect(linksDiscovered).toEqual(1);
  });

  it("should disallow initial redirect to different domain by default", async () => {
    const crawler = makeCrawler("http://127.0.0.1:3000/domain-redirect");
    let linksDiscovered = 0;

    crawler.on("discoverycomplete", () => {
      linksDiscovered++;
    });

    crawler.start();
    await waitForCrawler(crawler);
    expect(linksDiscovered).toEqual(0);
  });

  it("should not increase depth on multiple redirects on the initial request", async () => {
    const crawler = makeCrawler("http://127.0.0.1:3000/domain-redirect2");
    let depth = 1;

    crawler.on("fetchredirect", (queueItem) => {
      if (queueItem.depth > 1) {
        depth = queueItem.depth;
      }
    });

    crawler.start();
    await waitForCrawler(crawler);
    expect(depth).toEqual(1);
  });

  it("should disallow initial redirect to different domain after a 2xx", async () => {
    const crawler = makeCrawler("http://127.0.0.1:3000/to-domain-redirect");
    let discoComplete = 0;

    crawler.allowInitialDomainChange = true;

    crawler.on("discoverycomplete", () => {
      discoComplete++;
    });

    crawler.start();
    await waitForCrawler(crawler);
    expect(discoComplete).toEqual(1);
  });

  // TODO
  // Test how simple error conditions are handled
});
