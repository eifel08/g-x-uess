/** The subset of Map that mathjs (and our scopes) need. */
export interface MapLike {
  get(key: string): unknown;
  has(key: string): boolean;
  keys(): Iterable<string>;
}

/** A Map-compatible scope with local bindings layered over a parent scope. */
export class LayeredScope implements MapLike {
  private readonly local = new Map<string, unknown>();
  constructor(private readonly parent: MapLike) {}
  get(key: string) {
    return this.local.has(key) ? this.local.get(key) : this.parent.get(key);
  }
  set(key: string, value: unknown) {
    this.local.set(key, value);
    return this;
  }
  has(key: string) {
    return this.local.has(key) || this.parent.has(key);
  }
  keys() {
    return new Set([...this.parent.keys(), ...this.local.keys()]).values();
  }
  delete(key: string) {
    return this.local.delete(key);
  }
  clear() {
    this.local.clear();
  }
  forEach(cb: (value: unknown, key: string) => void) {
    for (const key of this.keys()) cb(this.get(key), key);
  }
}

/** Converts a mathjs evaluation result to a real number (NaN if not real). */
export function toReal(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return NaN;
}
