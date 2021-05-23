// Routes for testing server

import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { AnyObject } from "../../src/types";

function getFixtureFile(filename: string): Buffer {
    return fs.readFileSync(path.join(__dirname, "..", "fixtures", filename));
};

export const routes = {
    "/": (write: Function) => {
        write(200, "Home. <a href='stage2'>stage2</a> <a href='forbidden'>bad robot!</a>");
    },

    "/robots.txt": (write: Function) => {
        write(200, getFixtureFile("robots.txt"));
    },

    // This is only forbidden in robots.txt, not by enforcing server rules
    "/forbidden": (write: Function) => {
        write(200, "You shouldn't be poking around in here");
    },

    "/stage2": (write: Function) => {
        write(200, "Stage2. http://127.0.0.1:3000/stage/3", {
            // Faulty cookie! Should generate a cookieerror event
            "Set-Cookie": "=test; path=/stage2; domain=test.com"
        });
    },

    "/stage/3": (write: Function) => {
        write(200, "Stage3. <a href='//127.0.0.1:3000/stage/4'>stage4</a>");
    },

    "/stage/4": (write: Function) => {
        write(200, "Stage4. <a href='../stage5'>stage5</a>");
    },

    "/stage5": (write: Function, redir: Function) => {
        redir("/stage6");
    },

    "/stage6": (write: Function) => {
        write(200, "<a href='nofollow'>Go to me, but no further!</a>");
    },

    "/stage7": (write: Function) => {
        write(200, "Crawl complete!");
    },

    "/nofollow": (write: Function) => {
        write(200, "<meta name='robots' content='nofollow'><a href='/stage7'>Don't go here!</a>");
    },

    "/cookie": (write: Function) => {
        const expires = new Date();
        expires.setHours(expires.getHours() + 10);
        const cookie = "thing=stuff; expires=" + expires.toUTCString() + "; path=/; domain=.localhost";

        write(200, "<a href='/stage7'>Link</a>", { "Set-Cookie": cookie });
    },

    "/async-stage1": (write: Function) => {
        write(200, "http://127.0.0.1:3000/async-stage2");
    },

    "/async-stage2": (write: Function) => {
        write(200, "http://127.0.0.1:3000/async-stage3");
    },

    "/async-stage3": (write: Function) => {
        write(200, "Complete!");
    },

    "/timeout": () => {
        // We want to trigger a timeout. Never respond.
    },

    "/timeout2": () => {
        // We want to trigger a timeout. Never respond.
    },

    "/domain-redirect": (write: Function, redir: Function) => {
        redir("http://localhost:3000/");
    },

    "/domain-redirect2": (write: Function, redir: Function) => {
        redir("http://localhost:3000/domain-redirect");
    },

    "/to-domain-redirect": (write: Function) => {
        write(200, "<a href='/domain-redirect'>redirect</a>");
    },

    // Routes for depth tests
    "/depth/1": (write: Function) => {
        write(200, "<link rel='stylesheet' href='/css'> Home. <a href='/depth/2'>depth2</a>");
    },

    "/depth/2": (write: Function) => {
        write(200, "Depth 2. http://127.0.0.1:3000/depth/3");
    },

    "/depth/3": (write: Function) => {
        write(200, "Depth 3. <link rel='stylesheet' href='/css/2'> <link rel='stylesheet' href='/css/4'>");
    },

    "/css": (write: Function) => {
        write(200, "/* CSS 1 */ @import url('/css/2'); @font-face { url(/font/1) format('woff'); }", { "Content-Type": "text/css" });
    },

    "/css/2": (write: Function) => {
        write(200, "/* CSS 2 */ @import url('/css/3'); .img1 { background-image:url('/img/1'); }", { "Content-Type": "text/css" });
    },

    "/css/3": (write: Function) => {
        write(200, "/* CSS 3 */", { "Content-Type": "text/css" });
    },

    "/css/4": (write: Function) => {
        write(200, "/* CSS 4 */ .img1 { background-image:url('/img/2'); } @font-face { url(/font/2) format('woff'); }", { "Content-Type": "text/css" });
    },

    "/img/1": (write: Function) => {
        write(200, "", { "Content-Type": "image/png" });
    },

    "/img/2": (write: Function) => {
        write(200, "", { "Content-Type": "image/png" });
    },

    "/font/1": (write: Function) => {
        write(200, "", { "Content-Type": "font/woff" });
    },

    "/font/2": (write: Function) => {
        write(200, "", { "Content-Type": "application/font-woff" });
    },

    "/404": (write: Function) => {
        write(404, "page not found");
    },

    "/410": (write: Function) => {
        write(410, "this page no longer exists!");
    },

    "/etag": (write: Function, redir: Function, req: AnyObject) => {
        const etag = "\"3c1ceb-13e84-5893853673580;589c03961f340\"";
        if (req.headers["if-none-match"] === etag) {
            write(304, "Not Modified", { ETag: etag });
        } else {
            write(200, "", { ETag: etag });
        }
    },

    "/last-modified": (write: Function, redir: Function, req: AnyObject) => {
        const lastmod = "Sun, 19 May 2019 07:11:34 GMT";
        const ifmod = req.headers["if-modified-since"];
        if (ifmod && new Date(lastmod) <= new Date(ifmod)) {
            write(304, "Not Modified", { "Last-Modified": lastmod });
        } else {
            write(200, "", { "Last-Modified": lastmod });
        }
    },

    "/script": (write: Function) => {
        write(200, "<script src='/not/existent/file.js'></script><script>var foo = 'bar';</script><a href='/stage2'>stage2</a><script>var bar = 'foo';</script>");
    },

    "/to/other/port": (write: Function) => {
        write(200, "<a href='//127.0.0.1:3001/disallowed'>Don't go there!</a>");
    },

    "/encoded/header": (write: Function) => {
        write(200, getFixtureFile("encoded.html"), { "Content-Type": "text/html; charset=ISO-8859-1" });
    },

    "/encoded/inline": (write: Function) => {
        write(200, getFixtureFile("inline-encoding.html"));
    },

    "/encoded/old-inline": (write: Function) => {
        write(200, getFixtureFile("old-inline-encoding.html"));
    },

    "/encoded/empty": (write: Function) => {
        write(200, "");
    },

    "/compressed/link": (write: Function) => {
        zlib.gzip("<a href='/compressed/gzip'>Go to gzip</a>", function(error, result) {
            write(200, result, { "Content-Encoding": "gzip" });
        });
    },

    "/compressed/gzip": (write: Function) => {
        zlib.gzip("Yay, you know how to deal with gzip compression!", function(error, result) {
            write(200, result, { "Content-Encoding": "gzip" });
        });
    },

    "/compressed/deflate": (write: Function) => {
        zlib.deflate("Yay, you know how to deal with deflate compression!", function(error, result) {
            write(200, result, { "Content-Encoding": "deflate" });
        });
    },

    "/big": (write: Function) => {
        write(200, Buffer.alloc(1024 * 1024 * 17));
    }
};
