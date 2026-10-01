import { EditError } from '../../core/edit/errors'
import { ParseFailure } from '../../workers/parseClient'
import { SaveFailure } from '../../workers/saveClient'

/** What the error dialog shows (spec §12): a friendly title and message, technical details collapsed. */
export interface AppError {
  title: string
  message: string
  details?: string
}

const OPEN_TITLES: Record<ParseFailure['code'], string> = {
  'not-nbt': 'Not a Litematica file',
  'no-regions': 'Not a Litematica file',
  corrupt: 'This file is damaged',
  'unsupported-version': 'Unsupported Minecraft version',
  timeout: 'The file could not be read',
  internal: 'The file could not be read',
}

const stack = (e: unknown) => (e instanceof Error ? e.stack ?? e.message : String(e))

/** Turns anything thrown by opening, saving or editing into what the error dialog shows. */
export function friendlyError(e: unknown, action: 'open' | 'save' | 'edit'): AppError {
  if (e instanceof ParseFailure) {
    const hint = e.code === 'not-nbt' || e.code === 'no-regions' ? ' Only .litematic files from the Litematica mod can be opened.' : ''
    return { title: OPEN_TITLES[e.code], message: e.message + hint, details: e.details }
  }
  if (e instanceof SaveFailure) {
    return {
      title: e.code === 'round-trip' ? 'Save blocked' : 'Save failed',
      message: e.message,
      details: e.details,
    }
  }
  if (e instanceof EditError || e instanceof SyntaxError || e instanceof RangeError) {
    return { title: action === 'edit' ? 'Edit not applied' : 'Invalid value', message: e.message }
  }
  const title = action === 'open' ? 'The file could not be opened' : action === 'save' ? 'Save failed' : 'Edit failed'
  return { title, message: e instanceof Error ? e.message : String(e), details: stack(e) }
}
