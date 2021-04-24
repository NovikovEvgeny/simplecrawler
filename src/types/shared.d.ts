export interface AnyObject {
  [key: string]: any,
}

export interface NodeCallback<T> {
  (err: any, result?: undefined): void;
  (err: null, result: T): void;
}

export interface NodeCallback2<T, R> {
  (err: any, result1?: undefined, result2?: undefined): void;
  (err: null, result1: T, result2: R): void;
}