/*
 * Simplecrawler - FS cache backend
 * https://github.com/simplecrawler/simplecrawler
 * Tries to ensure a local 'cache' of a website is as close as possible to a mirror of the website itself.
 * The idea is that it is then possible to re-serve the website just using the cache.
 * Copyright (c) 2011-2015, Christopher Giffard
 *
 */
import * as fs from 'fs';
import * as crypto from 'crypto';
import { NodeCallback, QueueItem } from './types';
import { CacheBackend, CacheObject, CacheObjectGet } from './types/cache';


// Function for sanitising paths
// We try to get the most understandable, file-system friendly paths we can.
// An extension is added if not present or inappropriate - if a better one can be determined.
// Querystrings are hashed to truncate without (hopefully) collision.

function sanitisePath(path: string, queueObject: QueueItem) {
  const headers = queueObject.stateData.headers || {};

  // Remove first slash (as we set one later.)
  path = path.replace(/^\//, "");

  // Trim whitespace. If no path is present - assume index.html.
  let sanitisedPath = path.length ? path.replace(/\s*$/ig, "") : "index.html";

  if (sanitisedPath.match(/\?/)) {
    const sanitisedPathParts = sanitisedPath.split(/\?/g);
    const resource = sanitisedPathParts.shift();
    const hashedQS = crypto.createHash("sha1").update(sanitisedPathParts.join("?")).digest("hex");
    sanitisedPath = resource + "?" + hashedQS;
  }

  const pathStack = sanitisedPath.split(/\//g).map((pathChunk) => {
    if (pathChunk.length >= 250) {
      return crypto.createHash("sha1").update(pathChunk).digest("hex");
    }

    return pathChunk;
  });

  sanitisedPath = pathStack.join("/");

  // Try to get a file extension for the file - for ease of identification
  // We run through this if we either:
  //  1) haven't got a file extension at all, or:
  //  2) have an HTML file without an HTML file extension (might be .php, .aspx, .do, or some other server-processed type)

  if (!sanitisedPath.match(/\.[a-z0-9]{1,6}$/i) || headers["content-type"] && headers["content-type"].match(/text\/html/i) && !sanitisedPath.match(/\.htm[l]?$/i)) {
    let subMimeType = "";
    let mimeParts = [];

    if (headers["content-type"] && headers["content-type"].match(/text\/html/i)) {
      if (sanitisedPath.match(/\/$/)) {
        sanitisedPath += "index.html";
      } else {
        sanitisedPath += ".html";
      }

    } else if (headers["content-type"] && (mimeParts = headers["content-type"].match(/(image|video|audio|application)\/([a-z0-9]+)/i))) {
      subMimeType = mimeParts[2];
      sanitisedPath += "." + subMimeType;
    }
  }

  return sanitisedPath;
}


class FSBackend implements CacheBackend {
  private loaded: boolean;
  private index: any[];
  private location: string;

  constructor(loadParameter: string) {
    this.loaded = false;
    this.index = [];
    this.location = typeof loadParameter === "string" && loadParameter.length > 0 ? loadParameter : process.cwd() + "/cache/";
    this.location = this.location.substr(this.location.length - 1) === "/" ? this.location : this.location + "/";
  }


  fileExists(location: string): boolean {
    try {
      fs.statSync(location);
      return true;
    } catch (er) {
      return false;
    }
  }


  isDirectory(location: string): boolean {
    try {
      if (fs.statSync(location).isDirectory()) {
        return true;
      }
      return false;
    } catch (er) {
      return false;
    }
  }


  load(): void {
    if (!this.fileExists(this.location) && this.isDirectory(this.location)) {
      throw new Error("Unable to verify cache location exists.");
    }

    try {
      let fileData;
      if ((fileData = fs.readFileSync(this.location + "cacheindex.json")) && fileData.length) {
        this.index = JSON.parse(fileData.toString("utf8"));
        this.loaded = true;
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        // Cache index doesn't exist. Assume this is a new cache.
        // Just leave the memory index empty for now.
        this.loaded = true;
      } else {
        throw error;
      }
    }

    // Flush store to disk when closing.
    process.on("exit", () => {
      this.saveCache();
    });
  }

