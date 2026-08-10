'use client'
import { Icon } from '@/components/shared/icon'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/money'

/* -------------------------------------------------------------------------
 * Trip Tracker — visual booking timeline
 *
 * A responsive horizontal stepper (vertical stack on mobile) that shows the
 * patient which stage their booking is at:
 *   1. Request Sent     (PENDING)
 *   2. Confirmed        (CONFIRMED)
 *   3. Appointment Day  (startDate reached)
 *   4. Completed        (COMPLETED)
 *
 * CANCELLED and NO_SHOW render a distinct error state instead.
 * ----------------------------------------------------------------------- */

export type TrackerBookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'REFUNDED'

export interface TrackerBooking {
  id: string
  status: TrackerBookingStatus
  startDate: string
  endDate?: string | null
  createdAt: string
  cancelledAt?: string | null
}

type Stage = {
  /** i18n key for the stage label */
  labelKey: string
  /** Material Symbol name */
  icon: string
  /** The booking statuses in which this stage is considered "done" */
  doneWhen: TrackerBookingStatus[]
  /** The booking statuses in which this stage is the "current" one */
  currentWhen: TrackerBookingStatus[]
  /** Whether the appointment-date stage should also activate when startDate has passed */
  dateReached?: boolean
}

const STAGES: Stage[] = [
  {
    labelKey: 'tracker.requestSent',
    icon: 'send',
    doneWhen: ['CONFIRMED', 'COMPLETED'],
    currentWhen: ['PENDING'],
  },
  {
    labelKey: 'tracker.confirmed',
    icon: 'verified',
    doneWhen: ['COMPLETED'],
    currentWhen: ['CONFIRMED'],
  },
  {
    labelKey: 'tracker.appointmentDay',
    icon: 'event_available',
    doneWhen: ['COMPLETED'],
    currentWhen: ['CONFIRMED'],
    dateReached: true,
  },
  {
    labelKey: 'tracker.completed',
    icon: 'task_alt',
    doneWhen: [],
    currentWhen: ['COMPLETED'],
  },
]

/** Whether the appointment start date has passed (used for stage 3). */
function isDateReached(booking: TrackerBooking): boolean {
  return new Date(booking.startDate).getTime() <= Date.now()
}

/** Resolve the state of a single stage for a given booking. */
function resolveStageState(stage: Stage, booking: TrackerBooking): 'done' | 'current' | 'upcoming' {
  if (stage.doneWhen.includes(booking.status)) return 'done'
  if (stage.currentWhen.includes(booking.status)) {
    // Special case: the "Appointment Day" stage is "current" only once the
    // date has actually arrived (for CONFIRMED bookings). Before that, the
    // "Confirmed" stage remains current.
    if (stage.dateReached && !isDateReached(booking)) return 'upcoming'
    return 'current'
  }
  return 'upcoming'
}

/**
 * Full 4-stage Trip Tracker for a single booking. Used in the Booking
 * Detail dialog. Responsive: horizontal on sm+ screens, vertical on mobile.
 */
