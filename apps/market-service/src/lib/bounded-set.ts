/**
 * Insertion-ordered set with a hard size cap. When full, the oldest entry is
 * evicted. Used for in-memory deduplication windows that must never grow
 * without bound.
 */
export class BoundedSet<T> {
  private readonly items = new Set<T>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("BoundedSet capacity must be a positive integer");
    }
  }

  has(value: T): boolean {
    return this.items.has(value);
  }

  /** Adds the value. Returns false if it was already present. */
  add(value: T): boolean {
    if (this.items.has(value)) return false;

    this.items.add(value);

    if (this.items.size > this.capacity) {
      const oldest = this.items.values().next();
      if (!oldest.done) this.items.delete(oldest.value);
    }

    return true;
  }

  delete(value: T): boolean {
    return this.items.delete(value);
  }

  get size(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }
}
