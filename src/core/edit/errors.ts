export type EditErrorCode = 'unknown-block' | 'unknown-property' | 'invalid-value'

/** A replace target or matcher that does not fit the block registry. */
export class EditError extends Error {
  readonly code: EditErrorCode

  constructor(code: EditErrorCode, message: string) {
    super(message)
    this.name = 'EditError'
    this.code = code
  }
}
