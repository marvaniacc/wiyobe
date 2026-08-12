'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { useEffect, useCallback } from 'react'
import { Icon } from '@/components/shared/icon'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { MediaPicker } from '@/components/shared/media-picker'
import { useState } from 'react'

/* -------------------------------------------------------------------------
 * TipTap Editor — JSON in / JSON out
 *
 * A rich-text editor built on TipTap. Strictly uses TipTap's JSON format for
 * both input (`content`) and output (`onChange`) — never HTML — so the
 * stored content is safe to render later without XSS risk.
 *
 * Toolbar: Bold, Italic, H1, H2, Bullet List, Ordered List, Link, Image,
 * Undo, Redo.
 * ----------------------------------------------------------------------- */

export type TiptapJSON = {
  type: string
  content?: TiptapJSON[]
  attrs?: Record<string, unknown>
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
}

export function TiptapEditor({
  content,
  onChange,
}: {
  content: TiptapJSON | null
  onChange: (json: TiptapJSON) => void
}) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content: content || { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: ({ editor }) => {
      // Output JSON only — never HTML. This is the XSS-prevention guarantee.
      onChange(editor.getJSON() as TiptapJSON)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[300px] rounded-b-[14px] border border-t-0 border-divider bg-surface p-4 focus:outline-none focus:ring-2 focus:ring-primary/20',
      },
    },
  })

  // Sync external content changes into the editor (e.g. when loading a post).
  useEffect(() => {
    if (editor && content) {
      const current = JSON.stringify(editor.getJSON())
      const incoming = JSON.stringify(content)
      if (current !== incoming) {
        editor.commands.setContent(content)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, editor])

  const setLink = useCallback(() => {
    if (!editor) return
    const previousUrl = editor.getAttributes('link').href
    setLinkUrl(previousUrl || '')
    setLinkOpen(true)
  }, [editor])

  const confirmLink = useCallback(() => {
    if (!editor) return
    const url = linkUrl.trim()
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
    setLinkOpen(false)
    setLinkUrl('')
  }, [editor, linkUrl])

  const addImage = useCallback(() => {
    if (!editor) return
    // Directly open the MediaPicker — no intermediate dialog needed.
    setMediaPickerOpen(true)
  }, [editor])

  if (!editor) return null

  // Toolbar button helper
  const ToolbarButton = ({
    icon,
    label,
    onClick,
    isActive,
    disabled,
  }: {
    icon: string
    label: string
    onClick: () => void
    isActive?: boolean
    disabled?: boolean
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'flex size-9 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        isActive && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground',
      )}
    >
      <Icon name={icon} size={18} />
    </button>
  )

  return (
    <div className="overflow-hidden rounded-[14px] border border-divider">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-divider bg-surface-secondary p-1.5">
        <ToolbarButton icon="format_bold" label="Bold" onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} />
        <ToolbarButton icon="format_italic" label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} />

        <span className="mx-1 h-5 w-px bg-divider" />

        <ToolbarButton icon="title" label="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} />
        <ToolbarButton icon="format_h2" label="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} />
        <ToolbarButton icon="format_h3" label="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} />

        <span className="mx-1 h-5 w-px bg-divider" />

        <ToolbarButton icon="format_list_bulleted" label="Bullet List" onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} />
        <ToolbarButton icon="format_list_numbered" label="Ordered List" onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} />
        <ToolbarButton icon="format_quote" label="Blockquote" onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} />

        <span className="mx-1 h-5 w-px bg-divider" />

        <ToolbarButton icon="link" label="Add Link" onClick={setLink} isActive={editor.isActive('link')} />
        <ToolbarButton icon="image" label="Add Image" onClick={addImage} />

        <span className="mx-1 h-5 w-px bg-divider" />

        <ToolbarButton icon="undo" label="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} />
        <ToolbarButton icon="redo" label="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} />
      </div>

      {/* Editor surface */}
      <EditorContent editor={editor} />

      {/* Link dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Link</DialogTitle>
            <DialogDescription>Enter the URL for the selected text. Leave empty to remove the link.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmLink() } }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={confirmLink}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Media Picker — selecting an image inserts it directly into the editor */}
      <MediaPicker
        open={mediaPickerOpen}
        onOpenChange={setMediaPickerOpen}
        filter="image"
        onSelected={(path) => {
          if (editor) {
            editor.chain().focus().setImage({ src: path }).run()
          }
        }}
      />
    </div>
  )
}
