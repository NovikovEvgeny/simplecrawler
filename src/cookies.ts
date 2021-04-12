/**
 * @file simplecrawler's cookie jar module
 */

import { EventEmitter } from 'events';
import { NodeCallback } from './types';


export declare interface CookieJar {
  emit(event: 'addcookie', newCookie: Cookie): boolean;
  emit(event: 'removecookie', cookiesRemoved: Cookie[]): boolean;

  on(event: 'addcookie', listener: (newCookie: Cookie) => void): this;
  on(event: 'removecookie', listener: (cookiesRemoved: Cookie[]) => void): this;
}

export class CookieJar extends EventEmitter {
  private cookies: Cookie[] = [];

  /**
  * Adds a new cookie to the jar, either by creating a new {@link Cookie} object
  * from specific details such as name, value, etc., accepting a string from a
  * Set-Cookie header, or by passing in an existing {@link Cookie} object.
  * @param name Name of the new cookie
  * @param value Value of the new cookie
  * @param expiry Expiry timestamp of the new cookie in milliseconds
  * @param path Limits cookie to a path. Default is "/"
  * @param domain Limits cookie to a domain. Default is "*"
  * @param httponly Specifies whether to include the HttpOnly flag. Default is false
  * @return Returns the cookie jar instance to enable chained API calls
  */
  add(name: string | Cookie, value?: string, expiry?: string | number, path?: string, domain?: string, httponly?: boolean, callback?: NodeCallback<Cookie>): CookieJar {
    // TODO fix any
    let newCookie: any = {};

    if (arguments.length > 1) {
      newCookie = new Cookie(String(name), value, expiry, path, domain, httponly);
    } else if (name instanceof Cookie) {
      newCookie = name;
    } else {
      newCookie = Cookie.fromString(name);
    }

    const existingIndex = this.cookies.findIndex((cookie) => cookie.name === newCookie.name && cookie.matchDomain(newCookie.domain))

    if (existingIndex === -1) {
      this.cookies.push(newCookie);
    } else {
      this.cookies[existingIndex] = newCookie;
    }

    this.emit("addcookie", newCookie);

    if (callback instanceof Function) {
      callback(null, newCookie);
    }

    return this;
  }


  /**
  * Removes cookies from the cookie jar. If no domain and name are specified, all
  * cookies in the jar are removed.
  * @param name Name of the cookie to be removed
  * @param domain The domain that the cookie applies to
  * @return Returns an array of the cookies that were removed from the cookie jar
  */
  remove(name: string, domain: string, callback?: NodeCallback<Cookie[]>): Cookie[] {
    const cookiesRemoved: Cookie[] = [];

    this.cookies.forEach((cookie, index) => {
      // If the names don't match, we're not removing this cookie
      if (Boolean(name) && cookie.name !== name) {
        return false;
      }

      // If the domains don't match, we're not removing this cookie
      if (Boolean(domain) && !cookie.matchDomain(domain)) {
        return false;
      }

      // Matched. Remove!
      // TODO fix ts ignore
      //@ts-ignore
      cookiesRemoved.push(this.cookies.splice(index, 1));
    });

    this.emit("removecookie", cookiesRemoved);

    if (callback instanceof Function) {
      callback(null, cookiesRemoved);
    }

    return cookiesRemoved;
  };


  /**
  * Gets an array of cookies based on name and domain
  * @param name Name of the cookie to retrieve
  * @param domain Domain to retrieve the cookies from
  * @return Returns an array of cookies that matched the name and/or domain
  */
  get(name: string, domain: string, callback?: NodeCallback<Cookie[]>): Cookie[] {
    const cookies = this.cookies.filter((cookie) => {
      // If the names don't match, we're not returning this cookie
      if (Boolean(name) && cookie.name !== name) {
        return false;
      }
      // If the domains don't match, we're not returning this cookie
      if (Boolean(domain) && !cookie.matchDomain(domain)) {
        return false;
      }
      return true;
    });

    if (callback instanceof Function) {
      callback(null, cookies);
    }

    return cookies;
  };

  /**
  * Generates an array of headers based on the value of the cookie jar
  * @param domain The domain from which to generate cookies
  * @param path Filter headers to cookies applicable to this path
  * @return Returns an array of HTTP header formatted cookies
  */
  getAsHeader(domain?: string, path?: string, callback?: NodeCallback<string[]>): string[] {
    const headers = this.cookies.filter((cookie) => {
      if (cookie.isExpired()) {
        return false;
      }
      if (!domain && !path) {
        return true;
      }
      if (domain) {
        return cookie.matchDomain(domain);
      }
      if (path) {
        return cookie.matchPath(path);
      }
    }).map((cookie) => cookie.toOutboundString());

    if (callback instanceof Function) {
      callback(null, headers);
    }

    return headers;
  };

