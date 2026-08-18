'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icon } from '@/components/shared/icon'
import { translate, type Locale } from '@/lib/i18n'

const TOPICS = [
  { value: 'general', label: 'General Inquiry' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'press', label: 'Press / Media' },
  { value: 'bug', label: 'Bug Report' },
  { value: 'other', label: 'Other' },
]

const PRIORITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
]

/**
 * ContactForm — client-side form that POSTs to /api/tickets.
 *
 * Creates a support ticket in the OPEN state with category 'other' and
 * sends admin notifications via the existing tickets endpoint. The topic
 * select is prefixed to the subject so admins can triage by topic at a
 * glance. Requires an authenticated session (the parent page gates this).
 */
export function ContactForm({ locale = 'en' }: { locale?: Locale }) {
  const t = (k: string, f: string) => translate(locale, k, f)
  const [topic, setTopic] = useState('general')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedSubject = subject.trim()
    const trimmedMessage = message.trim()
    if (!trimmedSubject || !trimmedMessage) return
    if (trimmedMessage.length < 10) {
      toast.error('Message must be at least 10 characters.')
      return
    }
    setSubmitting(true)
    try {
      const topicLabel = TOPICS.find((topicOpt) => topicOpt.value === topic)?.label || 'General'
      const fullSubject = `${topicLabel}: ${trimmedSubject}`.slice(0, 200)
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: fullSubject,
          description: trimmedMessage,
          category: 'other',
          priority,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to submit')
      }
      toast.success('Message sent! We will get back to you within 24 hours.')
      setSubject('')
      setMessage('')
      setTopic('general')
      setPriority('MEDIUM')
    } catch (e: any) {
      toast.error(e.message || 'Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-[24px] border border-divider bg-surface p-6 sm:p-8"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="topic" className="text-sm font-medium">{t('contact.topic', 'Topic')}</Label>
          <Select value={topic} onValueChange={setTopic}>
            <SelectTrigger id="topic" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOPICS.map((tOpt) => (
                <SelectItem key={tOpt.value} value={tOpt.value}>
                  {tOpt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="priority" className="text-sm font-medium">{t('contact.priority', 'Priority')}</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger id="priority" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="subject" className="text-sm font-medium">{t('contact.subject', 'Subject')}</Label>
        <Input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief summary of your inquiry"
          maxLength={150}
          className="h-11"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="message" className="text-sm font-medium">{t('contact.message', 'Message')}</Label>
        <Textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us more about your inquiry (min. 10 characters)…"
          rows={6}
          maxLength={2000}
          required
        />
        <p className="text-right text-[11px] text-muted-foreground">
          {message.length}/2000
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Your message creates a support ticket visible in your dashboard.
        </p>
        <Button type="submit" disabled={submitting || !subject.trim() || !message.trim()} className="gap-1.5">
          {submitting ? (
            <Icon name="progress_activity" size={16} className="animate-spin" />
          ) : (
            <Icon name="send" size={16} />
          )}
          {submitting ? t('contact.sending', 'Sending…') : t('contact.send', 'Send message')}
        </Button>
      </div>
    </form>
  )
}
