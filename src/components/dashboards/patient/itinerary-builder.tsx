'use client'

import { useState, useMemo } from 'react'
import { useT } from '@/hooks/use-t'
import { useApi, apiPost } from '@/hooks/use-api'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/shared/icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '@/lib/money'
import { toast } from 'sonner'
import { useApp } from '@/stores/app-store'

interface Provider {
  id: string
  name: string | null
  specialty?: string | null
  city: string | null
  country: string | null
  providerType: string
  consultationFee?: string | null
  pricePerNight?: string | null
  hourlyRate?: string | null
  rating: number
  reviewCount: number
  verified: boolean
  avatarUrl?: string | null
}

interface Service {
  id: string
  name: string
  price: string
  durationMinutes: number | null
}

interface CartItem {
  providerType: 'DOCTOR' | 'HOSPITAL' | 'HOTEL' | 'TRANSLATOR'
  providerId: string
  providerName: string
  serviceId?: string
  serviceName?: string
  estimatedCost: number // cents
}

const PROVIDER_TYPES = [
  { type: 'DOCTOR' as const, icon: 'medical_services', label: 'Doctor', desc: 'Select a doctor for your consultation' },
  { type: 'HOTEL' as const, icon: 'hotel', label: 'Hotel / Recovery', desc: 'Select accommodation for your stay' },
  { type: 'TRANSLATOR' as const, icon: 'translate', label: 'Translator', desc: 'Select a translator if needed' },
]

