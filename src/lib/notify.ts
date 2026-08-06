import { db } from '@/lib/db'

// Create a notification for a user
export async function notify(opts: {
  userId: string
  type: string
  title: string
  body: string
  link?: string
  meta?: Record<string, any>
}) {
  return db.notification.create({
    data: {
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      link: opts.link,
      meta: opts.meta ? JSON.stringify(opts.meta) : null,
    },
  })
}
