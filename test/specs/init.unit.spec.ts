/* eslint-env jest */
import "jest-extended";
import { Crawler, FetchQueue, Cache } from "../../src";

// Ensures that the crawler object is requireable, and doesn't die horribly
// right off the bat
describe("Crawler object", () => {
  it("should be able to be required", function () {
    expect(Crawler).toBeFunction();
  });

  it("should import the queue", function () {
    expect(FetchQueue).toBeFunction();
  });

  it("should import the cache system", function () {
    expect(Cache).toBeFunction();
  });

  it("should be able to be initialised", function () {
    const crawler = new Crawler("http://127.0.0.1:3000/");
    expect(crawler).toBeInstanceOf(Crawler);
  });
});
