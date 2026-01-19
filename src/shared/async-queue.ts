export class AsyncQueue<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private resolvers: Array<(value: IteratorResult<T>) => void> = [];
  private closed = false;

  constructor(private readonly bufferSize = Infinity) {}

  push(item: T): boolean {
    if (this.closed) {
      throw new Error("event channel closed");
    }

    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      if (resolve) {
        resolve({ value: item, done: false });
        return true;
      }
    }

    if (this.buffer.length < this.bufferSize) {
      this.buffer.push(item);
      return true;
    }

    return false;
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    for (const resolve of this.resolvers) {
      resolve({ value: undefined as T, done: true });
    }
    this.resolvers = [];
  }

  get isClosed(): boolean {
    return this.closed;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.buffer.length > 0) {
          const value = this.buffer.shift() as T;
          return Promise.resolve({ value, done: false });
        }

        if (this.closed) {
          return Promise.resolve({ value: undefined as T, done: true });
        }

        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve);
        });
      }
    };
  }
}
