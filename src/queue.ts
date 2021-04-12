/**
 * @file simplecrawler's queue implementation. This also serves as a reference
 * for the queue interface, that can be implemented by third parties as well
 */

import * as fs from 'fs';
import { AnyObject, FetchQueueInterface, NodeCallback, QueueItem, StateData, QueueAddError } from './types';
import { enumerable } from './decorators';

/**
* Recursive function that compares immutable properties on two objects.
* @param a Source object that will be compared against
* @param b Comparison object. The functions determines if all of this object's properties are the same on the first object.
* @return Returns true if all of the properties on `b` matched a property on `a`. If not, it returns false.
*/
function compare(a: AnyObject, b: AnyObject): boolean {
  for (const key in a) {
    if (a.hasOwnProperty(key)) {
      if (typeof a[key] !== typeof b[key]) {
        return false;
      }

      if (typeof a[key] === "object") {
        if (!compare(a[key], b[key])) {
          return false;
        }
      } else if (a[key] !== b[key]) {
        return false;
      }
    }
  }

  return true;
}

/**
* Recursive function that takes two objects and updates the properties on the
* first object based on the ones in the second. Basically, it's a recursive
* version of Object.assign.
*/
function deepAssign(object: AnyObject, source: AnyObject): AnyObject {
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (typeof object[key] === "object" && typeof source[key] === "object") {
        deepAssign(object[key], source[key]);
      } else {
        object[key] = source[key];
      }
    }
  }

  return object;
}


class QueueAddErrorImpl extends Error implements QueueAddError {
  public code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export enum QueueItemStatus {
  QUEUED = "queued",
  SPOOLED = "spooled",
  HEADERS = "headers",
  DOWNLOAD = "download",
  REDIRECTED = "redirected",
  NOTFOUND = "notfound",
  FAILED = "failed",
}

/**
* FetchQueue handles {@link QueueItem}s and provides a few utility methods for querying them
*/
export class FetchQueue extends Array<QueueItem> implements FetchQueueInterface {
  /**
  * Speeds up {@link FetchQueue.oldestUnfetchedItem} by storing the index at
  * which the latest oldest unfetched queue item was found.
  */
  @enumerable(false)
  private _oldestUnfetchedIndex: number = 0;

  /**
  * Serves as a cache for what URL's have been fetched.
  */
  @enumerable(false)
  private _scanIndex: Set<string> = new Set();

  /**
  * Controls what properties can be operated on with the
  * {@link FetchQueue#min}, {@link FetchQueue#avg} and {@link FetchQueue#max}
  * methods.
  */
  // TODO make const?
  @enumerable(false)
  private _allowedStatistics: Set<string> = new Set();

  constructor() {
    super();
    this._allowedStatistics.add("actualDataSize");
    this._allowedStatistics.add("contentLength");
    this._allowedStatistics.add("downloadTime");
    this._allowedStatistics.add("requestLatency");
    this._allowedStatistics.add("requestTime");
  }

  add(queueItem: QueueItem, force: boolean, callback: NodeCallback<QueueItem>): void {
    const addToQueue = () => {
      this._scanIndex.add(queueItem.url);
      queueItem.id = this.length;
      queueItem.status = QueueItemStatus.QUEUED;
      this.push(queueItem);
      callback(null, queueItem);
    }

    this.exists(queueItem.url, (err: Error | null, exists?: boolean) => {
      if (err) {
        callback(err);
      } else if (!exists) {
        addToQueue();
      } else if (force) {
        if (this.includes(queueItem)) {
          callback(new Error("Can't add a queueItem instance twice. You may create a new one from the same URL however."));
        } else {
          addToQueue();
        }
      } else {
        const error = new QueueAddErrorImpl("Resource already exists in queue!", "DUPLICATE");
        callback(error);
      }
    });
  }

