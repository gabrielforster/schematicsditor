import { createContext, useContext, useSyncExternalStore } from 'react'
import type { AppController } from './app/controller'
import type { AppState } from './app/state'

export const ControllerContext = createContext<AppController | null>(null)

export function useController(): AppController {
  const controller = useContext(ControllerContext)
  if (!controller) throw new Error('useController needs a ControllerContext provider')
  return controller
}

/**
 * Reads one slice of app state and re-renders when it changes. `select`
 * must return a value already in the state (or a primitive), not a new
 * object, or React re-renders forever.
 */
export function useApp<T>(select: (state: AppState) => T): T {
  const { store } = useController()
  return useSyncExternalStore(store.subscribe, () => select(store.getState()))
}
