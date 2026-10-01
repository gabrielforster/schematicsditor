/** A minimal observable state container; React reads it through `useStore` (src/ui/hooks.ts). */
export class Store<T extends object> {
  private state: T
  private readonly listeners = new Set<() => void>()

  constructor(initial: T) {
    this.state = initial
  }

  getState = (): T => this.state

  /** Shallow-merges `patch` (or the result of calling it) and notifies listeners. */
  setState(patch: Partial<T> | ((state: T) => Partial<T>)): void {
    const next = typeof patch === 'function' ? patch(this.state) : patch
    this.state = { ...this.state, ...next }
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
