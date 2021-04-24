import * as fs from 'fs';
import { NodeCallback } from './shared';
import { QueueItem } from './queue';

export interface CacheObject {
    url: string;
    etag?: string;
    lastModified?: string;
    dataFile: string | Buffer;
    metaFile: string;
}


export interface CacheObjectGet {
  url: string;
  etag?: string;
  lastModified?: string;
  getData: (callback: NodeCallback<Buffer>) => void;
  getMetadata: (callback: NodeCallback<Buffer>) => void;
}

export interface CacheBackend {
  load(): void;

  saveCache(callback?: fs.NoParamCallback): void;

  setItem(queueObject: QueueItem, data: string | NodeJS.ArrayBufferView, callback?: NodeCallback<CacheObject>): void;

  getItem(queueObject: QueueItem, callback: NodeCallback<CacheObjectGet>): void;
}

export interface SimpleCache {
  setCacheData(queueItem: QueueItem, data: string | NodeJS.ArrayBufferView, callback?: NodeCallback<CacheObject>): void;
  getCacheData(queueItem: QueueItem, callback: (cacheObject: CacheObjectGet) => void): void;
  saveCache(): void;
}
