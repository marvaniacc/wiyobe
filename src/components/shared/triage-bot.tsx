'use client'
import { useState } from 'react'
import { Icon } from '@/components/shared/icon'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import Link from 'next/link'

/* -------------------------------------------------------------------------
 * TriageBot — AI symptom checker as a floating popup
 *
 * Renders as a Floating Action Button (FAB) in the bottom corner.
 * Clicking opens a Dialog with the symptom checker interface.
 * Only rendered on public pages (not the dashboard).
 * ----------------------------------------------------------------------- */

type TriageResponse = {
  specialty: string
  reasoning: string
  suggestedCountries: string[]
}

const SUGGESTED_SYMPTOMS = [
  'Chest pain and shortness of breath',
  'Knee pain when walking up stairs',
  'Toothache and sensitive teeth',
  'Persistent headaches and dizziness',
  'Skin rash that won\'t go away',
]

function TriageBotContent() {
  const { t } = useT()
  const [symptoms, setSymptoms] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TriageResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAnalyze() {
    if (!symptoms.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/ai/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms: symptoms.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setResult(data)
    } catch (e: any) {
      setError(e.message || t('ai.error', 'Something went wrong. Please try again.'))
      toast.error(e.message || t('ai.error', 'Something went wrong.'))
    } finally {
      setLoading(false)
    }
  }

  function handleQuickSymptom(s: string) {
    setSymptoms(s)
    setResult(null)
    setError(null)
  }

  return (
    <div className="space-y-3">
      {/* Symptoms input */}
      <div className="space-y-2">
        <Textarea
          placeholder={t('ai.enterSymptoms', 'Describe your symptoms here… e.g., I have lower back pain that radiates to my left leg')}
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          rows={3}
          maxLength={2000}
          disabled={loading}
          className="resize-none"
        />
        {!result && !loading && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_SYMPTOMS.slice(0, 3).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleQuickSymptom(s)}
                className="rounded-full border border-divider px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <Button onClick={handleAnalyze} disabled={!symptoms.trim() || loading} className="w-full gap-2">
        {loading ? (
          <>
            <Icon name="progress_activity" size={16} className="animate-spin" />
            {t('ai.thinking', 'AI is analyzing…')}
          </>
        ) : (
          <>
            <Icon name="auto_awesome" size={16} />
            {t('ai.analyze', 'Analyze Symptoms')}
          </>
        )}
      </Button>

      {error && (
        <div className="flex items-start gap-2 rounded-[10px] border border-error/20 bg-error/5 p-3">
          <Icon name="error" size={16} className="mt-0.5 shrink-0 text-error" />
          <p className="text-xs text-error">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-3 rounded-[12px] border border-primary/20 bg-primary/[0.02] p-4">
          <div className="flex items-start gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
              <Icon name="medical_services" size={16} fill />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('ai.specialty', 'Recommended Specialty')}</p>
              <p className="text-sm font-semibold text-foreground">{result.specialty}</p>
            </div>
          </div>

          {result.reasoning && (
            <div className="flex items-start gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-info/10 text-info">
                <Icon name="lightbulb" size={16} fill />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('ai.reasoning', 'Reasoning')}</p>
                <p className="text-xs text-muted-foreground">{result.reasoning}</p>
              </div>
            </div>
          )}

          {result.suggestedCountries.length > 0 && (
            <div className="flex items-start gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-success/10 text-success">
                <Icon name="public" size={16} fill />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('ai.suggestedCountries', 'Suggested Countries')}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {result.suggestedCountries.map((c, i) => (
                    <span key={i} className="rounded-full border border-divider bg-surface px-2.5 py-0.5 text-xs text-muted-foreground">{c}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <Link href="/dashboard">
            <Button variant="default" className="w-full gap-2">
              <Icon name="search" size={16} />
              {t('ai.findDoctors', 'Find')} {result.specialty} {t('ai.doctors', 'Doctors')}
            </Button>
          </Link>
        </div>
      )}

      <p className="text-center text-[10px] text-muted-foreground/60">
        {t('ai.disclaimer', 'This is not a medical diagnosis. Always consult a qualified healthcare professional.')}
      </p>
    </div>
  )
}

/**
 * Floating TriageBot — renders a FAB button in the bottom corner.
 * Clicking opens a Dialog with the symptom checker.
 * Only use on public pages (not inside the dashboard SPA).
 */
export function TriageBot() {
  const { t } = useT()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 end-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:bg-primary/90"
        aria-label={t('ai.triageTitle', 'AI Symptom Checker')}
        title={t('ai.triageTitle', 'AI Symptom Checker')}
      >
        <Icon name="smart_toy" size={28} fill />
        {/* Pulse ring */}
        <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-20" />
      </button>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
                <Icon name="smart_toy" size={18} fill />
              </div>
              {t('ai.triageTitle', 'AI Symptom Checker')}
            </DialogTitle>
          </DialogHeader>
          <TriageBotContent />
        </DialogContent>
      </Dialog>
    </>
  )
}