  saveCache(callback?: fs.NoParamCallback): void {
    if (callback) {
      fs.writeFile(this.location + "cacheindex.json", JSON.stringify(this.index), callback);
    } else {
      fs.writeFileSync(this.location + "cacheindex.json", JSON.stringify(this.index));
    }
  }

  setItem(queueObject: QueueItem, data: string | NodeJS.ArrayBufferView, callback?: NodeCallback<CacheObject>): void {
    callback = callback && callback instanceof Function ? callback : function () { };

    let pathStack = [queueObject.protocol, queueObject.host, queueObject.port];
    pathStack = pathStack.concat(sanitisePath(queueObject.path, queueObject).split(/\/+/g));

    let cacheItemExists = false;
    let firstInstanceIndex = NaN;
    if (this.index.reduce((prev, current, index) => {
      firstInstanceIndex = !isNaN(firstInstanceIndex) ? firstInstanceIndex : index;
      return prev || current.url === queueObject.url;
    }, false)) {
      cacheItemExists = true;
    }

    const writeFileData = (currentPath: string, data: string | NodeJS.ArrayBufferView) => {
      fs.writeFile(currentPath, data, (error) => {
        if (error) {
          if (callback instanceof Function) {
            callback(error);
          }
        }
        fs.writeFile(currentPath + ".cacheData.json", JSON.stringify(queueObject), (error) => {
          if (callback instanceof Function) {
            callback(error);
          }

          const cacheObject: CacheObject = {
            url: queueObject.url,
            etag: queueObject?.stateData?.headers?.etag,
            lastModified: queueObject?.stateData?.headers?.["last-modified"],
            dataFile: currentPath,
            metaFile: currentPath + ".cacheData.json"
          };

          if (cacheItemExists) {
            this.index[firstInstanceIndex] = cacheObject;
          } else {
            this.index.push(cacheObject);
          }
          if (callback instanceof Function) {
            callback(null, cacheObject);
          }
        });
      });
    };

    pathStack.forEach((pathChunk, count) => {
      const currentPath = this.location + pathStack.slice(0, count + 1).join("/");
      if (this.fileExists(this.location + pathStack.slice(0, count + 1).join("/"))) {
        if (!this.isDirectory(currentPath)) {
          if (count === pathStack.length - 1) {
            // Just overwrite the file...
            writeFileData(currentPath, data);
          } else {
            throw new Error(`Cache storage of resource (${queueObject.url}) blocked by file: ${currentPath}`);
          }
        }
      } else if (count === pathStack.length - 1) {
        // Write the file data in
        writeFileData(currentPath, data);
      } else {
        fs.mkdirSync(currentPath);
      }
    });
  }

  getItem(queueObject: QueueItem, callback: NodeCallback<CacheObjectGet>): void {
    const cacheItemResult = this.index.filter((item) => item.url === queueObject.url);

    if (cacheItemResult.length) {
      const cacheItem = cacheItemResult.shift();

      callback({
        url: cacheItem.url,
        etag: cacheItem.etag,
        lastModified: cacheItem.lastModified,
        getData: (cb: NodeCallback<Buffer>) => {
          fs.readFile(cacheItem.dataFile, (error, data) => {
            if (error) {
              cb(error);
              return false;
            }

            cb(null, data);
          });
        },
        getMetadata: (cb: NodeCallback<Buffer>) => {
          fs.readFile(cacheItem.metaFile, (error, data) => {
            if (error) {
              callback(error);
              return false;
            }

            cb(null, JSON.parse(data.toString("utf8")));
          });
        }
      });
    } else {
      callback(null);
    }
  }
}

// Factory for FSBackend
export function backend(loadParameter: string): CacheBackend {
  return new FSBackend(loadParameter);
}