  exists(url: string, callback: NodeCallback<boolean>): void {
    if (this._scanIndex.has(url)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  }

  get(index: number, callback: NodeCallback<QueueItem>): void {
    this.getLength((error: Error | null, length?: number) => {
      if (error) {
        callback(error);
      } else if (index >= length!) {
        callback(new RangeError("Index was greater than the queue's length"));
      } else {
        callback(null, this[index]);
      }
    });
  }

  update(id: number, updates: AnyObject, callback: NodeCallback<QueueItem>): void {
    let queueItem: QueueItem | undefined = undefined;

    // TODO improve linear search?
    for (let i = 0; i < this.length; i++) {
      if (this[i].id === id) {
        queueItem = this[i];
        break;
      }
    }

    if (!queueItem) {
      callback(new Error("No queueItem found with that URL"));
    } else {
      deepAssign(queueItem, updates);
      callback(null, queueItem);
    }
  }

  oldestUnfetchedItem(callback: NodeCallback<QueueItem | null>): void {
    for (let i = this._oldestUnfetchedIndex; i < this.length; i++) {
      if (this[i].status === QueueItemStatus.QUEUED) {
        this._oldestUnfetchedIndex = i;
        callback(null, this[i]);
        return;
      }
    }

    // When no unfetched queue items remain, we previously called back with an
    // error, but since it's not really an error condition, we opted to just
    // call back with (null, null) instead
    callback(null, null);
  }

  // TODO change statisticName to ENUM?
  max(statisticName: keyof StateData, callback: NodeCallback<number>): void {
    let maximum = 0;

    // TODO fix validation to use keyof (type guard)
    if (!this._allowedStatistics.has(statisticName)) {
      return callback(new Error("Invalid statistic"));
    }

    this.forEach((item) => {
      // TODO fix tsignore
      // @ts-ignore
      if (item.fetched && item.stateData[statisticName] > maximum) {
        // @ts-ignore
        maximum = item.stateData[statisticName];
      }
    });

    callback(null, maximum);
  }

  min(statisticName: keyof StateData, callback: NodeCallback<number>): void {
    let minimum = Infinity;

    if (!this._allowedStatistics.has(statisticName)) {
      return callback(new Error("Invalid statistic"));
    }

    this.forEach((item) => {
      // @ts-ignore
      if (item.fetched && item.stateData[statisticName] < minimum) {
        // @ts-ignore
        minimum = item.stateData[statisticName];
      }
    });

    callback(null, minimum === Infinity ? 0 : minimum);
  }

  avg(statisticName: string, callback: NodeCallback<number>): void {
    let sum = 0;
    let count = 0;

    if (!this._allowedStatistics.has(statisticName)) {
      return callback(new Error("Invalid statistic"));
    }

    this.forEach((item) => {
      // @ts-ignore
      if (item.fetched && Number.isFinite(item.stateData[statisticName])) {
        // @ts-ignore
        sum += item.stateData[statisticName];
        count++;
      }
    });

    callback(null, sum / count);
  }

  countItems(comparator: AnyObject, callback: NodeCallback<number>): void {
    this.filterItems(comparator, (error: Error | null, items?: QueueItem[]) => {
      if (error) {
        callback(error);
      } else {
        callback(null, items!.length || 0);
      }
    });
  }

  filterItems(comparator: AnyObject, callback: NodeCallback<QueueItem[]>): void {
    const items = this.filter((queueItem) => compare(comparator, queueItem));
    callback(null, items);
  }

  getLength(callback: NodeCallback<number>): void {
    callback(null, this.length);
  }

  freeze(filename: string, callback: NodeCallback<undefined>): void {
    // Re-queue in-progress items before freezing...
    this.forEach((item) => {
      if (!item.fetched) {
        item.status = QueueItemStatus.QUEUED;
      }
    });

    fs.writeFile(filename, JSON.stringify(this, null, 2), function (err) {
      callback(err);
    });
  }

  defrost(filename: string, callback: NodeCallback<FetchQueueInterface>): void {
    let defrostedQueue = [];

    fs.readFile(filename, (err, fileData) => {
      if (err) {
        return callback(err);
      }

      if (!fileData.toString("utf8").length) {
        return callback(new Error("Failed to defrost queue from zero-length JSON."));
      }

      try {
        defrostedQueue = JSON.parse(fileData.toString("utf8"));
      } catch (error) {
        return callback(error);
      }

      this._oldestUnfetchedIndex = defrostedQueue.length - 1;
      this._scanIndex = new Set();

      defrostedQueue.forEach((queueItem: QueueItem, index: number) => {
        this.push(queueItem);
        this._scanIndex.add(queueItem.url);

        if (queueItem.status === QueueItemStatus.QUEUED && this._oldestUnfetchedIndex > index) {
          this._oldestUnfetchedIndex = index;
        }
      });

      callback(null, this);
    });
  }
}
