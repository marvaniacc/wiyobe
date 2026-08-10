'use client'

import { useState } from 'react'
import { useT } from '@/hooks/use-t'
import { useApi, apiPost } from '@/hooks/use-api'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/shared/icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDate } from '@/lib/money'
import { toast } from 'sonner'
import { ItineraryBuilder } from './itinerary-builder'

interface ItineraryItem {
  id: string
  providerType: string
  providerId: string
  serviceId: string | null
  estimatedCost: number
  notes: string | null
  createdAt: string
}

interface Itinerary {
  id: string
  patientId: string
  status: string
  isAiGenerated: boolean
  totalEstimatedCost: number
  createdAt: string
  updatedAt: string
  items: ItineraryItem[]
  bookings: { id: string; status: string; providerType: string; startDate: string }[]
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-warning/10 text-warning border-warning/20', icon: 'edit_note' },
  PENDING_BOOKING: { label: 'Pending', cls: 'bg-info/10 text-info border-info/20', icon: 'pending' },
  BOOKED: { label: 'Booked', cls: 'bg-success/10 text-success border-success/20', icon: 'check_circle' },
  EXPIRED: { label: 'Expired', cls: 'bg-muted text-muted-foreground border-divider', icon: 'schedule' },
}

const PROVIDER_ICON: Record<string, string> = {
  DOCTOR: 'medical_services',
  HOSPITAL: 'local_hospital',
  HOTEL: 'hotel',
  TRANSLATOR: 'translate',
}

export function ItinerariesSection() {
  const { t, locale } = useT()
  const [showBuilder, setShowBuilder] = useState(false)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const { data, loading, error, refetch } = useApi<{ itineraries: Itinerary[] }>('/api/itineraries')

  if (showBuilder) {
    return <ItineraryBuilder onCreated={() => { setShowBuilder(false); refetch() }} />
  }

  const itineraries = data?.itineraries || []

  async function bookItinerary(id: string) {
    setBookingId(id)
    try {
      const res = await apiPost(`/api/itineraries/${id}/book`, {})
      toast.success(`Trip booked! ${res.bookingIds?.length || 0} booking(s) created. Total: $${res.totalAmount}`)
      refetch()
    } catch (e: any) {
      if (e.message?.includes('409') || e.message?.includes('slot') || e.message?.includes('Conflict')) {
        toast.error('One of the requested slots is no longer available. Please try again.')
      } else {
        toast.error(e.message || 'Failed to book trip')
      }
    } finally {
      setBookingId(null)
    }
  }

  async function deleteItinerary(id: string) {
    try {
      await apiPost(`/api/itineraries/${id}`, {})
      toast.success('Draft deleted')
      refetch()
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Trips</h1>
          <p className="text-sm text-muted-foreground">Build and book complete medical packages</p>
        </div>
        <Button onClick={() => setShowBuilder(true)} className="gap-2">
          <Icon name="add" size={18} />
          <span className="hidden sm:inline">New Trip</span>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-[16px]" />
          ))}
        </div>
      ) : error ? (
        <Card><CardContent className="p-8 text-center text-error">{error}</CardContent></Card>
      ) : itineraries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon name="luggage" size={32} fill />
            </div>
            <div>
              <p className="text-base font-medium text-foreground">No trips yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Build your first medical trip package with a doctor, hotel, and translator.</p>
            </div>
            <Button onClick={() => setShowBuilder(true)} className="gap-2">
              <Icon name="add" size={18} />
              Build a Trip
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {itineraries.map((itin) => {
            const statusCfg = STATUS_CONFIG[itin.status] || STATUS_CONFIG.DRAFT
            const totalDollars = (itin.totalEstimatedCost / 100).toFixed(2)
            const isBooking = bookingId === itin.id

            return (
              <Card key={itin.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">Trip Package</CardTitle>
                      <Badge variant="outline" className={cn('rounded-full border', statusCfg.cls)}>
                        <Icon name={statusCfg.icon} size={12} fill />
                        {statusCfg.label}
                      </Badge>
                      {itin.isAiGenerated && (
                        <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 text-primary text-[10px]">
                          <Icon name="auto_awesome" size={10} fill />
                          AI
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(itin.createdAt, locale)}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Items timeline */}
                  <div className="space-y-2">
                    {itin.items.map((item, i) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-[12px] bg-surface-secondary/60 p-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Icon name={PROVIDER_ICON[item.providerType] || 'person'} size={18} fill />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{item.providerType}</p>
                          {item.notes && <p className="truncate text-xs text-muted-foreground">{item.notes}</p>}
                        </div>
                        <span className="text-sm font-semibold text-foreground">
                          {formatCurrency((item.estimatedCost / 100).toFixed(2), 'USD', locale)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  {/* Total + actions */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Total estimated cost</p>
                      <p className="text-xl font-bold text-primary">{formatCurrency(totalDollars, 'USD', locale)}</p>
                    </div>
                    <div className="flex gap-2">
                      {itin.status === 'DRAFT' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-error hover:bg-error/5"
                            onClick={() => deleteItinerary(itin.id)}
                          >
                            <Icon name="delete" size={14} />
                            <span className="hidden sm:inline">Delete</span>
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => bookItinerary(itin.id)}
                            disabled={isBooking}
                          >
                            {isBooking ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="luggage" size={14} fill />}
                            Book Entire Trip
                          </Button>
                        </>
                      )}
                      {itin.status === 'BOOKED' && itin.bookings.length > 0 && (
                        <Badge variant="outline" className="rounded-full border-success/20 bg-success/5 text-success">
                          <Icon name="check_circle" size={12} fill />
                          {itin.bookings.length} bookings created
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Linked bookings */}
                  {itin.status === 'BOOKED' && itin.bookings.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {itin.bookings.map((b) => (
                        <Badge key={b.id} variant="outline" className="rounded-full border-divider text-xs">
                          <Icon name={PROVIDER_ICON[b.providerType] || 'person'} size={10} fill />
                          {b.providerType} · {b.status}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
