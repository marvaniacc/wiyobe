'use client'
import { useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface OtpInputProps {
  length?: number
  value: string
  onChange: (val: string) => void
  onComplete?: (val: string) => void
  disabled?: boolean
  error?: boolean
}

export function OtpInput({ length = 6, value, onChange, onComplete, disabled, error }: OtpInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])
  // Derive display chars directly from the external value — no useEffect sync needed.
  const chars = value.split('').slice(0, length)
  const local = Array.from({ length }, (_, i) => chars[i] || '')

  const setChar = useCallback((i: number, char: string) => {
    const digit = char.replace(/\D/g, '').slice(-1)
    const next = [...local]
    next[i] = digit
    const joined = next.join('')
    onChange(joined)
    if (joined.length === length && !next.includes('')) {
      onComplete?.(joined)
    }
  }, [local, length, onChange, onComplete])

  function handleChange(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    // handle paste of full code
    if (val.length > 1) {
      const digits = val.replace(/\D/g, '').slice(0, length).split('')
      const next = Array(length).fill('')
      digits.forEach((d, idx) => { next[idx] = d })
      const joined = next.join('')
      onChange(joined)
      if (joined.length === length && !next.includes('')) onComplete?.(joined)
      const focusIdx = Math.min(digits.length, length - 1)
      inputsRef.current[focusIdx]?.focus()
      return
    }
    setChar(i, val)
    if (val && i < length - 1) {
      inputsRef.current[i + 1]?.focus()
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (local[i]) {
        setChar(i, '')
      } else if (i > 0) {
        inputsRef.current[i - 1]?.focus()
        setChar(i - 1, '')
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      inputsRef.current[i - 1]?.focus()
    } else if (e.key === 'ArrowRight' && i < length - 1) {
      inputsRef.current[i + 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    const next = Array(length).fill('')
    pasted.split('').forEach((d, idx) => { next[idx] = d })
    const joined = next.join('')
    onChange(joined)
    if (joined.length === length) onComplete?.(joined)
    const focusIdx = Math.min(pasted.length, length - 1)
    inputsRef.current[focusIdx]?.focus()
  }

  return (
    <div className="flex justify-center gap-2 sm:gap-2.5" onPaste={handlePaste} dir="ltr">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputsRef.current[i] = el }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={local[i]}
          disabled={disabled}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          className={cn(
            'flex size-12 items-center justify-center rounded-[14px] border bg-surface text-center text-xl font-semibold text-foreground shadow-xs outline-none transition-all sm:size-14 sm:text-2xl',
            'focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20',
            error
              ? 'border-error bg-error/5'
              : local[i]
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/40',
            disabled && 'opacity-50',
          )}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  )
}
