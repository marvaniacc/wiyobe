import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'
import { unlink } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'

type ModelType = 'blogPost' | 'customPage' | 'mediaAsset' | 'medicalDocument'

const MODEL_TYPES: ModelType[] = ['blogPost', 'customPage', 'mediaAsset', 'medicalDocument']

/**
 * GET /api/admin/recycle-bin
 *
 * Admin only. Returns all soft-deleted items (deletedAt IS NOT NULL) grouped
 * by model type. Items older than 30 days are excluded (they should be
 * permanently purged by a cron job, but we also filter here for safety).
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [blogPosts, customPages, mediaAssets, medicalDocuments] = await Promise.all([
      db.blogPost.findMany({
        where: { deletedAt: { not: null, gte: thirtyDaysAgo } },
        select: { id: true, title: true, slug: true, deletedAt: true, updatedAt: true },
        orderBy: { deletedAt: 'desc' },
      }),
      db.customPage.findMany({
        where: { deletedAt: { not: null, gte: thirtyDaysAgo } },
        select: { id: true, title: true, slug: true, deletedAt: true, updatedAt: true },
        orderBy: { deletedAt: 'desc' },
      }),
      db.mediaAsset.findMany({
        where: { deletedAt: { not: null, gte: thirtyDaysAgo } },
        select: { id: true, fileName: true, filePath: true, mimeType: true, deletedAt: true, uploaderId: true },
        orderBy: { deletedAt: 'desc' },
      }),
      db.medicalDocument.findMany({
        where: { deletedAt: { not: null, gte: thirtyDaysAgo } },
        select: { id: true, fileName: true, fileType: true, category: true, deletedAt: true, patientId: true },
        orderBy: { deletedAt: 'desc' },
      }),
    ])

    return json({
      items: {
        blogPosts,
        customPages,
        mediaAssets,
        medicalDocuments,
      },
    })
  } catch (e) { return handleError(e) }
}

const restoreSchema = z.object({
  modelType: z.enum(MODEL_TYPES as [string, ...string[]]),
  id: z.string(),
})

/**
 * PATCH /api/admin/recycle-bin
 *
 * Admin only. Restores a soft-deleted item by setting deletedAt back to null.
 */
export async function PATCH(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const body = await parseBody(req, restoreSchema)
    const { modelType, id } = body as { modelType: ModelType; id: string }

    switch (modelType) {
      case 'blogPost':
        await db.blogPost.update({ where: { id }, data: { deletedAt: null } })
        break
      case 'customPage':
        await db.customPage.update({ where: { id }, data: { deletedAt: null } })
        break
      case 'mediaAsset':
        await db.mediaAsset.update({ where: { id }, data: { deletedAt: null } })
        break
      case 'medicalDocument':
        await db.medicalDocument.update({ where: { id }, data: { deletedAt: null } })
        break
      default:
        return error(400, 'Invalid model type')
    }

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}

const deleteSchema = z.object({
  modelType: z.enum(MODEL_TYPES as [string, ...string[]]),
  id: z.string(),
})

/**
 * DELETE /api/admin/recycle-bin
 *
 * Admin only. Permanently deletes a soft-deleted item from the database.
 * For MediaAssets, also removes the file from the hard disk.
 */
export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const { searchParams } = new URL(req.url)
    const modelType = searchParams.get('modelType') as ModelType | null
    const id = searchParams.get('id')
    if (!modelType || !id) return error(400, 'modelType and id required')
    if (!MODEL_TYPES.includes(modelType)) return error(400, 'Invalid model type')

    switch (modelType) {
      case 'blogPost':
        await db.blogPost.delete({ where: { id } })
        break
      case 'customPage':
        await db.customPage.delete({ where: { id } })
        break
      case 'mediaAsset': {
        // Get the file path before deleting the DB record
        const asset = await db.mediaAsset.findUnique({ where: { id }, select: { filePath: true } })
        await db.mediaAsset.delete({ where: { id } })
        // Remove the file from disk (gracefully handle ENOENT)
        if (asset?.filePath) {
          const fullPath = path.join(process.cwd(), 'public', asset.filePath)
          try {
            await unlink(fullPath)
          } catch (fsErr: any) {
            if (fsErr.code !== 'ENOENT') console.error('[recycle-bin] Failed to delete file:', fsErr)
          }
        }
        break
      }
      case 'medicalDocument':
        await db.medicalDocument.delete({ where: { id } })
        break
    }

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
