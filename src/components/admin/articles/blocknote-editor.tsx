'use client'

import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import type { PartialBlock } from '@blocknote/core'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { useEffect, useRef } from 'react'

interface Props {
  initialContent?: PartialBlock[]
  onChange: (content: PartialBlock[]) => void
}

async function uploadFile(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/upload', {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Upload failed (${res.status})`)
  }
  const data = (await res.json()) as { url: string }
  return data.url
}

export function BlockNoteEditor({ initialContent, onChange }: Readonly<Props>) {
  // Non-empty fallback so BlockNote initializes with at least a paragraph.
  const seed =
    initialContent && initialContent.length > 0
      ? initialContent
      : ([{ type: 'paragraph', content: [] }] as PartialBlock[])

  const editor = useCreateBlockNote({
    initialContent: seed,
    uploadFile,
  })

  // Keep the latest callback in a ref so we don't re-subscribe on every render.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      onChangeRef.current(editor.document as PartialBlock[])
    })
    return unsubscribe
  }, [editor])

  return (
    <div className="rounded-lg border border-gray-200 bg-white min-h-[400px]">
      <BlockNoteView editor={editor} theme="light" />
    </div>
  )
}
