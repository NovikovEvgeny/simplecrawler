/*
 * Simplecrawler - cache module
 * https://github.com/simplecrawler/simplecrawler
 *
 * Copyright (c) 2011-2015, Christopher Giffard
 *
 */

import { EventEmitter } from "events";

import { backend as FilesystemBackend } from "./cache-backend-fs.js";
import { NodeCallback, QueueItem } from "./types"
import { CacheBackend, CacheObject, CacheObjectGet } from "./types/cache.js";

// TODO typings for events
export class Cache extends EventEmitter {
  private datastore: CacheBackend;

  constructor(cacheLoadParameter: string, cacheBackendFactory: (loadParameter: string) => CacheBackend) {
    super();
    // Ensure parameters are how we want them...
    cacheBackendFactory = typeof cacheBackendFactory === "function" ? cacheBackendFactory : FilesystemBackend;

    // Now we can just run the factory.
    this.datastore = cacheBackendFactory(cacheLoadParameter);

    // Instruct the backend to load up.
    this.datastore.load();
  }

  setCacheData(queueItem: QueueItem, data: string | NodeJS.ArrayBufferView, callback: NodeCallback<CacheObject>): void {
    this.datastore.setItem(queueItem, data, callback);
    this.emit("setcache", queueItem, data);
  }

  getCacheData(queueItem: QueueItem, callback: NodeCallback<CacheObjectGet>): void {
    this.datastore.getItem(queueItem, callback);
  }

  saveCache(): void {
    this.datastore.saveCache();
  }
}

export { FilesystemBackend };

