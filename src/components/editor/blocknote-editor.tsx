'use client'

import { Component, type ReactNode } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import '@blocknote/core/style.css'
import '@blocknote/react/style.css'
import '@blocknote/mantine/style.css'

class EditorErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; errorMessage: string }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message || 'Unknown error' }
  }
  componentDidCatch(error: Error) {
    console.error('BlockNote editor error:', error)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-divider bg-surface-secondary p-8 text-center">
          <span className="material-symbols-outlined text-muted-foreground">error</span>
          <p className="text-sm font-medium text-foreground">Editor failed to load</p>
          <p className="text-xs text-muted-foreground">{this.state.errorMessage}</p>
        </div>
      )
    }
    return this.props.children
  }
}

function BlockNoteEditorInner({ initialContent, onChange }: { initialContent: any[]; onChange: (b: any[]) => void }) {
  const safeContent = (initialContent && Array.isArray(initialContent) && initialContent.length > 0)
    ? initialContent
    : undefined

  const editor = useCreateBlockNote({
    initialContent: safeContent as any,
  })

  return (
    <div className="blocknote-editor-wrapper min-h-[400px] w-full">
      <BlockNoteView
        editor={editor}
        onChange={() => {
          try { onChange(editor.document as any) } catch (e) { console.error('BlockNote onChange error:', e) }
        }}
        theme="light"
      />
    </div>
  )
}

type BlockNoteEditorProps = {
  initialContent: any[]
  onChange: (blocks: any[]) => void
}

export function BlockNoteEditor({ initialContent, onChange }: BlockNoteEditorProps) {
  return (
    <EditorErrorBoundary>
      <BlockNoteEditorInner initialContent={initialContent || []} onChange={onChange} />
    </EditorErrorBoundary>
  )
}
