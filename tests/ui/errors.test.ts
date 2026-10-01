import { describe, expect, it } from 'vitest'
import { EditError } from '../../src/core/edit/errors'
import { friendlyError } from '../../src/ui/app/errors'
import { ParseFailure } from '../../src/workers/parseClient'
import { SaveFailure } from '../../src/workers/saveClient'

describe('friendlyError', () => {
  it('titles every parse failure and keeps the technical details', () => {
    const cases = [
      ['not-nbt', 'Not a Litematica file'],
      ['no-regions', 'Not a Litematica file'],
      ['corrupt', 'This file is damaged'],
      ['unsupported-version', 'Unsupported Minecraft version'],
      ['timeout', 'The file could not be read'],
      ['internal', 'The file could not be read'],
    ] as const
    for (const [code, title] of cases) {
      const e = friendlyError(new ParseFailure({ code, message: 'm.', details: 'd' }), 'open')
      expect(e.title).toBe(title)
      expect(e.details).toBe('d')
    }
  })

  it('explains the pre-1.13 rejection with the reader message', () => {
    const msg = 'This schematic was made for a Minecraft version before 1.13, which is not supported.'
    expect(friendlyError(new ParseFailure({ code: 'unsupported-version', message: msg, details: '' }), 'open').message).toBe(msg)
  })

  it('calls a round-trip mismatch a blocked save', () => {
    expect(friendlyError(new SaveFailure('round-trip', 'not downloaded', 'diff'), 'save')).toEqual({ title: 'Save blocked', message: 'not downloaded', details: 'diff' })
    expect(friendlyError(new SaveFailure('timeout', 'too long', 'x'), 'save').title).toBe('Save failed')
  })

  it('shows edit errors without details', () => {
    expect(friendlyError(new EditError('unknown-block', 'Unknown block: minecraft:x'), 'edit')).toEqual({ title: 'Edit not applied', message: 'Unknown block: minecraft:x' })
  })

  it('falls back to the error message with the stack as details', () => {
    const e = friendlyError(new Error('boom'), 'open')
    expect(e).toMatchObject({ title: 'The file could not be opened', message: 'boom' })
    expect(e.details).toContain('boom')
  })
})
