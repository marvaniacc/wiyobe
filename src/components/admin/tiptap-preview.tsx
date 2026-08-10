'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { useEffect } from 'react'
import type { TiptapJSON } from './tiptap-editor'

/* -------------------------------------------------------------------------
 * TiptapPreview — read-only renderer for stored TipTap JSON content
 *
 * Uses a non-editable TipTap editor instance to render the JSON content
 * exactly as it will appear publicly. This ensures the preview is
 * pixel-accurate — the same extensions (StarterKit, Link, Image) are used
 * so every node type renders correctly.
 * ----------------------------------------------------------------------- */

export function TiptapPreview({ content }: { content: TiptapJSON | null }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank', class: 'text-primary underline' },
      }),
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content: content || { type: 'doc', content: [{ type: 'paragraph' }] },
    editable: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none',
      },
    },
  })

  // Sync content when the prop changes (e.g. switching between posts).
  useEffect(() => {
    if (editor && content) {
      const current = JSON.stringify(editor.getJSON())
      const incoming = JSON.stringify(content)
      if (current !== incoming) {
        editor.commands.setContent(content, false)
      }
    }
  }, [content, editor])

  if (!editor) return null

  return <EditorContent editor={editor} />
}
