'use client'
import { useRef, useState } from 'react'
import { Icon } from '@/components/shared/icon'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { apiPost } from '@/hooks/use-api'
import { useT } from '@/hooks/use-t'

interface AvatarUploadProps {
  initialAvatarUrl?: string | null
  name?: string | null
  size?: number
  onUpdated?: (avatarUrl: string | null) => void
}

export function AvatarUpload({ initialAvatarUrl, name, size = 96, onUpdated }: AvatarUploadProps) {
  const { t } = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl || null)
  const [uploading, setUploading] = useState(false)

  const initials = (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2_000_000) {
      toast.error(t('profile.avatarError'))
      return
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.avatarError'))
      return
    }

    setUploading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      try {
        const res = await apiPost('/api/profile/avatar', { image: dataUrl })
        setAvatarUrl(res.avatarUrl)
        onUpdated?.(res.avatarUrl)
        toast.success(t('profile.avatarUploaded'))
      } catch (err: any) {
        toast.error(err.message || t('profile.avatarError'))
      } finally {
        setUploading(false)
      }
    }
    reader.onerror = () => {
      toast.error(t('profile.avatarError'))
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  function handleRemove() {
    setAvatarUrl(null)
    onUpdated?.(null)
    // We don't call the API here since removing the avatar is handled by the profile save
    toast.success(t('profile.avatarRemoved'))
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="group relative" style={{ width: size, height: size }}>
        <div
          className="flex size-full items-center justify-center overflow-hidden rounded-full border-2 border-divider bg-primary/10 font-bold text-primary"
          style={{ fontSize: size * 0.35 }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={name || 'Avatar'} className="size-full object-cover" />
          ) : (
            initials
          )}
        </div>
        {/* Upload overlay */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
          title={t('profile.changeAvatar')}
        >
          {uploading ? (
            <span className="size-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <Icon name="photo_camera" size={size * 0.25} className="text-white" fill />
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
        >
          {avatarUrl ? t('profile.changeAvatar') : t('profile.uploadAvatar')}
        </button>
        {avatarUrl && (
          <>
            <span className="text-muted-foreground">·</span>
            <button
              onClick={handleRemove}
              className="text-xs font-medium text-error hover:underline"
            >
              {t('profile.removeAvatar')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
