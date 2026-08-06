'use client'
import { Icon } from './icon'

export function StarRating({ rating, size = 16, showValue = false, count }: { rating: number; size?: number; showValue?: boolean; count?: number }) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return (
    <div className="inline-flex items-center gap-1">
      <div className="inline-flex items-center">
        {[0, 1, 2, 3, 4].map((i) => {
          const filled = i < full
          const isHalf = i === full && half
          return (
            <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
              <Icon name="star" size={size} className="absolute inset-0 text-border" fill />
              {(filled || isHalf) && (
                <Icon name="star" size={size} className="absolute inset-0 text-warning" fill style={isHalf ? { clipPath: 'inset(0 50% 0 0)' } : undefined} />
              )}
            </span>
          )
        })}
      </div>
      {showValue && <span className="text-sm font-medium text-foreground">{rating.toFixed(1)}</span>}
      {count !== undefined && <span className="text-xs text-muted-foreground">({count})</span>}
    </div>
  )
}
