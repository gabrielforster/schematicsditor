// Characters Windows, macOS or Linux reject in file names, plus control characters.
const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f\u007f]/g
const MAX_BASE_LENGTH = 120

/** `castle.litematic` → `castle`. */
export function baseName(fileName: string): string {
  return fileName.replace(/\.litematic$/i, '')
}

/**
 * The download name for a schematic (spec §11: `<name>.litematic`): the
 * metadata name made safe for every OS, or the opened file's name when the
 * metadata name is blank or nothing but forbidden characters.
 */
export function downloadName(metadataName: string, openedFileName: string, extension = '.litematic'): string {
  const clean = (s: string) => s.replace(FORBIDDEN, '_').replace(/^[\s.]+|[\s.]+$/g, '').slice(0, MAX_BASE_LENGTH)
  const fromName = clean(metadataName)
  const base = /[^_]/.test(fromName) ? fromName : clean(baseName(openedFileName)) || 'schematic'
  return base + extension
}
