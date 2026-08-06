'use client'
import { cn } from '@/lib/utils'

export function Icon({ name, className, fill, size }: { name: string; className?: string; fill?: boolean; size?: number }) {
  return (
    <span
      className={cn('material-symbols-outlined select-none', fill && 'ms-fill', className)}
      style={size ? { fontSize: size, width: size, height: size } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  )
}
