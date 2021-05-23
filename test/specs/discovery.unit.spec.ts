/* eslint-env jest */
import "jest-extended";

import { Crawler } from "../../src/crawler";
import { QueueItem } from "../../src/types";

describe("Crawler link discovery unit tests", () => {
  let discover: (resourceText: string, queueItem?: QueueItem) => string[];
  let crawler: Crawler;

  beforeEach(() => {
    crawler = new Crawler("http://example.com");

    discover = function (resourceText: string, queueItem?: QueueItem) {
      queueItem = queueItem || {} as QueueItem;

      const resources = crawler.discoverResources(resourceText);
      return crawler.cleanExpandResources(resources, queueItem);
    };
  });

  it("should discover http/s prefixed URLs in the document", () => {
    const links = discover("  blah blah http://google.com/ " +
      " blah blah https://fish.com/resource blah " +
      " //example.com");

    expect(links).toBeArrayOfSize(2);
    expect(links[0]).toEqual("http://google.com/");
    expect(links[1]).toEqual("https://fish.com/resource");
  });

  it("should discover URLS in quoted attributes in the document", () => {
    const links =
      discover("  <a href='google.com'> " +
        " <img src=\"http://example.com/resource with spaces.txt\"> " +
        " url('thingo.com/test.html')");

    expect(links).toBeArrayOfSize(4);
    expect(links[0]).toEqual("google.com");
    expect(links[1]).toEqual("http://example.com/resource%20with%20spaces.txt");
    expect(links[2]).toEqual("thingo.com/test.html");
  });

  it("should discover URLS in unquoted attributes in the document", () => {
    const links =
      discover("  <a href=google.com> " +
        " <img src=http://example.com/resource with spaces.txt> " +
        " url(thingo.com/test.html)");

    expect(links).toBeArrayOfSize(3);
    expect(links[0]).toEqual("google.com");
    expect(links[1]).toEqual("http://example.com/resource");
    expect(links[2]).toEqual("thingo.com/test.html");
  });

  it("should replace all '&amp;'s with ampersands", () => {
    const links =
      discover("<a href='http://example.com/resource?with&amp;query=params&amp;and=entities'>");

    expect(links).toBeArrayOfSize(2);
    expect(links[0]).toEqual("http://example.com/resource?with&query=params&and=entities");
    expect(links[1]).toEqual("http://example.com/resource");
  });

  it("should replace all '&#38;'s and '&#x00026;'s with ampersands", () => {
    const links =
      discover("<a href='http://example.com/resource?with&#38;query=params&#x00026;and=entities'>");

    expect(links).toBeArrayOfSize(2);
    expect(links[0]).toEqual("http://example.com/resource?with&query=params&and=entities");
    expect(links[1]).toEqual("http://example.com/resource");
  });

  it("should replace all '&#x2f;'s with slashes", () => {
    const links =
      discover("<a href='http:&#x2f;&#x2f;example.com&#x2f;resource'>");

    expect(links).toBeArrayOfSize(1);
    expect(links[0]).toEqual("http://example.com/resource");
  });

  it("should find and follow meta redirects", () => {
    const links =
      discover("<meta http-equiv='refresh' content='0; url=/my/other/page.html'>", {
        url: "http://example.com/"
      } as QueueItem);

    expect(links).toBeArrayOfSize(1);
    expect(links[0]).toEqual("http://example.com/my/other/page.html");
  });

  it("should ignore HTML comments with parseHTMLComments = false", () => {
    crawler.parseHTMLComments = false;

    const links =
      discover("  <!-- http://example.com/oneline_comment --> " +
        " <a href=google.com> " +
        " <!-- " +
        " http://example.com/resource " +
        " <a href=example.com> " +
        " -->");

    expect(links).toBeArrayOfSize(1);
    expect(links[0]).toEqual("google.com");
  });

  it("should ignore script tags with parseScriptTags = false", () => {

    crawler.parseScriptTags = false;

    const links =
      discover("  <script>var a = \"<a href='http://example.com/oneline_script'></a>\";</script> " +
        " <a href=google.com> " +
        " <script type='text/javascript'> " +
        " http://example.com/resource " +
        " <a href=example.com> " +
        " </SCRIPT>");

    expect(links).toBeArrayOfSize(1);
    expect(links[0]).toEqual("google.com");
  });

  it("should discover URLs legitimately ending with a quote or parenthesis", () => {

    const links =
      discover("<a href='example.com/resource?with(parentheses)'>" +
        " <a href='example.com/resource?with\"double quotes\"'>" +
        " <a href=\"example.com/resource?with'single quotes'\">");

    expect(links).toBeArrayOfSize(3);
    expect(links[0]).toEqual("example.com/resource?with%28parentheses%29");
    expect(links[1]).toEqual("example.com/resource?with%22double+quotes%22");
    expect(links[2]).toEqual("example.com/resource?with%27single+quotes%27");
  });

  it("should discard 'javascript:' links except for any arguments in there passed to functions", () => {

    const links =
      discover("<a href='javascript:;'>" +
        " <a href='javascript: void(0);'>" +
        " <a href='javascript: goToURL(\"/page/one\")'>", { url: "http://example.com/" } as QueueItem);

    expect(links).toBeArrayOfSize(2);
    expect(links[0]).toEqual("http://example.com/");
    expect(links[1]).toEqual("http://example.com/page/one");
  });

  it("should not pick up 'href' or 'src' inside href attributes as full URL's", () => {
    const links =
      discover("<a href='https://example.com/?src=3'>My web page</a>");

    expect(links).toBeArrayOfSize(2);
    expect(links[0]).toEqual("https://example.com/?src=3");
    expect(links[1]).toEqual("https://example.com/");
  });

  it("should strip fragment identifiers from URL's", () => {

    const links =
      discover("<a href='https://example.com/#section'>My web page</a>" +
        "<a href='/other/page#blabla'>Link</a>" +
        "<a href='#section'>Section</a>", { url: "https://example.com/" } as QueueItem);

    expect(links).toBeArrayOfSize(2);
    expect(links[0]).toEqual("https://example.com/");
    expect(links[1]).toEqual("https://example.com/other/page");
  });

  it("should find resources in srcset attributes", () => {
    const links =
      discover("<img src='pic.png' srcset='https://example.com/pic-200.png, /pic-400.png 400w, pic-800.png 2x'>", {
        url: "https://example.com/"
      } as QueueItem);
    expect(links).toEqual([
      "https://example.com/pic.png",
      "https://example.com/pic-200.png",
      "https://example.com/pic-400.png",
      "https://example.com/pic-800.png"
    ]);
  });

  it("should respect nofollow values in robots meta tags", () => {

    expect(discover("<meta name='robots' content='nofollow'><a href='/stage2'>Don't follow me!</a>"))
      .toEqual([]);

    expect(discover("<meta name='robots' content='nofollow, noindex'><a href='/stage2'>Don't follow me!</a>"))
      .toEqual([]);
  });
});
