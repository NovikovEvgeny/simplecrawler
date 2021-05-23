// Tests whether a given resource is considered 'valid' for crawling under
// a number of different conditions.

/* eslint-env jest */
import "jest-extended";

import * as zlib from "zlib";
import * as http from "http";
import { QueueItem } from "../../src/types";
import { Crawler } from "../../src";
import { waitForCrawler } from "../util";

// TODO move to utils
function makeCrawler(url: string) {
  const crawler = new Crawler(url);
  crawler.interval = 5;
  return crawler;
};

describe("Resource validity checker", () => {

  it("should be able to determine whether a domain is in crawl scope", () => {
    const crawler = makeCrawler("http://example.com:3000");

    // The domain itself should be allowed.
    expect(crawler.domainValid("example.com")).toBeTrue();

    // Whereas other domains should not be allowed.
    expect(crawler.domainValid("somethingelse")).toBeFalse();
    expect(crawler.domainValid("microsoft.com")).toBeFalse();
    expect(crawler.domainValid("a.really.complex.fqdn.")).toBeFalse();

  });

  it("should be able to determine whether a domain is a subdomain of another", () => {

    const crawler = makeCrawler("http://example.com:3000");

    // Enable scanning subdomains, important for this test
    crawler.scanSubdomains = true;

    // The domain itself isn't a subdomain per-se, but should be allowed
    expect(crawler.domainValid("example.com")).toBeTrue();

    // WWW is a subdomain
    expect(crawler.domainValid("www.example.com")).toBeTrue();

    // More complex examples
    expect(crawler.domainValid("testing.example.com")).toBeTrue();

    // Multiple levels
    expect(crawler.domainValid("system.cache.example.com")).toBeTrue();

    // These aren't valid...
    expect(crawler.domainValid("com.example")).toBeFalse();
    expect(crawler.domainValid("example.com.au")).toBeFalse();
    expect(crawler.domainValid("example.us")).toBeFalse();

  });

  it("should consider WWW domains and non-WWW domains alike by default", () => {

    const crawler = makeCrawler("http://example.com:3000");

    // Explicitly disallow crawling subdomains, important for this test
    crawler.scanSubdomains = false;

    // The domain itself isn't a subdomain per-se, but should be allowed
    expect(crawler.domainValid("example.com")).toBeTrue();

    // Its WWW domain should be allowed by default
    expect(crawler.domainValid("www.example.com")).toBeTrue();

  });

  it("should consider WWW domains and non-WWW domains as separate if requested", () => {

    const crawler = makeCrawler("http://example.com:3000");

    // Explicitly disallow crawling subdomains, important for this test
    crawler.scanSubdomains = false;

    // Explicitly consider www a separate subdomain (ordinarily, true)
    crawler.ignoreWWWDomain = false;

    // The domain itself isn't a subdomain per-se, but should be allowed
    expect(crawler.domainValid("example.com")).toBeTrue();

    // Its WWW domain should be allowed by default
    expect(crawler.domainValid("www.example.com")).toBeFalse();

  });

  it("should permit a specified set of domains based on the internal whitelist", () => {

    const crawler = makeCrawler("http://example.com:3000");

    // Add a few specific subdomains
    crawler.domainWhitelist.push("foo.com");
    crawler.domainWhitelist.push("bar.com");
    crawler.domainWhitelist.push("abcdefg.net.nz");

    // The domain itself isn't a subdomain per-se, but should be allowed
    expect(crawler.domainValid("example.com")).toBeTrue();

    // The explicitly set domains should be permitted
    expect(crawler.domainValid("foo.com")).toBeTrue();
    expect(crawler.domainValid("bar.com")).toBeTrue();
    expect(crawler.domainValid("abcdefg.net.nz")).toBeTrue();

    // These domains were never whitelisted, and should be denied
    expect(crawler.domainValid("wumpus.com")).toBeFalse();
    expect(crawler.domainValid("fish.net")).toBeFalse();

  });

  it("should strip WWW from processed URL's altogether", () => {

    const crawler = makeCrawler("http://example.com:3000");

    crawler.stripWWWDomain = true;

    // @ts-expect-error
    expect(crawler.processURL("http://www.example.com").host).toEqual("example.com");
    // @ts-expect-error
    expect(crawler.processURL("http://example.com").host).toEqual("example.com");

    crawler.stripWWWDomain = false;
    // @ts-expect-error
    expect(crawler.processURL("http://www.example.com").host).toEqual("www.example.com");
  });

  it("should strip query strings from processed URL's", () => {

    const crawler = makeCrawler("http://example.com");

    crawler.stripQuerystring = true;
    // @ts-expect-error
    expect(crawler.processURL("http://example.com/example?q=crawler").path).toEqual("/example");
    // @ts-expect-error
    expect(crawler.processURL("http://example.com/test?q=crawler&foo=bar").path).toEqual("/test");

    crawler.stripQuerystring = false;
    // @ts-expect-error
    expect(crawler.processURL("http://example.com/example?q=crawler").path).toEqual("/example?q=crawler");
    // @ts-expect-error
    expect(crawler.processURL("http://example.com/test?q=crawler&foo=bar").path).toEqual("/test?q=crawler&foo=bar");
  });

  it("should canonicalize query strings by sorting parameters", () => {

    const crawler = makeCrawler("http://example.com");

    crawler.sortQueryParameters = true;
    // @ts-expect-error
    expect(crawler.processURL("http://example.com/example?s=1&r=9&b=3&r=2&r=7").path).toEqual("/example?b=3&r=9&r=2&r=7&s=1");
    // @ts-expect-error
    expect(crawler.processURL("http://example.com/test?q=crawler&foo=bar").path).toEqual("/test?foo=bar&q=crawler");

    crawler.sortQueryParameters = false;
    // @ts-expect-error
    expect(crawler.processURL("http://example.com/example?s=1&r=9&b=3&r=2&r=7").path).toEqual("/example?s=1&r=9&r=2&r=7&b=3");
    // ^^^ note: urijs normalize() rearranges the query parameters, grouping those with same name.
    // @ts-expect-error
    expect(crawler.processURL("http://example.com/test?q=crawler&foo=bar").path).toEqual("/test?q=crawler&foo=bar");
  });

  it("should throw out junky or invalid URLs without dying", () => {

    const crawler = makeCrawler("http://127.0.0.1:3000");

    const urlContext = {
      url: "http://www.example.com"
    };


    expect(crawler.processURL("", urlContext as QueueItem)).toBeFalse();
    expect(crawler.processURL("\n\n", urlContext as QueueItem)).toBeFalse();
    expect(crawler.processURL("ur34nfie4985:s////dsf/", urlContext as QueueItem)).toBeFalse();

  });

  it("should process URL's without a referer", () => {

    const crawler = makeCrawler("http://127.0.0.1:3000");

    expect(crawler.processURL("/stage2")).toMatchObject({
      url: "http://127.0.0.1:3000/stage2",
      depth: 1
    });

    expect(crawler.processURL("http://example.com/blurp")).toMatchObject({
      url: "http://example.com/blurp",
      depth: 1
    });

    // Test processing of a URL with referer as well for comparison
    expect(crawler.processURL("/test", {
      url: "http://example.com",
      depth: 2
    } as QueueItem)).toMatchObject({
      url: "http://example.com/test",
      depth: 3
    });

  });

  it("should permit fetching of specified protocols based on internal whitelist", () => {

    const crawler = makeCrawler("http://example.com:3000");

    // Protocols supported by default
    expect(crawler.protocolSupported("http://google.com")).toBeTrue();
    expect(crawler.protocolSupported("https://google.com")).toBeTrue();
    expect(crawler.protocolSupported("rss://google.com")).toBeTrue();
    expect(crawler.protocolSupported("feed://google.com")).toBeTrue();
    expect(crawler.protocolSupported("atom://google.com")).toBeTrue();

    // Protocols not supported
    expect(crawler.protocolSupported("gopher://google.com")).toBeFalse();
    expect(crawler.protocolSupported("ws://google.com")).toBeFalse();
    expect(crawler.protocolSupported("wss://google.com")).toBeFalse();
  });

  it("should permit parsing of specified resources based on mimetype checks", () => {
    const crawler = makeCrawler("http://example.com:3000");

    crawler.supportedMimeTypes.push("image/png");

    // Protocols supported by default
    expect(crawler.mimeTypeSupported("text/plain")).toBeTrue();

    // Crawler should be able to process all plain-text formats
    expect(crawler.mimeTypeSupported("text/SomeFormat")).toBeTrue();
    expect(crawler.mimeTypeSupported("text/html")).toBeTrue();

    // XML based formats
    expect(crawler.mimeTypeSupported("application/rss+xml")).toBeTrue();
    expect(crawler.mimeTypeSupported("application/html+xml")).toBeTrue();
    expect(crawler.mimeTypeSupported("application/xhtml+xml")).toBeTrue();

    // Some weird JS mimetypes
    expect(crawler.mimeTypeSupported("application/javascript")).toBeTrue();

    // Anything with XML...
    expect(crawler.mimeTypeSupported("xml/manifest")).toBeTrue();

    // A mimetype specified as a string instead of as a RegExp
    expect(crawler.mimeTypeSupported("image/png")).toBeTrue();

    // And these should fail
    expect(crawler.mimeTypeSupported("application/octet-stream")).toBeFalse();
    expect(crawler.mimeTypeSupported("img/png")).toBeFalse();
    expect(crawler.mimeTypeSupported("video/webm")).toBeFalse();
    expect(crawler.mimeTypeSupported("blah/blah")).toBeFalse();

  });

  const decodingTest = function (pathname: string, callback: (queueItem: QueueItem, responseBody: string | Buffer, response: http.IncomingMessage) => void) {
    const crawler = makeCrawler("http://127.0.0.1:3000" + pathname);
    crawler.decodeResponses = true;

    crawler.on("fetchcomplete", callback);
    crawler.start();

    return crawler;
  };

  it("should decode responses based on Content-Type headers", (done) => {
    decodingTest("/encoded/header", (queueItem, responseBody) => {
      expect(responseBody.toString().trim()).toEqual("Eyjafjallajökull er fimmti stærsti jökull Íslands.");
      done();
    });
  });

  it("should decode responses based on inline charset definitions", (done) => {
    decodingTest("/encoded/inline", (queueItem, responseBody) => {
      expect(responseBody.toString().trim()).toEqual("<meta charset=\"iso-8859-1\"><p>Pippi Långstrump är en av Astrid Lindgrens mest kända litterära figurer.<p>");
      done();
    });
  });

  it("should decode responses based on older inline charset definitions", (done) => {
    decodingTest("/encoded/old-inline", (queueItem, responseBody) => {
      expect(responseBody.toString().trim()).toEqual("<meta http-equiv=\"Content-Type\" content=\"text/html; charset=iso-8859-1\" /><p>Preikestolen er et fjellplatå på nordsiden av Lysefjorden i Forsand.<p>");
      done();
    });
  });

  it("should decode responses that are empty", (done) => {
    decodingTest("/encoded/empty", (queueItem, responseBody) => {
      expect(responseBody).toBeString();
      expect(responseBody).toEqual("");
      done();
    });
  });

  it("should decompress gzipped responses by default", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000/compressed/gzip");

    // TODO move expect from callback
    crawler.on("fetchcomplete", (queueItem, responseBody) => {
      expect(responseBody.toString()).toEqual("Yay, you know how to deal with gzip compression!");
      done();
    });
    crawler.start();
  });

  it("should decompress deflated responses by default", (done) => {
    const crawler = makeCrawler("http://127.0.0.1:3000/compressed/deflate");

    crawler.on("fetchcomplete", (queueItem, responseBody) => {
      expect(responseBody.toString()).toEqual("Yay, you know how to deal with deflate compression!");
      done();
    });
    crawler.start();
  });

  it("should be able to not decompress responses (but still find inline resources)", async () => {
    const crawler = makeCrawler("http://127.0.0.1:3000/compressed/link");
    let fetchedPagesCount = 0;

    crawler.interval = 50;
    crawler.decompressResponses = false;

    crawler.on("fetchcomplete", function (queueItem, responseBody) {
      fetchedPagesCount++;

      const body = queueItem.path === "/compressed/link" ?
        "<a href='/compressed/gzip'>Go to gzip</a>" :
        "Yay, you know how to deal with gzip compression!";

      // TODO move expect from callback
      zlib.gzip(body, function (error, result) {
        expect(result.toString()).toEqual(responseBody.toString());
      });
    });

    crawler.start();
    await waitForCrawler(crawler);
    expect(fetchedPagesCount).toEqual(2);
  });
});
