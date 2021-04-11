import { AnyObject, NodeCallback } from "./shared";

export interface StateData {
  requestLatency?: number;
  requestTime?: number;
  downloadTime?: number;
  contentLength?: number;
  contentType?: string;
  code?: number;
  headers?: { [headerName: string]: any };
  actualDataSize?: number;
  sentIncorrectSize?: boolean;
}

export interface QueueItem {
  id: number;
  url: string;
  protocol: string;
  host: string;
  port: number;
  path: string;
  uriPath: string;
  depth: number;
  referrer: string;
  fetched: boolean;
  stateData: StateData;
  status: 'queued' | 'spooled' | 'headers' | 'downloaded' | 'redirected' | 'notfound' | 'failed';
}

export interface FetchQueueInterface {
  /**
  * Adds an item to the queue
  * @param {QueueItem} queueItem Queue item that is to be added to the queue
  * @param {Boolean} [force=false] If true, the queue item will be added regardless of whether it already exists in the queue
  * @param {Function} callback Gets two parameters, `error` and `queueItem`. If the operation was successful, `error` will be `null` and `queueItem` will be the item that was added to the queue. It's status property will have changed to `"queued"`.
  */
  add(queueItem: QueueItem, force: boolean, callback: NodeCallback<QueueItem>): void;

  /**
  * Checks if a URL already exists in the queue. Returns the number of occurences
  * of that URL.
  * @param {String} url URL to check the existence of in the queue
  * @param {Function} callback Gets two parameters, `error` and `count`. If the operation was successful, `error` will be `null`.
  */
  exists(url: string, callback: NodeCallback<boolean>): void;

  /**
  * Get a queue item by index
  * @param {Number} index The index of the queue item in the queue
  * @param {Function} callback Gets two parameters, `error` and `queueItem`. If the operation was successful, `error` will be `null`.
  */
  get(index: number, callback: NodeCallback<QueueItem>): void;

  /**
  * Updates a queue item in the queue.
  * @param {Number} id ID of the queue item that is to be updated
  * @param {Object} updates Object that will be deeply assigned (as in `Object.assign`) to the queue item. That means that nested objects will also be resursively assigned.
  * @param {Function} callback Gets two parameters, `error` and `queueItem`. If the operation was successful, `error` will be `null`.
  */
  update(id: number, updates: AnyObject, callback: NodeCallback<QueueItem>): void;

  /**
  * Gets the first unfetched item in the queue
  * @param {Function} callback Gets two parameters, `error` and `queueItem`. If the operation was successful, `error` will be `null`. If there are unfetched queue items left, `queueItem` will be the oldest one found. If not, `queueItem` will be `null`.
  */
  oldestUnfetchedItem(callback: NodeCallback<QueueItem | null>): void;

  /**
  * Gets the maximum value of a stateData property from all the items in the
  * queue. This means you can eg. get the maximum request time, download size
  * etc.
  * @param {string} statisticName Can be any of the strings in {@link FetchQueue._allowedStatistics}
  * @param {Function} callback Gets two parameters, `error` and `max`. If the operation was successful, `error` will be `null`.
  */
  max(statisticName: string, callback: NodeCallback<number>): void;

  /**
  * Gets the minimum value of a stateData property from all the items in the
  * queue. This means you can eg. get the minimum request time, download size
  * etc.
  * @param {Function} callback Gets two parameters, `error` and `min`. If the operation was successful, `error` will be `null`.
  */
  min(statisticName: string, callback: NodeCallback<number>): void;


  /**
  * Gets the maximum value of a stateData property from all the items in the
  * queue. This means you can eg. get the maximum request time, download size
  * etc.
  * @param {Function} callback Gets two parameters, `error` and `avg`. If the operation was successful, `error` will be `null`.
  */
  avg(statisticName: string, callback: NodeCallback<number>): void;


  /**
  * Counts the items in the queue that match a selector
  * @param comparator Comparator object used to filter items. Queue items that are counted need to match all the properties of this object.
  * @param {Function} callback Gets two parameters, `error` and `count`. If the operation was successful, `error` will be `null` and `count` will be count of matched items.
  */
//   countItems(comparator: AnyObject, callback: (error: Error | null, count?: number) => void): void;
  countItems(comparator: AnyObject, callback: NodeCallback<number>): void;

  /**
  * Filters and returns the items in the queue that match a selector
  * @param comparator Comparator object used to filter items. Queue items that are returned need to match all the properties of this object.
  * @param {Function} callback Gets two parameters, `error` and `items`. If the operation was successful, `error` will be `null` and `items` will be an array of QueueItems.
  */
  filterItems(comparator: AnyObject, callback: NodeCallback<QueueItem[]>): void;

  /**
  * Gets the total number of queue items in the queue
  * @param {Function} callback Gets two parameters, `error` and `length`. If the operation was successful, `error` will be `null`.
  */
  getLength(callback: NodeCallback<number>): void;

  /**
  * Writes the queue to disk in a JSON file. This file can later be imported
  * using {@link FetchQueue#defrost}
  * @param {string} filename Filename passed directly to [fs.writeFile]{@link https://nodejs.org/api/fs.html#fs_fs_writefile_file_data_options_callback}
  * @param {Function} callback Gets a single `error` parameter. If the operation was successful, this parameter will be `null`.
  */
 freeze(filename: string, callback: NodeCallback<undefined>): void;


  /**
  * Import the queue from a frozen JSON file on disk.
  * @param {string} filename Filename passed directly to [fs.readFile]{@link https://nodejs.org/api/fs.html#fs_fs_readfile_file_options_callback}
  * @param {Function} callback Gets a single `error` parameter. If the operation was successful, this parameter will be `null`.
  */
  defrost(filename: string, callback: NodeCallback<FetchQueueInterface>): void;
}

export interface QueueAddError extends Error {
  code: string;
}