export function ItineraryBuilder({ onCreated }: { onCreated: () => void }) {
  const { t, locale } = useT()
  const goDashboard = useApp((s) => s.goDashboard)
  const [cart, setCart] = useState<CartItem[]>([])
  const [activeType, setActiveType] = useState<'DOCTOR' | 'HOTEL' | 'TRANSLATOR'>('DOCTOR')
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [saving, setSaving] = useState(false)

  const { data: providersData, loading } = useApi<{ providers: Provider[] }>(
    `/api/providers?type=${activeType}`
  )

  const { data: servicesData } = useApi<{ services: Service[] }>(
    selectedProvider ? `/api/providers/services?providerId=${selectedProvider.id}&providerType=${activeType}` : null
  )

  const providers = providersData?.providers || []
  const services = servicesData?.services || []

  const totalCostCents = useMemo(() => cart.reduce((sum, item) => sum + item.estimatedCost, 0), [cart])
  const totalCostDollars = (totalCostCents / 100).toFixed(2)

  function selectProvider(p: Provider) {
    setSelectedProvider(p)
    setSelectedService(null)
  }

  function addToCart() {
    if (!selectedProvider) return
    const cost = selectedService
      ? Math.round(parseFloat(selectedService.price) * 100)
      : selectedProvider.providerType === 'DOCTOR'
        ? Math.round(parseFloat(selectedProvider.consultationFee || '0') * 100)
        : selectedProvider.providerType === 'HOTEL'
          ? Math.round(parseFloat(selectedProvider.pricePerNight || '0') * 100)
          : Math.round(parseFloat(selectedProvider.hourlyRate || '0') * 100)

    // Remove existing item of same type (replace)
    const filtered = cart.filter((c) => c.providerType !== activeType)
    filtered.push({
      providerType: activeType,
      providerId: selectedProvider.id,
      providerName: selectedProvider.name || 'Unknown',
      serviceId: selectedService?.id,
      serviceName: selectedService?.name,
      estimatedCost: cost,
    })
    setCart(filtered)
    setSelectedProvider(null)
    setSelectedService(null)
    toast.success(`${activeType.toLowerCase()} added to trip`)
  }

  function removeFromCart(type: string) {
    setCart(cart.filter((c) => c.providerType !== type))
  }

  async function saveDraft() {
    if (cart.length === 0) {
      toast.error('Add at least one service to your trip')
      return
    }
    setSaving(true)
    try {
      const items = cart.map((c) => ({
        providerType: c.providerType,
        providerId: c.providerId,
        serviceId: c.serviceId,
        estimatedCost: c.estimatedCost,
      }))
      await apiPost('/api/itineraries', { items })
      toast.success('Draft itinerary saved')
      setCart([])
      onCreated()
    } catch (e: any) {
      toast.error(e.message || 'Failed to save draft')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Build Your Medical Trip</h2>
          <p className="text-sm text-muted-foreground">Select a doctor, hotel, and translator for your complete medical package</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => goDashboard('itineraries')}>Back to list</Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Provider selection */}
        <div className="lg:col-span-2 space-y-4">
          {/* Provider type tabs */}
          <div className="flex gap-2">
            {PROVIDER_TYPES.map((pt) => (
              <Button
                key={pt.type}
                variant={activeType === pt.type ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => { setActiveType(pt.type); setSelectedProvider(null); setSelectedService(null) }}
              >
                <Icon name={pt.icon} size={16} fill={activeType === pt.type} />
                {pt.label}
              </Button>
            ))}
          </div>

          {/* Provider list */}
          {loading ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              <Icon name="progress_activity" size={24} className="mx-auto animate-spin" />
            </CardContent></Card>
          ) : providers.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              No {activeType.toLowerCase()}s available
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {providers.map((p) => (
                <Card
                  key={p.id}
                  className={cn('cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md', selectedProvider?.id === p.id && 'border-primary ring-2 ring-primary/20')}
                  onClick={() => selectProvider(p)}
                >
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon name={PROVIDER_TYPES.find((pt) => pt.type === activeType)?.icon || 'person'} size={20} fill />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{p.name || 'Unknown'}</p>
                      {p.specialty && <p className="truncate text-xs text-muted-foreground">{p.specialty}</p>}
                      <p className="text-xs text-muted-foreground">{p.city}, {p.country}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" className="rounded-full text-[10px]">
                          <Icon name="star" size={10} className="text-warning" fill />
                          {p.rating?.toFixed(1) || 'N/A'}
                        </Badge>
                        {p.verified && (
                          <Badge variant="outline" className="rounded-full border-success/20 text-success text-[10px]">
                            <Icon name="verified" size={10} fill /> Verified
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Service selection (if provider selected) */}
          {selectedProvider && services.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Select a service</CardTitle>
                <CardDescription>Choose a specific service from {selectedProvider.name}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {services.map((s) => (
                  <div
                    key={s.id}
                    className={cn('flex cursor-pointer items-center justify-between rounded-[12px] border p-3 transition-colors', selectedService?.id === s.id ? 'border-primary bg-primary/5' : 'border-divider hover:bg-surface-secondary')}
                    onClick={() => setSelectedService(s)}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{s.name}</p>
                      {s.durationMinutes && <p className="text-xs text-muted-foreground">{s.durationMinutes} min</p>}
                    </div>
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(s.price, 'USD', locale)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Add to cart button */}
          {selectedProvider && (
            <Button onClick={addToCart} className="gap-2">
              <Icon name="add_shopping_cart" size={18} />
              Add to trip
            </Button>
          )}
        </div>

        {/* Right: Cart summary */}
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon name="luggage" size={18} className="text-primary" fill />
                Your Trip
              </CardTitle>
              <CardDescription>{cart.length} service(s) selected</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {cart.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <Icon name="luggage" size={32} className="mx-auto mb-2 opacity-50" />
                  No services added yet
                </div>
              ) : (
                <>
                  {cart.map((item) => (
                    <div key={item.providerType} className="flex items-start justify-between gap-2 rounded-[12px] bg-surface-secondary p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Icon name={PROVIDER_TYPES.find((pt) => pt.type === item.providerType)?.icon || 'person'} size={14} className="text-primary" fill />
                          <span className="text-xs font-medium text-foreground">{item.providerType}</span>
                        </div>
                        <p className="mt-0.5 truncate text-sm font-medium text-foreground">{item.providerName}</p>
                        {item.serviceName && <p className="truncate text-xs text-muted-foreground">{item.serviceName}</p>}
                        <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency((item.estimatedCost / 100).toFixed(2), 'USD', locale)}</p>
                      </div>
                      <button onClick={() => removeFromCart(item.providerType)} className="shrink-0 text-muted-foreground hover:text-error">
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Total estimated cost</span>
                    <span className="text-xl font-bold text-primary">{formatCurrency(totalCostDollars, 'USD', locale)}</span>
                  </div>
                  <Button onClick={saveDraft} disabled={saving || cart.length === 0} className="w-full gap-2">
                    {saving ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="save" size={16} />}
                    Save Draft
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
