import { useRef, useState, type DragEvent } from 'react'

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

/** Drag-and-drop anywhere (spec §11): handlers for the app root, and whether files are over it. */
export function useFileDrop(onFile: (file: File) => void) {
  const [dragging, setDragging] = useState(false)
  // dragenter/dragleave fire for every child element; count them to know when the pointer leaves the window.
  const depth = useRef(0)
  const handlers = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current++
      setDragging(true)
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) onFile(file)
    },
  }
  return { dragging, handlers }
}
