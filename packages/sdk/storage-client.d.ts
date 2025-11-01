export type StorageScope = 'shared' | 'user';
export interface StorageClientOptions {
  baseUrl?: string;
  appId?: string;
  scope?: StorageScope;
  fetchImpl?: typeof fetch;
}
export interface Snapshot<T = any> { etag: string; data: T; }
export type PatchOp = { op: 'set'; key: string; value: any } | { op: 'del'; key: string } | { op: 'clear' };
export interface SubscribeOptions<T=any> {
  interval?: number;
  onChange?: (snap: Snapshot<T>) => void;
  onError?: (err: any) => void;
}
export declare class StorageClient {
  constructor(options?: StorageClientOptions);
  get<T=any>(ns: string): Promise<Snapshot<T>>;
  patch<T=any>(ns: string, ops: PatchOp[], ifMatch: string): Promise<Snapshot<T>>;
  setObject<T=any>(ns: string, key: string, value: any, ifMatch: string): Promise<Snapshot<T>>;
  subscribe<T=any>(ns: string, options: SubscribeOptions<T>): () => void;
}
