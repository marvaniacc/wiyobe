/**
 * Custom Wishubest BlockNote block definitions.
 *
 * These blocks let admins embed dynamic widgets in landing pages:
 * - providerList    → live provider grid (filtered by type + country)
 * - featuredDoctors  → top-rated doctors carousel
 * - authForm         → inline login/signup form for a specific role
 *
 * The schema is created by spreading `defaultBlockSpecs` so all native
 * BlockNote blocks (paragraph, heading, list, image, etc.) remain available.
 * The public SSR renderer (blocknote-ssr-renderer.tsx) dispatches these
 * custom types to the live-data React components.
 *
 * BlockNote v0.54 API:
 *   createReactBlockSpec(blockConfig, blockImplementation)
 *   BlockNoteSchema.create({ blockSpecs })
 */
import { createReactBlockSpec } from '@blocknote/react'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'

/* -------------------------------------------------------------------------- */
/* Provider List block                                                          */
/* -------------------------------------------------------------------------- */

const providerListBlock = createReactBlockSpec(
  {
    type: 'providerList' as const,
    propSchema: {
      providerType: { default: 'DOCTOR', values: ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'] },
      country: { default: '' },
      limit: { default: '6' },
      layout: { default: 'grid', values: ['grid', 'list'] },
    },
    content: 'none' as const,
  },
  {
    render: (props) => {
      const p = props.block.props as {
        providerType: string
        country: string
        limit: string
        layout: string
      }
      const updateProp = (key: string, value: string) => {
        props.editor.updateBlock(props.block, {
          props: { ...props.block.props, [key]: value },
        } as any)
      }
      return (
        <div className="my-4 flex flex-col gap-3 rounded-[16px] border-2 border-dashed border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <span className="text-sm font-semibold text-foreground">Provider List (live)</span>
            <span className="ms-auto text-[11px] text-muted-foreground">Wishubest block</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              Type
              <select
                value={p.providerType}
                onChange={(e) => updateProp('providerType', e.target.value)}
                className="h-8 rounded-[8px] border border-divider bg-surface px-2 text-xs text-foreground"
              >
                <option value="DOCTOR">Doctors</option>
                <option value="HOSPITAL">Hospitals</option>
                <option value="HOTEL">Hotels</option>
                <option value="TRANSLATOR">Translators</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              Country (ISO)
              <input
                type="text"
                value={p.country}
                onChange={(e) => updateProp('country', e.target.value)}
                placeholder="TR"
                className="h-8 rounded-[8px] border border-divider bg-surface px-2 text-xs text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              Limit
              <input
                type="number"
                value={p.limit}
                onChange={(e) => updateProp('limit', e.target.value)}
                min={1}
                max={24}
                className="h-8 rounded-[8px] border border-divider bg-surface px-2 text-xs text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              Layout
              <select
                value={p.layout}
                onChange={(e) => updateProp('layout', e.target.value)}
                className="h-8 rounded-[8px] border border-divider bg-surface px-2 text-xs text-foreground"
              >
                <option value="grid">Grid</option>
                <option value="list">List</option>
              </select>
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Renders a live grid of {p.limit} verified {p.providerType.toLowerCase()}s{p.country ? ` in ${p.country}` : ''}.
          </p>
        </div>
      )
    },
    metadata: {
      title: 'Provider List',
      icon: '📋',
      category: 'Wishubest',
      keywords: ['provider', 'doctor', 'hospital', 'hotel', 'translator', 'list', 'grid'],
    },
  },
)

/* -------------------------------------------------------------------------- */
/* Featured Doctors block                                                       */
/* -------------------------------------------------------------------------- */

const featuredDoctorsBlock = createReactBlockSpec(
  {
    type: 'featuredDoctors' as const,
    propSchema: {
      title: { default: 'Top Doctors' },
      limit: { default: '4' },
    },
    content: 'none' as const,
  },
  {
    render: (props) => {
      const p = props.block.props as { title: string; limit: string }
      const updateProp = (key: string, value: string) => {
        props.editor.updateBlock(props.block, {
          props: { ...props.block.props, [key]: value },
        } as any)
      }
      return (
        <div className="my-4 flex flex-col gap-3 rounded-[16px] border-2 border-dashed border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">⭐</span>
            <span className="text-sm font-semibold text-foreground">Featured Doctors (live)</span>
            <span className="ms-auto text-[11px] text-muted-foreground">Wishubest block</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              Section title
              <input
                type="text"
                value={p.title}
                onChange={(e) => updateProp('title', e.target.value)}
                className="h-8 rounded-[8px] border border-divider bg-surface px-2 text-xs text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              Limit (1–8)
              <input
                type="number"
                value={p.limit}
                onChange={(e) => updateProp('limit', e.target.value)}
                min={1}
                max={8}
                className="h-8 rounded-[8px] border border-divider bg-surface px-2 text-xs text-foreground"
              />
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Renders top {p.limit} verified doctors (by rating) with the heading &ldquo;{p.title}&rdquo;.
          </p>
        </div>
      )
    },
    metadata: {
      title: 'Featured Doctors',
      icon: '⭐',
      category: 'Wishubest',
      keywords: ['doctor', 'featured', 'top', 'rating', 'carousel'],
    },
  },
)

/* -------------------------------------------------------------------------- */
/* Auth Form block                                                              */
/* -------------------------------------------------------------------------- */

const authFormBlock = createReactBlockSpec(
  {
    type: 'authForm' as const,
    propSchema: {
      type: { default: 'signup', values: ['login', 'signup'] },
      role: {
        default: 'patient',
        values: ['patient', 'doctor', 'hospital', 'hotel', 'translator', 'affiliate'],
      },
      display: { default: 'inline', values: ['inline', 'modal'] },
      buttonText: { default: '' },
    },
    content: 'none' as const,
  },
  {
    render: (props) => {
      const p = props.block.props as {
        type: string
        role: string
        display: string
        buttonText: string
      }
      const updateProp = (key: string, value: string) => {
        props.editor.updateBlock(props.block, {
          props: { ...props.block.props, [key]: value },
        } as any)
      }
      return (
        <div className="my-4 flex flex-col gap-3 rounded-[16px] border-2 border-dashed border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔐</span>
            <span className="text-sm font-semibold text-foreground">Auth Form (live)</span>
            <span className="ms-auto text-[11px] text-muted-foreground">Wishubest block</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              Type
              <select
                value={p.type}
                onChange={(e) => updateProp('type', e.target.value)}
                className="h-8 rounded-[8px] border border-divider bg-surface px-2 text-xs text-foreground"
              >
                <option value="signup">Sign Up</option>
                <option value="login">Login</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              Role
              <select
                value={p.role}
                onChange={(e) => updateProp('role', e.target.value)}
                className="h-8 rounded-[8px] border border-divider bg-surface px-2 text-xs text-foreground"
              >
                <option value="patient">Patient</option>
                <option value="doctor">Doctor</option>
                <option value="hospital">Hospital</option>
                <option value="hotel">Hotel</option>
                <option value="translator">Translator</option>
                <option value="affiliate">Affiliate</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              Display
              <select
                value={p.display}
                onChange={(e) => updateProp('display', e.target.value)}
                className="h-8 rounded-[8px] border border-divider bg-surface px-2 text-xs text-foreground"
              >
                <option value="inline">Inline</option>
                <option value="modal">Modal</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              Button text
              <input
                type="text"
                value={p.buttonText}
                onChange={(e) => updateProp('buttonText', e.target.value)}
                placeholder="(default)"
                className="h-8 rounded-[8px] border border-divider bg-surface px-2 text-xs text-foreground"
              />
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Renders a {p.type === 'signup' ? 'sign-up' : 'login'} form for role: {p.role}.
          </p>
        </div>
      )
    },
    metadata: {
      title: 'Auth Form',
      icon: '🔐',
      category: 'Wishubest',
      keywords: ['auth', 'login', 'signup', 'form', 'register'],
    },
  },
)

/* -------------------------------------------------------------------------- */
/* Extended schema — default blocks + 3 custom Wishubest blocks               */
/* -------------------------------------------------------------------------- */

export const wishubestSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    providerList: providerListBlock,
    featuredDoctors: featuredDoctorsBlock,
    authForm: authFormBlock,
  },
})
