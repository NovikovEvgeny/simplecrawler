export interface AnyObject {
  [key: string]: any,
}

export interface NodeCallback<T> {
  (err: any, result?: undefined): void;
  (err: null, result: T): void;
}
