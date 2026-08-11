import { db } from '@/lib/db'

/**
 * Notification categories — used for filtering and icon/color mapping in the UI.
 */
export type NotificationCategory =
  | 'BOOKING'
  | 'KYC'
  | 'CHAT'
  | 'SYSTEM'
  | 'ANNOUNCEMENT'
  | 'PAYOUT'
  | 'REVIEW'
  | 'MEDICAL'
  | 'PROMO'

/**
 * Centralized notification sender.
 *
 * Creates a Notification record in the DB with the new category + metadata
 * fields, while also populating the legacy `type`, `read`, and `meta` fields
 * for backward compatibility with existing code.
 *
 * Errors are caught and logged — notification failures should NEVER break
 * the calling flow (e.g. a booking should still succeed even if the
 * notification email/DB write fails).
 */
export async function sendNotification(opts: {
  userId: string
  title: string
  message: string
  category?: NotificationCategory
  /** Legacy type string (e.g. "booking_created") — used for icon mapping. */
  type?: string
  /** Dashboard section to navigate to when clicked. */
  link?: string
  /** Structured extra data, stored as JSON. */
  metadata?: Record<string, any>
}): Promise<void> {
  try {
    const category = opts.category || 'SYSTEM'
    const type = opts.type || category.toLowerCase()
    const metadata = opts.metadata || null

    await db.notification.create({
      data: {
        userId: opts.userId,
        type,
        category,
        title: opts.title,
        body: opts.message,
        link: opts.link,
        metadata: metadata as any,
        // Legacy fields for backward compat
        meta: metadata ? JSON.stringify(metadata) : null,
        isRead: false,
        read: false,
      },
    })
  } catch (err) {
    // Log but never throw — notifications are best-effort
    console.error('[notify] Failed to send notification:', err)
  }
}

/**
 * Legacy alias — existing code calls `notify(...)`. Delegates to
 * sendNotification with the new field names.
 */
export async function notify(opts: {
  userId: string
  type: string
  title: string
  body: string
  link?: string
  meta?: Record<string, any>
}) {
  // Map legacy type to a category if possible
  const typeToCategory: Record<string, NotificationCategory> = {
    booking_created: 'BOOKING',
    booking_accepted: 'BOOKING',
    booking_declined: 'BOOKING',
    booking_cancelled: 'BOOKING',
    booking_completed: 'BOOKING',
    booking_no_show: 'BOOKING',
    chat_message: 'CHAT',
    payout_sent: 'PAYOUT',
    review_received: 'REVIEW',
    kyc_approved: 'KYC',
    kyc_rejected: 'KYC',
    system: 'SYSTEM',
  }
  const category = typeToCategory[opts.type] || 'SYSTEM'

  await sendNotification({
    userId: opts.userId,
    title: opts.title,
    message: opts.body,
    category,
    type: opts.type,
    link: opts.link,
    metadata: opts.meta,
  })
}
