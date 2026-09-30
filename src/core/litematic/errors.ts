export type LitematicErrorCode = 'not-nbt' | 'no-regions' | 'unsupported-version' | 'corrupt'

export class LitematicError extends Error {
  readonly code: LitematicErrorCode

  constructor(code: LitematicErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'LitematicError'
    this.code = code
  }
}
