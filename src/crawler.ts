/**
 * @file simplecrawler is a straightforward, event driven web crawler
 * @author Christopher Giffard <christopher.giffard@cgiffard.com>
 * @author Fredrik Ekelund <fredrik@fredrik.computer>
 */

import { FetchQueue, QueueItemStatus } from './queue';
import { CookieJar } from './cookies';

import * as http from 'http';
import * as https from 'https';
import { EventEmitter } from 'events';
import uri from 'urijs';
import * as async from 'async';
import * as zlib from 'zlib';
import * as iconv from 'iconv-lite';
import robotsTxtParser from 'robots-parser';
import { AnyObject, CacheObjectGet, FetchQueueInterface, NodeCallback2, QueueAddError, QueueItem, SimpleCache } from './types';
import { enumerable } from './decorators';


// TODO readFile
const packageJson = require("../package.json");

const QUEUE_ITEM_INITIAL_DEPTH = 1;


/**
* Performs string replace operations on a URL string. Eg. removes HTML
* attribute fluff around actual URL, replaces leading "//" with absolute
* protocol etc.
* @param URL The URL to be cleaned
* @param queueItem The queue item representing the resource where this URL was discovered
* @return Returns the cleaned URL
*/
function cleanURL(URL: string, queueItem: QueueItem): string {
  const cleanedUrl = URL
    .replace(/^(?:\s*href|\s*src)\s*=+\s*/i, "")
    .replace(/^\s*/, "")
    .replace(/^(['"])(.*)\1$/, "$2")
    .replace(/^url\((.*)\)/i, "$1")
    .replace(/^javascript:\s*(\w*\(['"](.*)['"]\))*.*/i, "$2")
    .replace(/^(['"])(.*)\1$/, "$2")
    .replace(/^\((.*)\)$/, "$1")
    .replace(/^\/\//, queueItem.protocol + "://")
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/gi, "&")
    .replace(/&#x00026;/gi, "&")
    .replace(/&#x2f;/gi, "/")
    .split("#")
    .shift();

  return cleanedUrl ? cleanedUrl.trim() : '';
}


export declare interface Crawler {
  /**
   * Fired when the crawl starts. This event gives you the opportunity to
   * adjust the crawler's configuration, since the crawl won't actually start
   * until the next processor tick.
   */
  emit(event: "crawlstart"): boolean;
  on(event: "crawlstart", listener: () => void): this;

  /**
   * Fired when the discovery of linked resources has completed
   * @param queueItem The queue item that represents the document for the discovered resources
   * @param resources An array of discovered and cleaned URL's
   */
  emit(event: "discoverycomplete", queueItem: QueueItem, resources: string[]): boolean;
  on(event: "discoverycomplete", listener: (queueItem: QueueItem, resources: string[]) => void): this;

  /**
   * Fired when a resource wasn't queued because of an invalid domain name
   * @param queueItem The queue item representing the disallowed URL
   */
  emit(event: "invaliddomain", queueItem: QueueItem): boolean;
  on(event: "invaliddomain", listener: (queueItem: QueueItem) => void): this;

  /**
   * Fired when a resource wasn't queued because it was disallowed by the
   * site's robots.txt rules
   * @param queueItem The queue item representing the disallowed URL
   */
  emit(event: "fetchdisallowed", queueItem: QueueItem): boolean;
  on(event: "fetchdisallowed", listener: (queueItem: QueueItem) => void): this;


  /**
   * Fired when a fetch condition returns an error
   * @param queueItem The queue item that was processed when the error was encountered
   * @param error
   */
  emit(event: "fetchconditionerror", queueItem: QueueItem, error: any): boolean;
  on(event: "fetchconditionerror", listener: (queueItem: QueueItem, error: any) => void): this;

  /**
   * Fired when a fetch condition prevented the queueing of a URL
   * @param queueItem The queue item that didn't pass the fetch conditions
   */
  emit(event: "fetchprevented", queueItem: QueueItem): boolean;
  on(event: "fetchprevented", listener: (queueItem: QueueItem) => void): this;

  /**
   * Fired when a new queue item was rejected because another
   * queue item with the same URL was already in the queue
   * @param queueItem The queue item that was rejected
   */
  emit(event: "queueduplicate", queueItem: QueueItem): boolean;
  on(event: "queueduplicate", listener: (queueItem: QueueItem) => void): this;

  /**
   * Fired when an error was encountered while updating a queue item
   * @param error The error that was returned by the queue
   * @param queueItem The queue item that the crawler tried to update when it encountered the error
   */
  emit(event: "queueerror", error: Error, queueItem: QueueItem): boolean;
  on(event: "queueerror", listener: (error: Error, queueItem: QueueItem) => void): this;

  /**
   * Fired when an item was added to the crawler's queue
   * @param queueItem The queue item that was added to the queue
   * @param referrer  The queue item representing the resource where the new queue item was found
   */
  emit(event: "queueadd", queueItem: QueueItem, referrer: QueueItem): boolean;
  on(event: "queueadd", listener: (queueItem: QueueItem, referrer: QueueItem) => void): this;

  /**
   * Fired just after a request has been initiated
   * @param queueItem The queue item for which the request has been initiated
   * @param requestOptions The options generated for the HTTP request
   */
  emit(event: "fetchstart", queueItem: QueueItem, referrer: AnyObject): boolean;
  on(event: "fetchstart", listener: (queueItem: QueueItem, referrer: AnyObject) => void): this;

  /**
   * Fired when a request times out
   * @param queueItem The queue item for which the request timed out
   * @param timeout The delay in milliseconds after which the request timed out
   */
  emit(event: "fetchtimeout", queueItem: QueueItem, timeout: number): boolean;
  on(event: "fetchtimeout", listener: (queueItem: QueueItem, timeout: number) => void): this;


  /**
   * Fired when a request encounters an unknown error
   * @param queueItem The queue item for which the request has errored
   * @param error The error supplied to the `error` event on the request
   */
  emit(event: "fetchclienterror", queueItem: QueueItem, error: Error): boolean;
  on(event: "fetchclienterror", listener: (queueItem: QueueItem, error: Error) => void): this;


  /**
   * Fired when the headers for a request have been received
   * @param queueItem The queue item for which the headers have been received
   * @param response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
   */
  emit(event: "fetchheaders", queueItem: QueueItem, response: http.IncomingMessage): boolean;
  on(event: "fetchheaders", listener: (queueItem: QueueItem, response: http.IncomingMessage) => void): this;


  /**
   * Fired when the request has completed
   * @param queueItem The queue item for which the request has completed
   * @param responseBody If {@link Crawler#decodeResponses} is true, this will be the decoded HTTP response. Otherwise it will be the raw response buffer.
   * @param response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
   */
  emit(event: "fetchcomplete", queueItem: QueueItem, responseBody: string | Buffer, response: http.IncomingMessage): boolean;
  on(event: "fetchcomplete", listener: (queueItem: QueueItem, responseBody: string | Buffer, response: http.IncomingMessage) => void): this;

  /**
   * Fired when a resource couldn't be downloaded because it exceeded the maximum allowed size
   * @param queueItem The queue item for which the request failed
   * @param response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
   */
  emit(event: "fetchdataerror", queueItem: QueueItem, response: http.IncomingMessage): boolean;
  on(event: "fetchdataerror", listener: (queueItem: QueueItem, response: http.IncomingMessage) => void): this;


  /**
   * Fired when the crawler's cache was enabled and the server responded with a 304 Not Modified status for the request
   * @param queueItem The queue item for which the request returned a 304 status
   * @param response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
   * @param cacheObject The CacheObject returned from the cache backend
   */
  emit(event: "notmodified", queueItem: QueueItem, response: http.IncomingMessage, cacheObject?: CacheObjectGet): boolean;
  on(event: "notmodified", listener: (queueItem: QueueItem, response: http.IncomingMessage, cacheObject?: CacheObjectGet) => void): this;


  /**
   * Fired when the server returned a redirect HTTP status for the request
   * @param queueItem The queue item for which the request was redirected
   * @param redirectQueueItem The queue item for the redirect target resource
   * @param response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
   */
  emit(event: "fetchredirect", queueItem: QueueItem, redirectQueueItem: QueueItem | false, response: http.IncomingMessage): boolean;
  on(event: "fetchredirect", listener: (queueItem: QueueItem, redirectQueueItem: QueueItem | false, response: http.IncomingMessage) => void): this;


  /**
   * Fired when the server returned a 404 Not Found status for the request
   * @param queueItem The queue item for which the request returned a 404 status
   * @param response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
   *
   */
  emit(event: "fetch404", queueItem: QueueItem, response: http.IncomingMessage): boolean;
  on(event: "fetch404", listener: (queueItem: QueueItem, response: http.IncomingMessage) => void): this;

  /**
   * Fired when the server returned a 410 Gone status for the request
   * @param queueItem The queue item for which the request returned a 410 status
   * @param response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
   */
  emit(event: "fetch410", queueItem: QueueItem, response: http.IncomingMessage): boolean;
  on(event: "fetch410", listener: (queueItem: QueueItem, response: http.IncomingMessage) => void): this;

  /**
   * Fired when the server returned a status code above 400 that isn't 404 or 410
   * @param {QueueItem} queueItem           The queue item for which the request failed
   * @param {http.IncomingMessage} response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
   */
  emit(event: "fetcherror", queueItem: QueueItem, response: http.IncomingMessage): boolean;
  on(event: "fetcherror", listener: (queueItem: QueueItem, response: http.IncomingMessage) => void): this;

  /**
   * Fired when an error was encountered while trying to add a
   * cookie to the cookie jar
   * @param queueItem The queue item representing the resource that returned the cookie
   * @param error The error that was encountered
   * @param cookie The Set-Cookie header value that was returned from the request
   */
  emit(event: "cookieerror", queueItem: QueueItem, error: Error, cookie: string | string[]): boolean;
  on(event: "cookieerror", listener: (queueItem: QueueItem, error: Error, cookie: string | string[]) => void): this;


  /**
   * Fired when a download condition returns an error
   * @param queueItem The queue item that was processed when the error was encountered
   * @param error
   */
  emit(event: "downloadconditionerror", queueItem: QueueItem, error: any): boolean;
  on(event: "downloadconditionerror", listener: (queueItem: QueueItem, error: any) => void): this;


  /**
   * Fired when the downloading of a resource was prevented
   * by a download condition
   * @param queueItem The queue item representing the resource that was halfway fetched
   * @param response The [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage} for the request's response
   */
  emit(event: "downloadprevented", queueItem: QueueItem, response: http.IncomingMessage): boolean;
  on(event: "downloadprevented", listener: (queueItem: QueueItem, response: http.IncomingMessage) => void): this;

  /**
  * Fired when an error was encountered while unzipping the response data
  * @param queueItem           The queue item for which the unzipping failed
  * @param error error object
  * @param responseBuffer    If {@link Crawler#decodeResponses} is true, this will be the decoded HTTP response. Otherwise it will be the raw response buffer.
  */
  emit(event: "gziperror", queueItem: QueueItem, error: Error, responseBuffer: string | Buffer): boolean;
  on(event: "gziperror", listener: (queueItem: QueueItem, error: Error, responseBuffer: string | Buffer) => void): this;

  /**
   * Fired when an error was encountered while retrieving a robots.txt file
   * @param error The error returned from {@link Crawler#getRobotsTxt}
   */
   emit(event: "robotstxterror", error: Error): boolean;
   on(event: "robotstxterror", listener: (error: Error) => void): this;


  /**
   * Fired when the crawl has completed - all resources in the queue have been dealt with
   */
   emit(event: "complete"): boolean;
   on(event: "complete"): this;
}

export class Crawler extends EventEmitter {
  /**
    * Controls which URL to request first
    */
  private initialURL: string;

  /**
  * Determines what hostname the crawler should limit requests to (so long as
  * {@link Crawler#filterByDomain} is true)
  */
  private host: string;

  /**
    * Determines the interval at which new requests are spawned by the crawler,
    * as long as the number of open requests is under the
    * {@link Crawler#maxConcurrency} cap.
    */
  public interval: number = 250;

  /**
  * Maximum request concurrency. If necessary, simplecrawler will increase
  * node's http agent maxSockets value to match this setting.
  */
  public maxConcurrency: number = 5;

  /**
  * Maximum time we'll wait for headers in ms
  */
  public timeout: number = 300000; // 5 minutes

  /**
  * Maximum time we'll wait for async listeners in ms
  */
  public listenerTTL: number = 10000; // 10 seconds

  /**
  * Crawler's user agent string
  * @default "Node/simplecrawler <version> (https://github.com/simplecrawler/simplecrawler)"
  */
  public userAgent: string = `Node/${packageJson.name} ${packageJson.version} (${packageJson.repository.url})`;

  /**
  * Queue for requests. The crawler can use any implementation so long as it
  * uses the same interface. The default queue is simply backed by an array.
  */
  public queue: FetchQueueInterface = new FetchQueue();

  /**
  * Controls whether the crawler respects the robots.txt rules of any domain.
  * This is done both with regards to the robots.txt file, and `<meta>` tags
  * that specify a `nofollow` value for robots. The latter only applies if
  * the default {@link Crawler#discoverResources} method is used, though.
  */
  public respectRobotsTxt: boolean = true;

  /**
  * Controls whether the crawler is allowed to change the
  * {@link Crawler#host} setting if the first response is a redirect to
  * another domain.
  */
  public allowInitialDomainChange: boolean = false;

  /**
  * Controls whether HTTP responses are automatically decompressed based on
  * their Content-Encoding header. If true, it will also assign the
  * appropriate Accept-Encoding header to requests.
  */
  public decompressResponses: boolean = true;

  /**
  * Controls whether HTTP responses are automatically character converted to
  * standard JavaScript strings using the {@link https://www.npmjs.com/package/iconv-lite|iconv-lite}
  * module before emitted in the {@link Crawler#event:fetchcomplete} event.
  * The character encoding is interpreted from the Content-Type header
  * firstly, and secondly from any `<meta charset="xxx" />` tags.
  */
  public decodeResponses: boolean = false;

  /**
  * Controls whether the crawler fetches only URL's where the hostname
  * matches {@link Crawler#host}. Unless you want to be crawling the entire
  * internet, I would recommend leaving this on!
  */
  public filterByDomain: boolean = true;

  /**
  * Controls whether URL's that points to a subdomain of {@link Crawler#host}
  * should also be fetched.
  */
  public scanSubdomains: boolean = false;

  /**
  * Controls whether to treat the www subdomain as the same domain as
  * {@link Crawler#host}. So if {@link http://example.com/example} has
  * already been fetched, {@link http://www.example.com/example} won't be
  * fetched also.
  */
  public ignoreWWWDomain: boolean = true;

  /**
  * Controls whether to strip the www subdomain entirely from URL's at queue
  * item construction time.
  */
  public stripWWWDomain: boolean = false;

  /**
  * Internal cache store. Must implement `SimpleCache` interface. You can
  * save the site to disk using the built in file system cache like this:
  *
  * ```js
  * crawler.cache = new Crawler.cache('pathToCacheDirectory');
  * ```
  */
  public cache: SimpleCache | null = null;

  /**
  * Controls whether an HTTP proxy should be used for requests
  */
  public useProxy: boolean = false;

  /**
  * If {@link Crawler#useProxy} is true, this setting controls what hostname
  * to use for the proxy
  */
  public proxyHostname: string = "127.0.0.1";

  /**
  * If {@link Crawler#useProxy} is true, this setting controls what port to
  * use for the proxy
  */
  public proxyPort: number = 8123;

  /**
  * If {@link Crawler#useProxy} is true, this setting controls what username
  * to use for the proxy
  */
  public proxyUser: string | null = null;

  /**
  * If {@link Crawler#useProxy} is true, this setting controls what password
  * to use for the proxy
  */
  public proxyPass: string | null = null;

  /**
  * Controls whether to use HTTP Basic Auth
  */
  public needsAuth: boolean = false;

  /**
  * If {@link Crawler#needsAuth} is true, this setting controls what username
  * to send with HTTP Basic Auth
  */
  public authUser: string | null = null;

  /**
  * If {@link Crawler#needsAuth} is true, this setting controls what password
  * to send with HTTP Basic Auth
  */
  public authPass: string | null = null;

  /**
  * Controls whether to save and send cookies or not
  */
  public acceptCookies: boolean = true;

  /**
  * The module used to store cookies
  */
  public cookies: CookieJar = new CookieJar();

  /**
  * Controls what headers (besides the default ones) to include with every
  * request.
  */
  public customHeaders: AnyObject = {};

  /**
  * Controls what domains the crawler is allowed to fetch from, regardless of
  * {@link Crawler#host} or {@link Crawler#filterByDomain} settings.
  */
  public domainWhitelist: string[] = [];

  /**
  * Controls what protocols the crawler is allowed to fetch from
  */
  public allowedProtocols: RegExp[] = [
    /^http(s)?$/i,                  // HTTP & HTTPS
    /^(rss|atom|feed)(\+xml)?$/i    // RSS / XML
  ];

  /**
  * Controls the maximum allowed size in bytes of resources to be fetched
  * @default 16777216
  */
  public maxResourceSize: number = 1024 * 1024 * 16; // 16mb

  /**
  * Controls what mimetypes the crawler will scan for new resources. If
  * {@link Crawler#downloadUnsupported} is false, this setting will also
  * restrict what resources are downloaded.
  */
  public supportedMimeTypes: (RegExp | string)[] = [
    /^text\//i,
    /^application\/(rss|html|xhtml)?[+/-]?xml/i,
    /^application\/javascript/i,
    /^xml/i
  ];

  /**
  * Controls whether to download resources with unsupported mimetypes (as
  * specified by {@link Crawler#supportedMimeTypes})
  */
  public downloadUnsupported: boolean = true;

  /**
  * Controls what URL encoding to use. Can be either "unicode" or "iso8859"
  */
  public urlEncoding: string = "unicode";

  /**
  * Controls whether to strip query string parameters from URL's at queue
  * item construction time.
  */
  public stripQuerystring: boolean = false;

  /**
  * Controls whether to sort query string parameters from URL's at queue
  * item construction time.
  */
  public sortQueryParameters: boolean = false;

  /**
  * Collection of regular expressions and functions that are applied in the
  * default {@link Crawler#discoverResources} method.
  */
  public discoverRegex: (RegExp | Function)[] = [
    /\s(?:href|src)\s*=\s*("|').*?\1/ig,
    /\s(?:href|src)\s*=\s*[^"'\s][^\s>]+/ig,
    /\s?url\((["']).*?\1\)/ig,
    /\s?url\([^"')]*?\)/ig,

    // This could easily duplicate matches above, e.g. in the case of
    // href="http://example.com"
    /https?:\/\/[^?\s><'",]+/ig,

    // This might be a bit of a gamble... but get hard-coded
    // strings out of javacript: URLs. They're often popup-image
    // or preview windows, which would otherwise be unavailable to us.
    // Worst case scenario is we make some junky requests.
    /^javascript:\s*[\w$.]+\(['"][^'"\s]+/ig,

    // Find srcset links
    function (string: string) {
      const result = /\ssrcset\s*=\s*("|')(.*?)\1/.exec(string);
      return Array.isArray(result)
        ? String(result[2]).split(",").map((string) => string.trim().split(/\s+/)[0])
        : "";
    },

    // Find resources in <meta> redirects. We need to wrap these RegExp's in
    // functions because we only want to return the first capture group, not
    // the entire match. And we need two RegExp's because the necessary
    // attributes on the <meta> tag can appear in any order
    function (string: string) {
      const match = string.match(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'] ?[^"'>]*url=([^"'>]*)["']?[^>]*>/i);
      return Array.isArray(match) ? [match[1]] : undefined;
    },
    function (string: string) {
      const match = string.match(/<meta[^>]*content\s*=\s*["']?[^"'>]*url=([^"'>]*)["']?[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/i);
      return Array.isArray(match) ? [match[1]] : undefined;
    }
  ];

  /**
  * Controls whether the default {@link Crawler#discoverResources} should
  * scan for new resources inside of HTML comments.
  */
  public parseHTMLComments: boolean = true;

  /**
  * Controls whether the default {@link Crawler#discoverResources} should
  * scan for new resources inside of `<script>` tags.
  */
  public parseScriptTags: boolean = true;

  /**
  * Controls the max depth of resources that the crawler fetches. 0 means
  * that the crawler won't restrict requests based on depth. The initial
  * resource, as well as manually queued resources, are at depth 1. From
  * there, every discovered resource adds 1 to its referrer's depth.
  */
  public maxDepth: number = 0;

  /**
  * Controls whether to proceed anyway when the crawler encounters an invalid
  * SSL certificate.
  */
  public ignoreInvalidSSL: boolean = false;

  /**
  * Controls what HTTP agent to use. This is useful if you want to configure
  * eg. a SOCKS client.
  */
  public httpAgent: http.Agent = http.globalAgent;

  /**
  * Controls what HTTPS agent to use. This is useful if you want to configure
  * eg. a SOCKS client.
  */
  public httpsAgent: https.Agent = https.globalAgent;

  @enumerable(false)
  private _downloadConditions: (Function | undefined)[] = [];
  @enumerable(false)
  private _fetchConditions: (Function | undefined)[] = [];
  @enumerable(false)
  private _isFirstRequest: boolean = true;
  @enumerable(false)
  private _openListeners: number = 0;
  @enumerable(false)
  private _openRequests: AnyObject[] = [];
  @enumerable(false)
  private _robotsTxts: AnyObject[] = [];
  @enumerable(false)
  private _touchedHosts: string[] = [];

  @enumerable(false)
  private running: boolean = false;

  @enumerable(false)
  private crawlIntervalID?: NodeJS.Timeout;

  @enumerable(false)
  private fetchingRobotsTxt: boolean = false;
  @enumerable(false)
  private fetchingQueueItem: boolean = false;

  /**
  * Creates a new crawler
  * @param initialURL The initial URL to fetch. The hostname that the crawler will confine requests to by default is inferred from this URL.
  */
  constructor(initialURL: string) {
    super();
    if (!initialURL) {
      throw new Error("Since 1.0.0, simplecrawler takes a single URL when initialized. Protocol, hostname, port and path are inferred from that argument.");
    }

    if (typeof initialURL !== "string") {
      throw new Error("The crawler needs a URL string to know where to start crawling");
    }

    const parsedURL = uri(initialURL).normalize();


    this.initialURL = initialURL;
    this.host = parsedURL.hostname();
  }

  /**
  * Starts or resumes the crawl. It adds a queue item constructed from
  * {@link Crawler#initialURL} to the queue. The crawler waits for
  * process.nextTick to begin, so handlers and other properties can be altered or
  * addressed before the crawl commences.
  * @return Returns the crawler instance to enable chained API calls
  */
  start(): this {
    if (this.running) {
      return this;
    }

    this.running = true;

    const queueItem = this.processURL(this.initialURL);
    if (!queueItem) {
      throw new Error(`failed to process initial URL ${this.initialURL}`);
    }
    queueItem.referrer = '';
    queueItem.depth = QUEUE_ITEM_INITIAL_DEPTH;

    this.queue.add(queueItem, false, (error: QueueAddError | null) => {
      if (error && error.code !== "DUPLICATE") {
        throw error;
      }

      process.nextTick(() => {
        this.crawlIntervalID = setInterval(this.crawl.bind(this), this.interval);
        this.crawl();
      });

      this.emit("crawlstart");
    });

    return this;
  }


  /**
  * Determines whether robots.txt rules allows the fetching of a particular URL
  * or not
  * @param url The full URL of the resource that is to be fetched (or not)
  * @return Returns true if the URL is allowed to be fetched, otherwise false
  */
  urlIsAllowed(url: string): boolean {
    const formattedURL = uri(url).normalize().href();
    let allowed = false;

    // The punycode module sometimes chokes on really weird domain
    // names. Catching those errors to prevent crawler from crashing
    try {
      // TODO
      // @ts-ignore
      allowed = this._robotsTxts.reduce((result, robots) => {
        const allowed = robots.isAllowed(formattedURL, this.userAgent);
        return result !== undefined ? result : allowed;
      }, undefined);
    } catch (error) {
      // URL will be avoided
    }

    return allowed === undefined ? true : allowed;
  }

  /**
  * Determines whether the crawler supports a protocol
  * @param URL A full URL, eg. "http://example.com"
  * @return Returns true if the protocol of the URL is supported, false if not
  */
  protocolSupported(URL: string): boolean {
    let protocol: string;

    try {
      protocol = uri(URL).protocol();

      // Unspecified protocol. Assume http
      if (!protocol) {
        protocol = "http";
      }

    } catch (e) {
      // If URIjs died, we definitely /do not/ support the protocol.
      return false;
    }

    return this.allowedProtocols.some((protocolCheck) => protocolCheck.test(protocol));
  }


  /**
  * Determines whether the crawler supports a mimetype
  * @param mimetype Eg. "text/html" or "application/octet-stream"
  * @return Returns true if the mimetype is supported, false if not
  */
  mimeTypeSupported(mimetype: string): boolean {
    return this.supportedMimeTypes.some((mimeCheck) => {
      if (typeof mimeCheck === "string") {
        return mimeCheck === mimetype;
      }

      return mimeCheck.test(mimetype);
    });
  }

  /**
  * Generates a configuration object for http[s].request
  * @param queueItem The queue item for which a request option object should be generated
  * @return Returns an object that can be passed directly to http[s].request
  */
  getRequestOptions(queueItem: QueueItem): AnyObject {
    const agent = queueItem.protocol === "https" ? this.httpsAgent : this.httpAgent;

    // Extract request options from queue
    let { host: requestHost, port: requestPort, path: requestPath } = queueItem;

    // Are we passing through an HTTP proxy?
    if (this.useProxy) {
      requestHost = this.proxyHostname;
      requestPort = this.proxyPort;
      requestPath = queueItem.url;
    }

    const isStandardHTTPPort = queueItem.protocol === "http" && queueItem.port !== 80;
    const isStandardHTTPSPort = queueItem.protocol === "https" && queueItem.port !== 443;
    const isStandardPort = isStandardHTTPPort || isStandardHTTPSPort;

    // Load in request options
    // TODO fix AnyObject
    const requestOptions: AnyObject = {
      method: "GET",
      host: requestHost,
      port: requestPort,
      path: requestPath,
      agent: agent,
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": this.userAgent,
        "Host": queueItem.host + (queueItem.port && isStandardPort ? ":" + queueItem.port : "")
      }
    };

    if (this.decompressResponses) {
      requestOptions.headers["Accept-Encoding"] = "gzip, deflate";
    }

    if (queueItem.referrer) {
      requestOptions.headers.Referer = queueItem.referrer;
    }

    // If port is one of the HTTP/HTTPS defaults, delete the option to avoid conflicts
    if (requestPort === 80 || requestPort === 443 || !requestPort) {
      delete requestOptions.port;
    }

    // Add cookie header from cookie jar if we're configured to
    // send/accept cookies
    if (this.acceptCookies && this.cookies.getAsHeader()) {
      requestOptions.headers.cookie = this.cookies.getAsHeader(queueItem.host, queueItem.path).join("; ");
    }

    // Add auth headers if we need them
    if (this.needsAuth) {
      // Generate auth header
      const auth = "Basic " + Buffer.from(`${this.authUser}:${this.authPass}`).toString("base64");
      requestOptions.headers.Authorization = auth;
    }

    // Add proxy auth if we need it
    if (this.proxyUser !== null && this.proxyPass !== null) {
      // Generate auth header
      const proxyAuth = "Basic " + Buffer.from(`${this.proxyUser}:${this.proxyPass}`).toString("base64");
      requestOptions.headers["Proxy-Authorization"] = proxyAuth;
    }

    if (this.cache !== null && this.cache.getCacheData) {
      this.cache.getCacheData(queueItem, (cacheObject: CacheObjectGet | null) => {
        if (cacheObject) {
          if (cacheObject.etag) {
            requestOptions.headers["If-None-Match"] = cacheObject.etag;
          }
          if (cacheObject.lastModified) {
            requestOptions.headers["If-Modified-Since"] = cacheObject.lastModified;
          }
        }
      });
    }

    // And if we've got any custom headers available
    if (this.customHeaders) {
      for (const header in this.customHeaders) {
        if (this.customHeaders.hasOwnProperty(header)) {
          requestOptions.headers[header] = this.customHeaders[header];
        }
      }
    }

    return requestOptions;
  }

  /**
  * Cleans a list of resources, usually provided by
  * {@link Crawler#discoverResources}. Also makes relative URL's absolute to the
  * URL of the queueItem argument.
  * @param urlMatch An array of URL's
  * @param queueItem The queue item representing the resource where the URL's were discovered
  * @return Returns an array of unique and absolute URL's
  */
  cleanExpandResources(urlMatch: string[], queueItem: QueueItem): string[] {
    if (!urlMatch) {
      return [];
    }
    const URLs: Set<string> = new Set();
    let URL;
    for (let i = 0; i < urlMatch.length; i++) {
      URL = urlMatch[i];

      if (!URL) {
        continue;
      }

      URL = cleanURL(URL, queueItem);

      // Ensure URL is whole and complete
      try {
        URL = uri(URL)
          .absoluteTo(queueItem.url || "")
          .normalize()
          .href();
      } catch (e) {
        // But if URI.js couldn't parse it - nobody can!
        continue;
      }

      // If we hit an empty item, don't return it
      if (!URL.length) {
        continue;
      }

      // If we don't support the protocol in question
      if (!this.protocolSupported(URL)) {
        continue;
      }

      URLs.add(URL);
    }

    return Array.from(URLs);
  }

  /**
  * Constructs a queue item from a URL and a referrer queue item.
  * @param url An absolute or relative URL to construct a queue item from
  * @param referrer The queue item representing the resource where this URL was discovered
  * @return Returns a new queue item
  */
  processURL(url: string, referrer?: QueueItem): QueueItem | false {
    let newUrl;

    if (typeof referrer !== "object") {
      // TODO special typing for "referrer"?
      referrer = {
        url: this.initialURL,
        depth: QUEUE_ITEM_INITIAL_DEPTH - 1
      } as QueueItem;
    }

    // If the URL didn't contain anything, don't fetch it.
    if (!(url && url.trim().length)) {
      return false;
    }

    // Check if querystring should be ignored
    if (this.stripQuerystring) {
      url = uri(url).search("").href();
    }

    // Canonicalize the URL by sorting query parameters.
    if (this.sortQueryParameters) {
      url = uri(url).query((data) => {
        const _data: AnyObject = {};
        Object.keys(data).sort().forEach((key) => {
          _data[key] = data[key];
        });
        return _data;
      }).href();
    }

    if (this.stripWWWDomain && url.match(/https?:\/\/(www\.).*/i)) {
      url = url.replace("www.", "");
    }

    try {
      newUrl = uri(url).absoluteTo(referrer.url).normalize();

      if (this.urlEncoding === "iso8859") {
        newUrl = newUrl.iso8859();
      }
    } catch (e) {
      // Couldn't process the URL, since URIjs choked on it.
      return false;
    }

    // simplecrawler uses slightly different terminology to URIjs. Sorry!
    // TODO ts errors. Partial<QueueItem>, maybe?
    // @ts-ignore
    return {
      host: newUrl.hostname(),
      path: newUrl.resource(),
      port: Number(newUrl.port()),
      protocol: newUrl.protocol() || "http",
      uriPath: newUrl.path(),
      url: newUrl.href(),
      depth: referrer.depth + 1,
      referrer: referrer.url,
      fetched: false,
      status: QueueItemStatus.CREATED,
      stateData: {}
    };
  }

  /**
  * Discovers linked resources in an HTML, XML or text document.
  * @param resourceText The body of the text document that is to be searched for resources
  * @return Returns the array of discovered URL's. It is not the responsibility of this method to clean this array of duplicates etc. That's what {@link Crawler#cleanExpandResources} is for.
  */
  discoverResources(resourceText: string): string[] {
    if (!this.parseHTMLComments) {
      resourceText = resourceText.replace(/<!--([\s\S]+?)-->/g, "");
    }

    if (!this.parseScriptTags) {
      resourceText = resourceText.replace(/<script(.*?)>([\s\S]*?)<\/script>/gi, "");
    }

    if (this.respectRobotsTxt && /<meta(?:\s[^>]*)?\sname\s*=\s*["']?robots["']?[^>]*>/i.test(resourceText)) {
      const robotsValue = /<meta(?:\s[^>]*)?\scontent\s*=\s*["']?([\w\s,]+)["']?[^>]*>/i.exec(resourceText.toLowerCase());

      if (Array.isArray(robotsValue) && /nofollow/i.test(robotsValue[1])) {
        return [];
      }
    }

    // Rough scan for URLs
    return this.discoverRegex.reduce((list: string[], extracter: Function | RegExp) => {
      let resources;

      if (extracter instanceof Function) {
        resources = extracter(resourceText);
      } else {
        resources = resourceText.match(extracter);
      }

      return resources ? list.concat(resources) : list;
    }, []);
  }


  /**
  * Determines whether a domain is valid for crawling based on configurable
  * rules.
  * @param host The domain name that's a candidate for fetching
  * @return Returns true if the crawler if allowed to fetch resources from the domain, false if not.
  */
  domainValid(host: string): boolean {
    // If we're ignoring the WWW domain, remove the WWW for comparisons...
    if (this.ignoreWWWDomain) {
      host = host.replace(/^www\./i, "");
    }

    const domainInWhitelist = (host: string): boolean => {
      // If there's no whitelist, or the whitelist is of zero length,
      // just return false.
      if (!this.domainWhitelist || !this.domainWhitelist.length) {
        return false;
      }

      // Otherwise, scan through it.
      return this.domainWhitelist.some((entry) => {
        // If the domain is just equal, return true.
        if (host === entry) {
          return true;
        }
        // If we're ignoring WWW subdomains, and both domains,
        // less www. are the same, return true.
        if (this.ignoreWWWDomain && host === entry.replace(/^www\./i, "")) {
          return true;
        }
        return false;
      });
    }

    // Checks if the first domain is a subdomain of the second
    const isSubdomainOf = (subdomain: string, host: string): boolean => {

      // Comparisons must be case-insensitive
      subdomain = subdomain.toLowerCase();
      host = host.toLowerCase();

      // If we're ignoring www, remove it from both
      // (if www is the first domain component...)
      if (this.ignoreWWWDomain) {
        subdomain = subdomain.replace(/^www./ig, "");
        host = host.replace(/^www./ig, "");
      }

      // They should be the same flipped around!
      return subdomain.split("").reverse().join("").substr(0, host.length) ===
        host.split("").reverse().join("");
    }

    // If we're not filtering by domain, just return true.
    return !this.filterByDomain ||
      // Or if the domain is just the right one, return true.
      host === this.host ||
      // Or if we're ignoring WWW subdomains, and both domains,
      // less www. are the same, return true.
      this.ignoreWWWDomain &&
      this.host.replace(/^www\./i, "") ===
      host.replace(/^www\./i, "") ||
      // Or if the domain in question exists in the domain whitelist,
      // return true.
      domainInWhitelist(host) ||
      // Or if we're scanning subdomains, and this domain is a subdomain
      // of the crawler's set domain, return true.
      this.scanSubdomains && isSubdomainOf(host, this.host);
  }


  /**
  * Initiates discovery of linked resources in an HTML or text document, and
  * queues the resources if applicable. Not to be confused with
  * {@link Crawler#discoverResources}, despite that method being the main
  * component of this one, since this method queues the resources in addition to
  * discovering them.
  * @fires  Crawler#discoverycomplete
  * @param  resourceData The document body to search for URL's
  * @param  queueItem        The queue item that represents the fetched document body
  * @return Returns the crawler instance to enable chained API calls
  */
  queueLinkedItems(resourceData: string | Buffer, queueItem: QueueItem): this {
    let resources = this.discoverResources(resourceData.toString());
    resources = this.cleanExpandResources(resources, queueItem);

    this.emit("discoverycomplete", queueItem, resources);

    // TODO do not "discoverResources" if we on the maxDepth already, it won't be added
    resources.forEach((url) => {
      if (this.maxDepth === 0 || queueItem.depth + 1 <= this.maxDepth) {
        this.queueURL(url, queueItem);
      }
    });

    return this;
  }


  /**
  * Decodes a string buffer based on a complete Content-Type header. Will also
  * look for an embedded <meta> tag with a charset definition, but the
  * Content-Type header is prioritized, see the [MDN documentation]{@link https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta#attr-charset}
  * for more details.
  * @param buffer A response buffer
  * @param contentTypeHeader ContentType header received from HTTP request
  * @return The decoded buffer contents
  */
  decodeBuffer(buffer: Buffer, contentTypeHeader: string = ""): string {
    const embeddedEncoding = /<meta[^>]*charset\s*=\s*["']?([\w-]*)/i.exec(buffer.toString(undefined, 0, 512)) || [];
    let encoding = contentTypeHeader.split("charset=")[1] || embeddedEncoding[1] || contentTypeHeader;

    encoding = iconv.encodingExists(encoding) ? encoding : "utf8";

    return iconv.decode(buffer, encoding);
  }

  /**
  * Stops the crawler by terminating the crawl runloop
  * @param  {Boolean} [abortRequestsInFlight=false] If true, will terminate all in-flight requests immediately
  * @return {Crawler}                               Returns the crawler instance to enable chained API calls
  */
  stop(abortRequestsInFlight: boolean = false): this {
    if (this.crawlIntervalID) {
      clearInterval(this.crawlIntervalID);
    }
    this.running = false;

    // If we've been asked to terminate the existing requests, do that now.
    if (abortRequestsInFlight) {
      this._openRequests.forEach((request) => request.abort());
    }

    return this;
  }


  /**
  * Holds the crawler in a 'running' state, preventing the `complete` event from
  * firing until the returned callback has been executed, or a predetermined
  * timeout (as specified by `crawler.listenerTTL`) has elapsed.
  * @return A callback function that will allow the crawler to continue once called
  */
  wait(): () => void {
    let cleared = false;
    let timeout = setTimeout(() => {
      if (cleared) {
        return;
      }
      cleared = true;
      this._openListeners--;
    }, this.listenerTTL);

    this._openListeners++;

    return () => {
      if (cleared) {
        return;
      }
      cleared = true;
      this._openListeners--;
      clearTimeout(timeout);
    };
  }

  // TODO define typing for callback
  /**
  * Evaluated for every fetched resource after its header have been received to
  * determine whether to fetch the resource body.
  * @callback Crawler~addDownloadConditionCallback
  * @param {QueueItem} queueItem The resource to be downloaded (or not)
  * @param {http.IncomingMessage} response The response object as returned by node's `http` API
  * @param {Function} callback
  */

  /**
  * Adds a callback to the download conditions array. simplecrawler will evaluate
  * all download conditions for every fetched resource after the headers of that
  * resource have been received. If any of the download conditions returns a
  * falsy value, the resource data won't be downloaded.
  * @param  {Crawler~addDownloadConditionCallback} callback Function to be called when the headers of the resource represented by the queue item have been downloaded
  * @return The index of the download condition in the download conditions array. This can later be used to remove the download condition.
  */
  addDownloadCondition(callback: Function): number {
    if (!(callback instanceof Function)) {
      throw new Error("Download condition must be a function");
    }

    this._downloadConditions.push(callback);
    return this._downloadConditions.length - 1;
  }

  /**
  * Removes a download condition from the download conditions array.
  * @param  {Number|Function} id The numeric ID of the download condition, or a reference to the download condition itself. The ID was returned from {@link Crawler#addDownloadCondition}
  * @return {Boolean} If the removal was successful, the method will return true. Otherwise, it will throw an error.
  */
  removeDownloadCondition(id: number | Function): boolean {
    if (id instanceof Function) {
      const itemIndex = this._downloadConditions.indexOf(id);
      if (itemIndex !== -1) {
        this._downloadConditions[itemIndex] = undefined;
        return true;
      }
    } else if (typeof id === "number") {
      if (id >= 0 && id < this._downloadConditions.length) {
        if (this._downloadConditions[id] !== undefined) {
          this._downloadConditions[id] = undefined;
          return true;
        }
      }
    }

    throw new Error("Unable to find indexed download condition");
  };

  // TODO ts typein for the callback
  /**
  * Evaluated for every discovered URL to determine whether to put it in the
  * queue.
  * @callback Crawler~addFetchConditionCallback
  * @param {QueueItem} queueItem The resource to be queued (or not)
  * @param {QueueItem} referrerQueueItem The resource where `queueItem` was discovered
  * @param {Function} callback
  */

  /**
  * Adds a callback to the fetch conditions array. simplecrawler will evaluate
  * all fetch conditions for every discovered URL, and if any of the fetch
  * conditions returns a falsy value, the URL won't be queued.
  * @param  {Crawler~addFetchConditionCallback} callback Function to be called after resource discovery that's able to prevent queueing of resource
  * @return The index of the fetch condition in the fetch conditions array. This can later be used to remove the fetch condition.
  */
  addFetchCondition(callback: Function): number {
    if (!(callback instanceof Function)) {
      throw new Error("Fetch condition must be a function");
    }

    this._fetchConditions.push(callback);
    return this._fetchConditions.length - 1;
  }

  /**
  * Removes a fetch condition from the fetch conditions array.
  * @param  {Number|Function} id The numeric ID of the fetch condition, or a reference to the fetch condition itself. This was returned from {@link Crawler#addFetchCondition}
  * @return If the removal was successful, the method will return true. Otherwise, it will throw an error.
  */
  removeFetchCondition(id: number | Function): boolean {
    if (id instanceof Function) {
      const itemIndex = this._fetchConditions.indexOf(id);
      if (itemIndex !== -1) {
        this._fetchConditions[itemIndex] = undefined;
        return true;
      }
    } else if (typeof id === "number") {
      if (id >= 0 && id < this._fetchConditions.length) {
        if (this._fetchConditions[id] !== undefined) {
          this._fetchConditions[id] = undefined;
          return true;
        }
      }
    }

    throw new Error("Unable to find indexed fetch condition");
  }

  /**
  * The main crawler runloop. Fires at the interval specified in the crawler
  * configuration, when the crawl is running. May be manually fired. This
  * function initiates fetching of a queue item if there are enough workers to do
  * so and there are unfetched items in the queue.
  * @fires Crawler#robotstxterror
  * @fires Crawler#fetchdisallowed
  * @fires Crawler#complete
  * @return Returns the crawler instance to enable chained API calls
  */
  crawl(): this {
    if (this._openRequests.length >= this.maxConcurrency ||
      this.fetchingRobotsTxt || this.fetchingQueueItem) {
      return this;
    }

    // The flag means the fetching process begins which includes finding of oldest unfetched item and
    // updating its status to `spooled`. It is required to avoid multiple fetching of the same item
    // at defined interval in case of slow queue implementation (DB, for example)
    this.fetchingQueueItem = true;

    this.queue.oldestUnfetchedItem((error: Error | null, queueItem?: QueueItem | null) => {
      this.fetchingQueueItem = false;
      if (error) {
        // Do nothing
      } else if (queueItem) {
        const url = uri(queueItem.url).normalize();
        const host = uri({
          protocol: url.protocol(),
          hostname: url.hostname(),
          port: url.port()
        }).href();

        if (this.respectRobotsTxt && this._touchedHosts.indexOf(host) === -1) {
          this._touchedHosts.push(host);
          this.fetchingRobotsTxt = true;

          const robotsTxtUrl = uri(host).pathname("/robots.txt").href();

          this.getRobotsTxt(robotsTxtUrl, (error: Error | null, robotsTxtUrl?: string, robotsTxtBody?: string): void => {
            if (error) {
              this.emit("robotstxterror", error);
            } else {
              // TODO robotsTxt is not undefined when error exists
              // @ts-ignore
              const robotsTxt = robotsTxtParser(robotsTxtUrl, robotsTxtBody);
              this._robotsTxts.push(robotsTxt);

              const sitemaps = robotsTxt.getSitemaps();
              // TODO
              // @ts-ignore
              const robotsQueueItem = this.processURL(robotsTxtUrl, queueItem);
              if (robotsQueueItem) {
                sitemaps.forEach((sitemap) => this.queueURL(sitemap, robotsQueueItem));
              }
            }

            this.fetchingRobotsTxt = false;

            // It could be that the first URL we queued for any particular
            // host is in fact disallowed, so we double check once we've
            // fetched the robots.txt
            if (this.urlIsAllowed(queueItem.url)) {
              this.fetchQueueItem(queueItem);
            } else {
              this.queue.update(queueItem.id, {
                fetched: true,
                status: "disallowed"
              }, (error: Error | null) => {
                this.emit("fetchdisallowed", queueItem);
              });
            }
          });
        } else {
          this.fetchQueueItem(queueItem);
        }
      } else if (!this._openRequests.length && !this._openListeners) {
        this.queue.countItems({ fetched: true }, (err: Error | null, completeCount?: number) => {
          if (err) {
            throw err;
          }

          this.queue.getLength((err: Error | null, length?: number) => {
            if (err) {
              throw err;
            }

            if (completeCount === length) {
              this.emit("complete");
              this.stop();
            }
          });
        });
      }
    });

    return this;
  }

  /**
  * Performs an HTTP request for the robots.txt resource on any domain
  * @param url The full URL to the robots.txt file, eg. "http://example.com/robots.txt"
  * @param callback The callback called with the server's response, or an error
  * @return Returns the crawler instance to enable chained API calls
  */
  getRobotsTxt(url: string, callback: NodeCallback2<string, string>): this {
    const robotsTxtUrl = uri(url);
    const client = robotsTxtUrl.protocol() === "https" ? https : http;

    const queueItem = this.processURL(robotsTxtUrl.href());
    // TODO
    if (!queueItem) {
      callback(new Error("Failed to process url for robotsTxt"));
      return this;
    }
    const requestOptions = this.getRequestOptions(queueItem);

    // Apply the ignoreInvalidSSL setting to https connections
    if (client === https && this.ignoreInvalidSSL) {
      requestOptions.rejectUnauthorized = false;
      requestOptions.strictSSL = false;
    }

    // Get the resource!
    const clientRequest = client.request(requestOptions, (response) => {
      const { statusCode } = response;
      if (!statusCode) {
        callback(new Error("Did not get server status code"));
        return;
      }
      if (statusCode >= 200 && statusCode < 300) {
        const responseLength =
          parseInt((response.headers["content-length"] || ""), 10) ||
          this.maxResourceSize;
        const responseBuffer = Buffer.alloc(responseLength);
        let responseLengthReceived = 0;

        response.on("data", (chunk) => {
          if (responseLengthReceived + chunk.length <= this.maxResourceSize) {
            chunk.copy(responseBuffer, responseLengthReceived, 0, chunk.length);
            responseLengthReceived += chunk.length;
          } else {
            response.destroy();
            callback(new Error("robots.txt exceeded maxResourceSize"));
          }
        });

        const decodeAndReturnResponse = (error: Error | null, responseBuffer: Buffer) => {
          if (error) {
            return callback(new Error("Couldn't unzip robots.txt response body"));
          }

          const contentType = response.headers["content-type"];
          const responseBody = this.decodeBuffer(responseBuffer, contentType);

          callback(null, robotsTxtUrl.href(), responseBody);
        };

        response.on("end", () => {
          const contentEncoding = response.headers["content-encoding"];

          if (contentEncoding && /(gzip|deflate)/.test(contentEncoding)) {
            zlib.unzip(responseBuffer, decodeAndReturnResponse);
          } else {
            decodeAndReturnResponse(null, responseBuffer);
          }
        });
      } else if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        response.destroy();
        let redirectTarget;

        try {
          redirectTarget = uri(response.headers.location)
            .absoluteTo(robotsTxtUrl)
            .normalize();
        } catch (error) {
          const robotsTxtHost = uri(robotsTxtUrl).pathname("").href();
          const errorMsg = `Faulty redirect URL when fetching robots.txt for ${robotsTxtHost}`;

          return callback(new Error(errorMsg));
        }

        if (this.domainValid(redirectTarget.hostname())) {
          this.getRobotsTxt(redirectTarget.href(), callback);
        } else {
          const errorMsg = `${robotsTxtUrl.href()} redirected to a disallowed domain (${redirectTarget.hostname()})`;
          callback(new Error(errorMsg));
        }
      } else {
        response.destroy();
        const errorMsg = `Server responded with status ${response.statusCode} when fetching robots.txt`;
        callback(new Error(errorMsg));
      }
    });

    clientRequest.end();

    clientRequest.setTimeout(this.timeout, () => {
      // TODO
      clientRequest.abort();
      callback(new Error("robots.txt request timed out"));
    });

    clientRequest.on("error", (errorData) => {
      if (!clientRequest.aborted) {
        callback(errorData);
      }
    });

    return this;
  }

  /**
  * Queues a URL for fetching after cleaning, validating and constructing a queue
  * item from it. If you're queueing a URL manually, use this method rather than
  * @param url An absolute or relative URL. If relative, {@link Crawler#processURL} will make it absolute to the referrer queue item.
  * @param referrer The queue item representing the resource where this URL was discovered.
  * @param force If true, the URL will be queued regardless of whether it already exists in the queue or not.
  * @return The return value used to indicate whether the URL passed all fetch conditions and robots.txt rules. With the advent of async fetch conditions, the return value will no longer take fetch conditions into account.
  */
  queueURL(url: QueueItem | string, referrer: QueueItem, force?: boolean): boolean {
    const queueItem = typeof url === "object" ? url : this.processURL(url, referrer);

    // URL Parser decided this URL was junky. Next please!
    if (!queueItem) {
      return false;
    }

    // Check that the domain is valid before adding it to the queue
    if (!this.domainValid(queueItem.host)) {
      this.emit("invaliddomain", queueItem);
      return false;
    }

    if (!this.urlIsAllowed(queueItem.url)) {
      this.emit("fetchdisallowed", queueItem);
      return false;
    }

    async.every(this._fetchConditions, (fetchCondition, callback) => {
      if (fetchCondition === undefined) {
        callback(null, true);
      } else if (fetchCondition.length < 3) {
        try {
          callback(null, fetchCondition(queueItem, referrer));
        } catch (error) {
          callback(error);
        }
      } else {
        fetchCondition(queueItem, referrer, callback);
      }
    }, (error, result) => {
      if (error) {
        this.emit("fetchconditionerror", queueItem, error);
        return false;
      }

      if (!result) {
        this.emit("fetchprevented", queueItem);
        return false;
      }

      // TODO
      this.queue.add(queueItem, force || false, (error: QueueAddError | null) => {
        if (error) {
          if (error.code && error.code === "DUPLICATE") {
            return this.emit("queueduplicate", queueItem);
          }
          return this.emit("queueerror", error, queueItem);
        }
        this.emit("queueadd", queueItem, referrer);
      });
    });

    return true;
  }

  /**
  * Handles the initial fetching of a queue item. Once an initial response has
  * been received, {@link Crawler#handleResponse} will handle the downloading of
  * the resource data
  * @fires  Crawler#fetchstart
  * @fires  Crawler#fetchtimeout
  * @fires  Crawler#fetchclienterror
  */
  fetchQueueItem(queueItem: QueueItem): this {
    this.fetchingQueueItem = true;

    this.queue.update(queueItem.id, { status: "spooled" }, (error: Error | null, spooledQueueItem?: QueueItem) => {
      this.fetchingQueueItem = false;

      if (error) {
        this.emit("queueerror", error, queueItem);
        return;
      }

      const client = spooledQueueItem!.protocol === "https" ? https : http;
      const agent = spooledQueueItem!.protocol === "https" ? this.httpsAgent : this.httpAgent;

      if (agent.maxSockets < this.maxConcurrency) {
        agent.maxSockets = this.maxConcurrency;
      }

      const requestOptions = this.getRequestOptions(spooledQueueItem!);
      const timeCommenced = Date.now();

      if (client === https && this.ignoreInvalidSSL) {
        requestOptions.rejectUnauthorized = false;
        requestOptions.strictSSL = false;
      }

      const clientRequest = client.request(requestOptions, (response) => {
        this.handleResponse(spooledQueueItem!, response, timeCommenced);
      });

      clientRequest.end();

      // Enable central tracking of this request
      this._openRequests.push(clientRequest);

      // Ensure the request is removed from the tracking array if it is
      // forcibly aborted
      clientRequest.on("abort", () => {
        if (this._openRequests.indexOf(clientRequest) > -1) {
          this._openRequests.splice(this._openRequests.indexOf(clientRequest), 1);
        }
      });

      clientRequest.setTimeout(this.timeout, () => {
        if (spooledQueueItem!.fetched) {
          return;
        }

        if (this.running && !spooledQueueItem!.fetched) {
          // Remove this request from the open request map
          this._openRequests.splice(this._openRequests.indexOf(clientRequest), 1);
        }

        this.queue.update(spooledQueueItem!.id, {
          fetched: true,
          status: "timeout"
        }, (error: Error | null) => {
          if (error) {
            return this.emit("queueerror", error, spooledQueueItem!);
          }
          this.emit("fetchtimeout", spooledQueueItem!, this.timeout);
          clientRequest.abort();
        });
      });

      clientRequest.on("error", (errorData) => {
        // This event will be thrown if we manually aborted the request,
        // but we don't want to do anything in that case.
        if (clientRequest.aborted) {
          return;
        }

        if (this.running && !spooledQueueItem!.fetched) {
          // Remove this request from the open request map
          this._openRequests.splice(this._openRequests.indexOf(clientRequest), 1);
        }

        this.queue.update(spooledQueueItem!.id, {
          fetched: true,
          status: "failed",
          stateData: {
            code: 600
          }
        }, (error: Error | null, updatedQueueItem?: QueueItem) => {
          if (error) {
            return this.emit("queueerror", error, spooledQueueItem!);
          }

          this.emit("fetchclienterror", updatedQueueItem!, errorData);
        });
      });

      this.emit("fetchstart", spooledQueueItem!, requestOptions);
    });

    return this;
  }

  /**
  * Handles downloading of a resource after an initial HTTP response has been
  * received.
  * @fires  Crawler#fetchheaders
  * @fires  Crawler#fetchcomplete
  * @fires  Crawler#fetchdataerror
  * @fires  Crawler#notmodified
  * @fires  Crawler#fetchredirect
  * @fires  Crawler#fetch404
  * @fires  Crawler#fetch410
  * @fires  Crawler#fetcherror
  * @param  queueItem             A queue item representing the resource to be fetched
  * @param  response   An instace of [http.IncomingMessage]{@link https://nodejs.org/api/http.html#http_class_http_incomingmessage}
  * // TODO
  * @param  timeCommenced default Date.now() Specifies at what time the request was initiated
  * @return Returns the crawler instance to enable chained API calls
  */
  handleResponse(queueItem: QueueItem, response: http.IncomingMessage, timeCommenced: number = Date.now()): this {
    let dataReceived = false;
    const timeHeadersReceived = Date.now();
    const contentType = response.headers["content-type"];
    let timeDataReceived;
    let redirectQueueItem;
    let responseBuffer: Buffer;
    let responseLength: number;
    let responseLengthReceived = 0;

    // TODO optimize
    responseLength = parseInt(response.headers["content-length"] || '', 10);
    responseLength = !isNaN(responseLength) ? responseLength : 0;

    this.queue.update(queueItem.id, {
      stateData: {
        requestLatency: timeHeadersReceived - timeCommenced,
        requestTime: timeHeadersReceived - timeCommenced,
        contentLength: responseLength,
        contentType: contentType,
        code: response.statusCode,
        headers: response.headers
      }
    }, (error: Error | null, updatedQueueItem?: QueueItem) => {
      if (error) {
        return this.emit("queueerror", error, queueItem);
      }

      const emitFetchComplete = (responseBody: Buffer, decompressedBuffer?: Buffer) => {
        this.queue.update(updatedQueueItem!.id, {
          fetched: true,
          status: "downloaded"
        }, (error: Error | null, downloadedQueueItem?: QueueItem) => {
          // Remove this request from the open request map
          // TODO
          //@ts-ignore
          this._openRequests.splice(this._openRequests.indexOf(response.req), 1);

          if (error) {
            return this.emit("queueerror", error, updatedQueueItem!);
          }
          // TODO
          let responseBBody: string | Buffer = responseBody;
          if (this.decodeResponses) {
            responseBBody = this.decodeBuffer(responseBody, downloadedQueueItem!.stateData.contentType);
          }

          this.emit("fetchcomplete", downloadedQueueItem!, responseBBody, response);

          // We only process the item if it's of a valid mimetype
          // and only if the crawler is set to discover its own resources
          if (contentType && this.mimeTypeSupported(contentType) && this.discoverResources) {
            this.queueLinkedItems(decompressedBuffer || responseBody, downloadedQueueItem!);
          }
        });
      };

      const receiveData = (chunk: Buffer) => {
        if (!chunk.length || dataReceived) {
          return;
        }

        if (responseLengthReceived + chunk.length > responseBuffer.length) {

          // Oh dear. We've been sent more data than we were initially told.
          // This could be a mis-calculation, or a streaming resource.
          // Let's increase the size of our buffer to match, as long as it isn't
          // larger than our maximum resource size.
          if (responseLengthReceived + chunk.length <= this.maxResourceSize) {

            // Create a temporary buffer with the new response length, copy
            // the old data into it and replace the old buffer with it
            const tmpNewBuffer = Buffer.alloc(responseLengthReceived + chunk.length);
            responseBuffer.copy(tmpNewBuffer, 0, 0, responseBuffer.length);
            chunk.copy(tmpNewBuffer, responseBuffer.length, 0, chunk.length);
            responseBuffer = tmpNewBuffer;
          } else {

            // The response size exceeds maxResourceSize. Throw event and
            // ignore. We'll then deal with the data that we have.
            response.destroy();

            this.emit("fetchdataerror", updatedQueueItem!, response);
          }
        } else {
          chunk.copy(responseBuffer, responseLengthReceived, 0, chunk.length);
        }

        responseLengthReceived += chunk.length;
      };

      // Function for dealing with 200 responses
      const processReceivedData = () => {
        if (dataReceived || updatedQueueItem!.fetched) {
          return;
        }

        responseBuffer = responseBuffer.slice(0, responseLengthReceived);
        dataReceived = true;
        timeDataReceived = Date.now();

        this.queue.update(updatedQueueItem!.id, {
          stateData: {
            downloadTime: timeDataReceived - timeHeadersReceived,
            requestTime: timeDataReceived - timeCommenced,
            actualDataSize: responseBuffer.length,
            sentIncorrectSize: responseBuffer.length !== responseLength
          }
        }, (error: Error | null, queueItem?: QueueItem) => {
          if (error) {
            // Remove this request from the open request map
            // TODO
            //@ts-ignore
            this._openRequests.splice(this._openRequests.indexOf(response.req), 1);

            return this.emit("queueerror", error, queueItem!);
          }

          // First, save item to cache (if we're using a cache!)
          if (this.cache && this.cache.setCacheData instanceof Function) {
            this.cache.setCacheData(queueItem!, responseBuffer);
          }

          // No matter the value of `crawler.decompressResponses`, we still
          // decompress the response if it's gzipped or deflated. This is
          // because we always provide the discoverResources method with a
          // decompressed buffer
          if (/(gzip|deflate)/.test(queueItem?.stateData?.headers?.["content-encoding"] || '')) {
            zlib.unzip(responseBuffer, (error, decompressedBuffer) => {
              if (error) {
                this.emit("gziperror", queueItem!, error, responseBuffer);
                emitFetchComplete(responseBuffer);
              } else {
                const responseBody = this.decompressResponses ? decompressedBuffer : responseBuffer;
                emitFetchComplete(responseBody, decompressedBuffer);
              }
            });
          } else {
            emitFetchComplete(responseBuffer);
          }
        });
      };

      // Do we need to save cookies? Were we sent any?
      if (this.acceptCookies && response.headers.hasOwnProperty("set-cookie")) {
        try {
          // TODO type guard
          this.cookies.addFromHeaders(response.headers["set-cookie"]!);
        } catch (error) {
          this.emit("cookieerror", updatedQueueItem!, error, response.headers["set-cookie"]!);
        }
      }

      this.emit("fetchheaders", updatedQueueItem!, response);

      // We already know that the response will be too big
      if (responseLength > this.maxResourceSize) {

        this.queue.update(updatedQueueItem!.id, {
          fetched: true
        }, (error: Error | null, updatedFetchedQueueItem?: QueueItem) => {
          if (error) {
            return this.emit("queueerror", error, updatedQueueItem!);
          }

          // Remove this request from the open request map
          // TODO
          //@ts-ignore
          this._openRequests.splice(this._openRequests.indexOf(response.req), 1);

          response.destroy();
          this.emit("fetchdataerror", updatedFetchedQueueItem!, response);
        });

        // We should just go ahead and get the data
        // TODO
        // @ts-ignore
      } else if (response.statusCode >= 200 && response.statusCode < 300) {
        async.every(this._downloadConditions, (downloadCondition, callback) => {
          if (downloadCondition === undefined) {
            callback(null, true);
          } else if (downloadCondition.length < 3) {
            try {
              callback(null, downloadCondition(updatedQueueItem, response));
            } catch (error) {
              callback(error);
            }
          } else {
            downloadCondition(updatedQueueItem, response, callback);
          }
        }, (error: Error | null | undefined, result?: boolean) => {
          if (error) {
            this.emit("downloadconditionerror", updatedQueueItem!, error);
            return false;
          }

          if (!result) {
            this.queue.update(updatedQueueItem!.id, {
              fetched: true,
              status: "downloadprevented"
            }, () => {
              // TODO
              // @ts-ignore
              this._openRequests.splice(this._openRequests.indexOf(response.req), 1);

              response.destroy();
              this.emit("downloadprevented", updatedQueueItem!, response);
            });
          } else {
            this.queue.update(updatedQueueItem!.id, {
              status: "headers"
            }, (error: Error | null, headersUpdatedQueueItem?: QueueItem) => {
              if (error) {
                return this.emit("queueerror", error, updatedQueueItem!);
              }

              // Create a buffer with our response length
              responseBuffer = Buffer.alloc(responseLength);

              // Only if we're prepared to download non-text resources...
              if (this.downloadUnsupported || contentType && this.mimeTypeSupported(contentType)) {
                response.on("data", receiveData);
                response.on("end", processReceivedData);
              } else {
                this.queue.update(headersUpdatedQueueItem!.id, {
                  fetched: true
                }, () => {
                  // Remove this request from the open request map
                  // TODO
                  //@ts-ignore
                  this._openRequests.splice(this._openRequests.indexOf(response.req), 1);

                  response.destroy();
                });
              }

              this._isFirstRequest = false;
            });
          }
        });

        // We've got a not-modified response back
      } else if (response.statusCode === 304) {

        this.queue.update(updatedQueueItem!.id, {
          fetched: true
        }, (error: Error | null, fetchedQueueItem?: QueueItem) => {
          if (this.cache !== null && this.cache.getCacheData) {
            // We've got access to a cache
            this.cache.getCacheData(fetchedQueueItem!, (cacheObject: CacheObjectGet) => {
              this.emit("notmodified", fetchedQueueItem!, response, cacheObject);
            });
          } else {
            this.emit("notmodified", fetchedQueueItem!, response);
          }

          response.destroy();
          // Remove this request from the open request map
          // TODO
          //@ts-ignore
          this._openRequests.splice(this._openRequests.indexOf(response.req), 1);

          this._isFirstRequest = false;
        });

        // If we should queue a redirect
      } else if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {

        this.queue.update(updatedQueueItem!.id, {
          fetched: true,
          status: "redirected"
        }, (error: Error | null, fetchedQueueItem?: QueueItem) => {

          // Parse the redirect URL ready for adding to the queue...
          // TODO
          redirectQueueItem = this.processURL(response.headers.location || '', fetchedQueueItem);

          this.emit("fetchredirect", fetchedQueueItem!, redirectQueueItem, response);

          if (redirectQueueItem === false) {
            return;
          }


          if (this._isFirstRequest) {
            redirectQueueItem.depth = 1;
          }

          if (this.allowInitialDomainChange && this._isFirstRequest) {
            this.host = redirectQueueItem.host;
          }

          this.queueURL(redirectQueueItem, fetchedQueueItem!);
          response.destroy();

          // Remove this request from the open request map
          // TODO
          //@ts-ignore
          this._openRequests.splice(this._openRequests.indexOf(response.req), 1);
        });

        // Ignore this request, but record that we had a 404
      } else if (response.statusCode === 404 || response.statusCode === 410) {

        this.queue.update(updatedQueueItem!.id, {
          fetched: true,
          status: "notfound"
        }, (error: Error | null, notFoundQueueItem?: QueueItem) => {
          if (response.statusCode === 404) {
            this.emit("fetch404", notFoundQueueItem!, response);
          } else {
            this.emit("fetch410", notFoundQueueItem!, response);
          }

          response.destroy();

          // Remove this request from the open request map
          // TODO
          //@ts-ignore
          this._openRequests.splice(this._openRequests.indexOf(response.req), 1);

          this._isFirstRequest = false;
        });

        // And oh dear. Handle this one as well. (other 400s, 500s, etc)
      } else {

        this.queue.update(updatedQueueItem!.id, {
          fetched: true,
          status: "failed"
        }, (error: Error | null, failedQueueItem?: QueueItem) => {
          this.emit("fetcherror", failedQueueItem!, response);
          response.destroy();

          // Remove this request from the open request map
          // TODO
          // @ts-ignore
          this._openRequests.splice(this._openRequests.indexOf(response.req), 1);

          this._isFirstRequest = false;
        });
      }
    });
    return this;
  }
}