  /**
  * Adds cookies to the cookie jar based on an array of 'Set-Cookie' headers
  * provided by a web server. Duplicate cookies are overwritten.
  * @param headers One or multiple Set-Cookie headers to be added to the cookie jar
  * @return Returns the cookie jar instance to enable chained API calls
  */
  addFromHeaders(headers: string | string[], callback?: NodeCallback<undefined>): CookieJar {
    if (!Array.isArray(headers)) {
      headers = [headers];
    }
    headers.forEach((header) => this.add(header));

    if (callback instanceof Function) {
      callback(null);
    }

    return this;
  };

  /**
  * Generates a newline-separated list of all cookies in the jar
  * @return Returns stringified versions of all cookies in the jar in a newline separated string
  */
  toString(): string {
    return this.getAsHeader().join("\n");
  }
}


export class Cookie {
  public name: string;
  public value: string;
  public expires: number;
  public path: string;
  public domain: string;
  public httponly: boolean;

  constructor(name: string, value: string = "", expires: string | number = -1, path: string = "/", domain: string = "*", httponly: boolean = false) {
    if (!name) {
      throw new Error("A name is required to create a cookie.");
    }

    // Parse date to timestamp - consider it never expiring if timestamp is not
    // passed to the function
    if (expires) {
      if (typeof expires !== "number") {
        expires = new Date(expires).getTime();
      }
    } else {
      expires = -1;
    }

    this.name = name;
    this.value = value;
    this.expires = expires;
    this.path = path;
    this.domain = domain;
    this.httponly = Boolean(httponly);
  }

  // TODO fix all ` || ""`
  static fromString(str?: string): Cookie {
    if (!str || typeof str !== "string") {
      throw new Error("String must be supplied to generate a cookie.");
    }

    function parseKeyVal(input: string) {
      const key = input.split(/=/).shift();
      const val = input.split(/=/).slice(1).join("=");

      return [key, val];
    }

    str = str.replace(/^\s*set-cookie\s*:\s*/i, "");

    const parts = str.split(/\s*;\s*/i);
    const name = parseKeyVal(parts.shift() || "");
    const keyValParts: { name: string, value: string, [key: string]: string } = {
      name: name[0] || "",
      value: name[1] || "",
    };

    parts
      .filter((input) => Boolean(input.replace(/\s+/ig, "").length))
      .map(parseKeyVal)
      .forEach((keyval) => {
        const key = String(keyval[0]).toLowerCase().replace(/[^a-z0-9]/ig, "");
        keyValParts[key] = keyval[1] || "";
      });

    return new Cookie(
      keyValParts.name,
      keyValParts.value,
      keyValParts.expires || keyValParts.expiry,
      keyValParts.path,
      keyValParts.domain,
      keyValParts.hasOwnProperty("httponly")
    );
  }

  /**
  * Outputs the cookie as a string, in the form of an outbound Cookie header
  * @return Stringified version of the cookie
  */
  toOutboundString(): string {
    return `${this.name}=${this.value}`;
  }

  /**
  * Outputs the cookie as a string, in the form of a Set-Cookie header
  * @param  includeHeader Controls whether to include the 'Set-Cookie: ' header name at the beginning of the string.
  * @return Stringified version of the cookie
  */
  toString(includeHeader: boolean): string {
    let res = "";

    if (includeHeader) {
      res = "Set-Cookie: ";
    }

    res += `${this.toOutboundString()}; `;

    if (this.expires > 0) {
      res += `Expires=${new Date(this.expires).toUTCString()}; `;
    }

    if (this.path) {
      res += `Path=${this.path}; `;
    }

    if (this.domain) {
      res += `Domain=${this.domain}; `;
    }

    if (this.httponly) {
      res += "Httponly; ";
    }

    return res;
  }

  /**
  * Determines whether a cookie has expired or not
  * @return Returns true if the cookie has expired. Otherwise, it returns false.
  */
  isExpired(): boolean {
    if (this.expires < 0) {
      return false;
    }
    return this.expires < Date.now();
  }

  /**
  * Determines whether a cookie matches a given domain
  * @param  domain The domain to match against
  * @return Returns true if the provided domain matches the cookie's domain. Otherwise, it returns false.
  */
  matchDomain(domain: string): boolean {
    if (this.domain === "*") {
      return true;
    }

    const reverseDomain = this.domain.split("").reverse().join("");
    const reverseDomainComp = domain.split("").reverse().join("");

    return reverseDomain.startsWith(reverseDomainComp);
  }

  /**
  * Determines whether a cookie matches a given path
  * @param path The path to match against
  * @return Returns true if the provided path matches the cookie's path. Otherwise, it returns false.
  */
  matchPath(path: string): boolean {
    if (!this.path) {
      return true;
    }

    return path.startsWith(this.path);
  }
}
