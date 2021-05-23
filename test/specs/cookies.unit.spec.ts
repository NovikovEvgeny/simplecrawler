// Ensures that cookie support is functional and reliable across
// a variety of different cookie formats. The more cookies I can add to this
// cookies array, the better the tests!

/* eslint-env jest */
import "jest-extended"
import { CookieJar, Cookie } from "../../src/cookies";

const cookies = [
  "Set-Cookie: RMID=007f010019155170d6ca005f; Expires=Sat, 19 Apr 2099 05:31:54 GMT; Path=/; Domain=.nytimes.com;",
  "Set-cookie: adxcs=-; path=/; domain=.nytimes.com",
  "Set-Cookie: PREF=ID=8c63f2522e22574d:FF=0:TM=1366349569:LM=1366349569:S=p1Urbmfwfs-R573P; expires=Sun, 19-Apr-2099 05:32:49 GMT; path=/; domain=.google.com",
  "Set-Cookie: NID=67=DhLO04YPAMlhETrTIe2oFPqWZfypQXLZfCIPItOvf70zhtUEMEItYfdVh6aROEzRHqtd9jHT6HJ7Oo93eqP3cjYNp8GgShfa6r0WVbsmQQRUvutbjBOPwzo7ybwYcWdB; expires=Sat, 19-Oct-2099 05:32:49 GMT; path=/; domain=.google.com; HttpOnly",
  "Set-Cookie: fpc=d=Yq1z8hbA9WextmPFlb7suMTfMRgtSc2FyzAB7now1ExfUZ.eW7s4QSwSKlB6ZB0juN8OLZxWf_XXEIcspYaQmVVD0mD0xJ.xpXBCSw5Dl_Ql6n.RLoM.7CnTbNSsiSr2fkNiCN47tRUB4j8iWevNwQdFDn1hB8z8t1xwWt76n.sLIRY9p2_jTBhukfSD4SBpBkJhI1o-&v=2; expires=Sat, 19-Apr-2099 05:48:42 GMT; path=/; domain=www.yahoo.com",
  "Set-Cookie: test=test; path=/test; domain=test.com"
];