export function TripTracker({ booking }: { booking: TrackerBooking }) {
  const { t, locale } = useT()

  // Error states replace the whole stepper with a single red marker.
  if (booking.status === 'CANCELLED' || booking.status === 'NO_SHOW' || booking.status === 'REFUNDED') {
    const errorKey =
      booking.status === 'CANCELLED' ? 'tracker.cancelled'
      : booking.status === 'NO_SHOW' ? 'tracker.noShow'
      : 'tracker.cancelled'
    const errorDate =
      booking.status === 'CANCELLED' ? booking.cancelledAt
      : booking.status === 'NO_SHOW' ? booking.startDate
      : booking.endDate
    return (
      <div className="rounded-[14px] border border-error/20 bg-error/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-error/10 text-error">
            <Icon name={booking.status === 'NO_SHOW' ? 'person_off' : 'event_busy'} size={20} fill />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-error">{t(errorKey)}</p>
            {errorDate && (
              <p className="text-xs text-muted-foreground">{formatDateTime(errorDate, locale)}</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[14px] border border-divider bg-surface-secondary/40 p-4 sm:p-5">
      {/* Stage label header */}
      <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('tracker.title', 'Trip Progress')}
      </p>

      {/* Horizontal stepper (sm+) */}
      <div className="hidden sm:block">
        <div className="relative flex items-start justify-between">
          {STAGES.map((stage, i) => {
            const state = resolveStageState(stage, booking)
            return (
              <div key={stage.labelKey} className="relative flex flex-1 flex-col items-center">
                {/* Connecting line to the next node */}
                {i < STAGES.length - 1 && (
                  <div className="absolute left-1/2 top-5 h-0.5 w-full" aria-hidden>
                    <div className={cn('h-full w-full transition-colors', state === 'done' ? 'bg-primary' : 'bg-divider')} />
                  </div>
                )}
                {/* Node */}
                <div
                  className={cn(
                    'relative z-10 flex size-10 items-center justify-center rounded-full border-2 transition-all',
                    state === 'done' && 'border-primary bg-primary text-primary-foreground',
                    state === 'current' && 'border-primary bg-surface text-primary shadow-[0_0_0_4px_var(--color-primary-15,rgba(26,115,232,0.15))]',
                    state === 'upcoming' && 'border-divider bg-surface text-muted-foreground',
                  )}
                >
                  {state === 'done' ? (
                    <Icon name="check" size={18} fill />
                  ) : (
                    <Icon name={stage.icon} size={18} fill={state === 'current'} />
                  )}
                  {state === 'current' && (
                    <span className="absolute -right-0.5 -top-0.5 flex size-3">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                      <span className="relative inline-flex size-3 rounded-full bg-primary" />
                    </span>
                  )}
                </div>
                {/* Label */}
                <div className="mt-2.5 max-w-[100px] text-center">
                  <p
                    className={cn(
                      'text-xs font-medium leading-tight',
                      state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground',
                    )}
                  >
                    {t(stage.labelKey)}
                  </p>
                  {state === 'current' && stage.dateReached && (
                    <p className="mt-0.5 text-[10px] text-primary">{t('tracker.today', 'Today')}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Vertical stepper (mobile) */}
      <div className="flex flex-col gap-0 sm:hidden">
        {STAGES.map((stage, i) => {
          const state = resolveStageState(stage, booking)
          return (
            <div key={stage.labelKey} className="flex gap-3">
              {/* Node + connector column */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full border-2 transition-all',
                    state === 'done' && 'border-primary bg-primary text-primary-foreground',
                    state === 'current' && 'border-primary bg-surface text-primary',
                    state === 'upcoming' && 'border-divider bg-surface text-muted-foreground',
                  )}
                >
                  {state === 'done' ? (
                    <Icon name="check" size={14} fill />
                  ) : (
                    <Icon name={stage.icon} size={14} fill={state === 'current'} />
                  )}
                </div>
                {i < STAGES.length - 1 && (
                  <div className={cn('my-1 w-0.5 flex-1 min-h-6', state === 'done' ? 'bg-primary' : 'bg-divider')} aria-hidden />
                )}
              </div>
              {/* Label column */}
              <div className={cn('pb-4 pt-1', i < STAGES.length - 1 && 'min-h-12')}>
                <p
                  className={cn(
                    'text-sm font-medium',
                    state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  {t(stage.labelKey)}
                </p>
                {state === 'current' && stage.dateReached && (
                  <p className="text-xs text-primary">{t('tracker.today', 'Today')}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------
 * ItineraryTripTracker — simplified 3-stage timeline for booked itineraries
 *
 *   1. Trip Booked   (BOOKED status, no bookings completed yet)
 *   2. In Progress   (some bookings completed, some still upcoming)
 *   3. Completed     (all bookings completed)
 * ----------------------------------------------------------------------- */

export interface ItineraryTrackerBooking {
  id: string
  status: string
  startDate: string
}

export function ItineraryTripTracker({ bookings }: { bookings: ItineraryTrackerBooking[] }) {
  const { t } = useT()

  const total = bookings.length
  const completedCount = bookings.filter((b) => b.status === 'COMPLETED').length
  const anyOngoing = bookings.some((b) => b.status === 'CONFIRMED' || b.status === 'PENDING')
  const allDone = total > 0 && completedCount === total

  // Determine the current stage
  let currentStage = 0 // Trip Booked
  if (allDone) currentStage = 2 // Completed
  else if (completedCount > 0 || anyOngoing) currentStage = 1 // In Progress

  const stages = [
    { labelKey: 'tracker.itineraryBooked', icon: 'luggage' },
    { labelKey: 'tracker.itineraryInProgress', icon: 'route' },
    { labelKey: 'tracker.itineraryCompleted', icon: 'task_alt' },
  ]

  return (
    <div className="rounded-[12px] border border-divider bg-surface-secondary/40 p-3">
      <div className="hidden sm:flex sm:items-start sm:justify-between">
        {stages.map((stage, i) => {
          const state: 'done' | 'current' | 'upcoming' =
            i < currentStage ? 'done' : i === currentStage ? 'current' : 'upcoming'
          return (
            <div key={stage.labelKey} className="relative flex flex-1 flex-col items-center">
              {i < stages.length - 1 && (
                <div className="absolute left-1/2 top-4 h-0.5 w-full" aria-hidden>
                  <div className={cn('h-full w-full', state === 'done' ? 'bg-success' : 'bg-divider')} />
                </div>
              )}
              <div
                className={cn(
                  'relative z-10 flex size-8 items-center justify-center rounded-full border-2 transition-all',
                  state === 'done' && 'border-success bg-success text-success-foreground',
                  state === 'current' && 'border-success bg-surface text-success',
                  state === 'upcoming' && 'border-divider bg-surface text-muted-foreground',
                )}
              >
                {state === 'done' ? (
                  <Icon name="check" size={14} fill />
                ) : (
                  <Icon name={stage.icon} size={14} fill={state === 'current'} />
                )}
              </div>
              <p
                className={cn(
                  'mt-2 max-w-[90px] text-center text-[11px] font-medium leading-tight',
                  state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground',
                )}
              >
                {t(stage.labelKey)}
              </p>
            </div>
          )
        })}
      </div>

      {/* Mobile: horizontal row of compact nodes */}
      <div className="flex items-center gap-2 sm:hidden">
        {stages.map((stage, i) => {
          const state: 'done' | 'current' | 'upcoming' =
            i < currentStage ? 'done' : i === currentStage ? 'current' : 'upcoming'
          return (
            <div key={stage.labelKey} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border-2',
                  state === 'done' && 'border-success bg-success text-success-foreground',
                  state === 'current' && 'border-success bg-surface text-success',
                  state === 'upcoming' && 'border-divider bg-surface text-muted-foreground',
                )}
              >
                {state === 'done' ? <Icon name="check" size={12} fill /> : <Icon name={stage.icon} size={12} fill={state === 'current'} />}
              </div>
              <p className={cn('text-[9px] font-medium leading-tight text-center', state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground')}>
                {t(stage.labelKey)}
              </p>
            </div>
          )
        })}
      </div>

      {/* Progress text */}
      {total > 0 && (
        <p className="mt-2.5 text-center text-[11px] text-muted-foreground">
          {completedCount} / {total} {t('tracker.bookingsCompleted', 'bookings completed')}
        </p>
      )}
    </div>
  )
}
