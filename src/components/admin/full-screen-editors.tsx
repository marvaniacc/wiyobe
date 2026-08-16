'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icon } from '@/components/shared/icon'
import { useApp } from '@/stores/app-store'
import { useT } from '@/hooks/use-t'
import { apiPatch, apiPost } from '@/hooks/use-api'
import { toast } from 'sonner'

const BlockNoteEditor = dynamic(
  () => import('@/components/editor/blocknote-editor').then((m) => m.BlockNoteEditor),
  { ssr: false }
)

export function PageEditorFullScreen() {
  const goDashboard = useApp((s) => s.goDashboard)
  const editingPageId = useApp((s) => s.editingPageId)
  const setEditingPageId = useApp((s) => s.setEditingPageId)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [content, setContent] = useState<any>(null)
  const [language, setLanguage] = useState('en')
  const [isPublished, setIsPublished] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editingPageId) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/admin/pages/${editingPageId}`).then(r => r.json()).then((page) => {
      setTitle(page.title || ''); setSlug(page.slug || ''); setContent(page.content || null)
      setLanguage(page.language || 'en'); setIsPublished(page.isPublished || false)
    }).catch(() => toast.error('Failed to load page')).finally(() => setLoading(false))
  }, [editingPageId])

  async function handleSave() {
    if (!title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const payload = { title: title.trim(), slug: slug.trim() || undefined, content, language, isPublished }
      if (editingPageId) { await apiPatch(`/api/admin/pages/${editingPageId}`, payload); toast.success('Page saved') }
      else { const res = await apiPost<any>('/api/admin/pages', payload); setEditingPageId(res.id); toast.success('Page created') }
    } catch (e: any) { toast.error(e.message || 'Failed to save') } finally { setSaving(false) }
  }

  if (loading) return <div className="flex h-full items-center justify-center"><span className="size-8 animate-spin rounded-full border-2 border-primary/40 border-t-primary" /></div>

  return (
    <div className="flex h-screen w-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-divider bg-surface px-4">
        <Button variant="ghost" size="sm" onClick={() => { setEditingPageId(null); goDashboard('custom-pages') }} className="gap-1.5">
          <Icon name="arrow_back" size={16} /> Back to Dashboard
        </Button>
        <div className="flex items-center gap-2">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="h-8 rounded-[8px] border border-divider bg-surface px-2 text-xs font-medium">
            <option value="en">🇬🇧 EN</option><option value="tr">🇹🇷 TR</option><option value="fa">🇮🇷 FA</option><option value="ar">🇸🇦 AR</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="size-4 rounded" /> Published
          </label>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : <Icon name="save" size={16} />} Save
          </Button>
        </div>
      </header>
      <div className="flex gap-2 border-b border-divider bg-surface px-4 py-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Page title" className="h-8 flex-1 text-sm" />
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" className="h-8 w-32 font-mono text-xs" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <BlockNoteEditor key={editingPageId || 'new-page'} initialContent={content} onChange={setContent} />
      </div>
    </div>
  )
}

export function BlogEditorFullScreen() {
  const goDashboard = useApp((s) => s.goDashboard)
  const editingBlogPostId = useApp((s) => s.editingBlogPostId)
  const setEditingBlogPostId = useApp((s) => s.setEditingBlogPostId)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [content, setContent] = useState<any>(null)
  const [coverImage, setCoverImage] = useState('')
  const [language, setLanguage] = useState('en')
  const [isPublished, setIsPublished] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editingBlogPostId) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/admin/blog/${editingBlogPostId}`).then(r => r.json()).then((post) => {
      setTitle(post.title || ''); setSlug(post.slug || ''); setExcerpt(post.excerpt || '')
      setContent(post.content || null); setCoverImage(post.coverImage || '')
      setLanguage(post.language || 'en'); setIsPublished(post.status === 'PUBLISHED')
    }).catch(() => toast.error('Failed to load blog post')).finally(() => setLoading(false))
  }, [editingBlogPostId])

  async function handleSave() {
    if (!title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const payload = { title: title.trim(), slug: slug.trim() || undefined, excerpt: excerpt.trim(), content, coverImage: coverImage || null, language, status: isPublished ? 'PUBLISHED' : 'DRAFT' }
      if (editingBlogPostId) { await apiPatch(`/api/admin/blog/${editingBlogPostId}`, payload); toast.success('Blog post saved') }
      else { const res = await apiPost<any>('/api/admin/blog', payload); setEditingBlogPostId(res.id); toast.success('Blog post created') }
    } catch (e: any) { toast.error(e.message || 'Failed to save') } finally { setSaving(false) }
  }

  if (loading) return <div className="flex h-full items-center justify-center"><span className="size-8 animate-spin rounded-full border-2 border-primary/40 border-t-primary" /></div>

  return (
    <div className="flex h-screen w-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-divider bg-surface px-4">
        <Button variant="ghost" size="sm" onClick={() => { setEditingBlogPostId(null); goDashboard('blog') }} className="gap-1.5">
          <Icon name="arrow_back" size={16} /> Back to Blog
        </Button>
        <div className="flex items-center gap-2">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="h-8 rounded-[8px] border border-divider bg-surface px-2 text-xs font-medium">
            <option value="en">🇬🇧 EN</option><option value="tr">🇹🇷 TR</option><option value="fa">🇮🇷 FA</option><option value="ar">🇸🇦 AR</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="size-4 rounded" /> Published
          </label>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : <Icon name="save" size={16} />} Save
          </Button>
        </div>
      </header>
      <div className="flex flex-col gap-2 border-b border-divider bg-surface px-4 py-2 sm:flex-row sm:items-center">
        <Input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Short excerpt…" className="h-8 flex-1 text-sm" />
        <Input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="Cover image URL" className="h-8 flex-1 text-sm" />
      </div>
      <div className="flex gap-2 border-b border-divider bg-surface px-4 py-2 sm:hidden">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="h-8 text-sm" />
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" className="h-8 w-24 font-mono text-xs" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <BlockNoteEditor key={editingBlogPostId || 'new-post'} initialContent={content} onChange={setContent} />
      </div>
    </div>
  )
}