describe("Cookies unit tests", () => {

  it("should be able parse from string properly", () => {
    expect(Cookie).toBeFunction();
    expect(Cookie.fromString).toBeFunction();
    expect(Cookie.fromString(cookies[0])).toBeObject();
    expect(Cookie.fromString(cookies[0])).toBeInstanceOf(Cookie);

    let tmpCookie = Cookie.fromString(cookies[0]);
    expect(tmpCookie).toEqual({
      name: "RMID",
      value: "007f010019155170d6ca005f",
      expires: 4080259914000,
      path: "/",
      domain: ".nytimes.com",
      httponly: false,
    });

    // Test the next cookie...
    tmpCookie = Cookie.fromString(cookies[1]);
    expect(tmpCookie).toEqual({
      name: "adxcs",
      value: "-",
      expires: -1,
      path: "/",
      domain: ".nytimes.com",
      httponly: false,
    });
  });

  it("should be able to test for expiry", () => {
    // Create a new cookie that should already have expired...
    let tmpCookie = new Cookie("test", "test", Date.now() - 1000);

    expect(tmpCookie.isExpired()).toBeTrue();

    // Create a new cookie with an expiry 20 seconds in the future
    tmpCookie = new Cookie("test", "test", Date.now() + 20000);

    expect(tmpCookie.isExpired()).toBeFalse();
  });

  it("should be able to output the cookie object as a string", () => {
    cookies.forEach((cookie) => {
      const tmpCookie = Cookie.fromString(cookie);
      const outputString = tmpCookie.toString(true);
      const reParsedCookie = Cookie.fromString(outputString);

      expect(tmpCookie.name).toEqual(reParsedCookie.name);
      expect(tmpCookie.value).toEqual(reParsedCookie.value);
      expect(tmpCookie.expires).toEqual(reParsedCookie.expires);
      expect(tmpCookie.path).toEqual(reParsedCookie.path);
      expect(tmpCookie.domain).toEqual(reParsedCookie.domain);
      expect(tmpCookie.httponly).toEqual(reParsedCookie.httponly);
    });
  });

  describe("Cookie Jar unit tests", () => {

    it("should be able to be instantiated", () => {
      // eslint-disable-next-line
      const cookieJar = new CookieJar();
    });

    it("should be able to add cookies", () => {
      const cookieJar = new CookieJar();

      cookies.forEach((cookie) => {
        const parsedCookie = Cookie.fromString(cookie);
        cookieJar.add(
          parsedCookie.name,
          parsedCookie.value,
          parsedCookie.expires,
          parsedCookie.path,
          parsedCookie.domain,
          parsedCookie.httponly);

        const cookiesAdded = cookieJar.get(parsedCookie.name);
        const parsedCookie2 = cookiesAdded.pop() as Cookie;

        expect(parsedCookie2.name).toEqual(parsedCookie.name);
        expect(parsedCookie2.value).toEqual(parsedCookie.value);
        expect(parsedCookie2.expires).toEqual(parsedCookie.expires);
        expect(parsedCookie2.path).toEqual(parsedCookie.path);
        expect(parsedCookie2.domain).toEqual(parsedCookie.domain);
        expect(parsedCookie2.httponly).toEqual(parsedCookie.httponly);
      });

      expect((cookieJar as any).cookies.length).toEqual(cookies.length);
    });

    it("should be able to remove cookies by name", () => {
      const cookieJar = new CookieJar();

      cookies.forEach((cookie) => {
        const parsedCookie = Cookie.fromString(cookie);

        cookieJar.add(
          parsedCookie.name,
          parsedCookie.value,
          parsedCookie.expires,
          parsedCookie.path,
          parsedCookie.domain,
          parsedCookie.httponly);
      });

      expect((cookieJar as any).cookies.length).toEqual(cookies.length);

      cookies.forEach((cookie, index) => {
        const parsedCookie = Cookie.fromString(cookie);

        cookieJar.remove(parsedCookie.name);

        expect((cookieJar as any).cookies.length).toEqual(cookies.length - (index + 1));
      });
    });

    it("should be able to retrieve cookies by name", () => {
      const cookieJar = new CookieJar();

      cookies.forEach((cookie) => {
        const parsedCookie = Cookie.fromString(cookie);

        cookieJar.add(
          parsedCookie.name,
          parsedCookie.value,
          parsedCookie.expires,
          parsedCookie.path,
          parsedCookie.domain,
          parsedCookie.httponly);

        const returnedCookies = cookieJar.get(parsedCookie.name);
        const parsedCookie2 = returnedCookies.pop() as Cookie;

        expect(parsedCookie2.name).toEqual(parsedCookie.name);
        expect(parsedCookie2.value).toEqual(parsedCookie.value);
        expect(parsedCookie2.expires).toEqual(parsedCookie.expires);
        expect(parsedCookie2.path).toEqual(parsedCookie.path);
        expect(parsedCookie2.domain).toEqual(parsedCookie.domain);
        expect(parsedCookie2.httponly).toEqual(parsedCookie.httponly);
      });
    });

    it("should be able to accept cookies from a header/s", () => {
      const cookieJar = new CookieJar();
      cookieJar.addFromHeaders(cookies);

      cookies.forEach((cookie) => {
        const parsedCookie = Cookie.fromString(cookie);
        const returnedCookies = cookieJar.get(parsedCookie.name);
        const parsedCookie2 = returnedCookies.slice(0, 1).pop() as Cookie;

        expect(returnedCookies.length).toEqual(1);
        expect(parsedCookie2.name).toEqual(parsedCookie.name);
        expect(parsedCookie2.value).toEqual(parsedCookie.value);
        expect(parsedCookie2.expires).toEqual(parsedCookie.expires);
        expect(parsedCookie2.path).toEqual(parsedCookie.path);
        expect(parsedCookie2.domain).toEqual(parsedCookie.domain);
        expect(parsedCookie2.httponly).toEqual(parsedCookie.httponly);
      });
    });

    it("should be able to generate a header from internal storage", () => {
      const cookieJar = new CookieJar();
      cookieJar.addFromHeaders(cookies);
      const comparisonHeaderList = cookieJar.getAsHeader();

      expect(comparisonHeaderList).toBeArrayOfSize(cookies.length);

      comparisonHeaderList.forEach((header, index) => {
        const parsedCookie = Cookie.fromString(cookies[index]);
        const parsedCookie2 = Cookie.fromString(header);

        expect(parsedCookie2.name).toEqual(parsedCookie.name);
        expect(parsedCookie2.value).toEqual(parsedCookie.value);
      });
    });

    it("should be able to filter generated headers by domain and path", () => {
      const cookieJar = new CookieJar();
      cookieJar.addFromHeaders(cookies);
      let comparisonHeaderList = cookieJar.getAsHeader("nytimes.com");

      expect(comparisonHeaderList).toBeArrayOfSize(2);

      comparisonHeaderList = cookieJar.getAsHeader(undefined, "/");

      // Even though there's 6 cookies.
      expect(comparisonHeaderList).toBeArrayOfSize(5);
    });

    it("should be able to filter generated headers by expiry", () => {
      const cookieJar = new CookieJar();
      cookieJar.addFromHeaders(cookies);

      // set the expiry on one of the headers to some point far in the past
      (cookieJar as any).cookies[0].expires = 0;

      // Get the headers...
      const comparisonHeaderList = cookieJar.getAsHeader();

      expect(comparisonHeaderList).toBeArrayOfSize(cookies.length - 1);
    });
  });
});
