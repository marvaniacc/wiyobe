# Task 5-b — Provider Dashboard Builder

## Scope
Built the full provider dashboard at `src/components/dashboards/provider/provider-dashboard.tsx`, working for all 4 provider roles (DOCTOR, HOSPITAL, HOTEL, TRANSLATOR) across 7 sections (overview, appointments/bookings, services, availability, reviews, payouts, profile).

## What was built

### i18n additions (`src/lib/i18n.ts`)
Added ~85 new translation keys to ALL 4 locales (en, tr, fa, ar) — provider.earningsTitle, provider.recentBookings, provider.quickActions, provider.viewReviews, provider.addAvailability, provider.paidOut, provider.weeklySettlement(+Short), provider.serviceName/Description/Price/Duration, provider.inactive, provider.noServices, provider.serviceCreated/Updated/Deleted, provider.confirmDeleteService, provider.slotStart/End, provider.booked/available, provider.deleteSlot, provider.noSlots, provider.slotCreated/Deleted, provider.hotelsNoSlots, provider.visitType, provider.confirmDeleteSlot, provider.noReviews(+Desc), provider.payoutHistory, provider.noPayouts, provider.payoutsNote, provider.profileUpdated, provider.subSpecialties, provider.bio, provider.yearsExperience, provider.consultationFee, provider.onlineFee, provider.education, provider.certifications, provider.hospitalName, provider.description, provider.address, provider.departments, provider.accreditations, provider.beds, provider.baseFee, provider.hotelName, provider.starRating, provider.amenities, provider.roomTypes, provider.pricePerNight, provider.specialization, provider.hourlyRate, provider.dailyRate, provider.preferredLanguage, provider.spec.medical/legal/general, provider.durationMinutes, provider.noBookings, provider.profileSection, provider.commonFields, plus common keys: all/confirmed/refund/patient/visitType/providerNet/period/method/reference/minutes/saveChanges/commaSeparated/edit/delete/joinVideo/inPersonVisit/onlineVisit/error/retry/close/youReceive/optional/cancelReasonPlaceholder/youNet.

### Provider dashboard (`src/components/dashboards/provider/provider-dashboard.tsx`)
Single file, ~1100 lines. Exports `ProviderDashboard({ section, role })`. Switch dispatcher routes to one sub-component per section.

**Helpers:**
- `StatusBadge` — pill badge with status-coloured icon for PENDING/CONFIRMED/COMPLETED/CANCELLED/NO_SHOW/REFUNDED
- `VisitTypePill` — IN_PERSON (location_on icon) / ONLINE (videocam icon)
- `PageHeader` — title + optional description + optional action button, responsive
- `EmptyState` — dashed-border card with icon, title, description, optional CTA
- `ErrorState` — red-tinted card with error icon + retry button
- `StatCardSkeleton`, `RowSkeleton` — loading states

**Sections:**
1. **Overview** (`OverviewSection`) — 4 stat cards (Total bookings, Upcoming, Completed, Average rating with star tint), earnings card (large green available balance, pending + lifetime + paid out rows, "Next payout: weekly settlement" note), recent bookings list (avatar + name + service + date + amount + status badge), quick-actions grid (Add service / Add availability (hidden for HOTEL) / View reviews / Payouts).
2. **Appointments/Bookings** (`AppointmentsSection`) — Tabs filter (All/Confirmed/Completed/Cancelled). Enterprise table with patient (avatar + name + email), visit type pill, date+time, amount + provider net (muted secondary), status badge, actions. CONFIRMED + ONLINE shows "Join video" button (opens videoSessionUrl). CONFIRMED shows "Mark complete" (dialog with net-amount confirmation → POST /api/bookings/complete) and "Cancel" (dialog with reason textarea → POST /api/bookings/cancel). Toasts on success, refresh via refetch.
3. **Services** (`ServicesSection`) — Card grid with name, active badge + Switch toggle (PATCH isActive inline), description, price + duration, Edit + Delete buttons (Edit opens form dialog, Delete opens AlertDialog confirm). "Add service" button opens dialog with name/description/price/durationMinutes form (POST). Empty state with CTA.
4. **Availability** (`AvailabilitySection`) — For HOTEL shows a friendly note about hotels not needing slots. For others: table of slots (date, time range, visit type, booked/available badge, delete action for unbooked only). "Add slot" dialog with datetime-local start/end + visit type select, defaults start=now+1h rounded to 30min, end=+30min. AlertDialog confirms deletion.
5. **Reviews** (`ReviewsSection`) — Hero card with big average number, star rating, count. List of review cards (author avatar + name + StarRating + relative date + comment). Empty state if no reviews.
6. **Payouts** (`PayoutsSection`) — 4 balance cards (Available big/green, Pending, Lifetime, Paid out). Payout history table (date, period, amount, status badge, method, reference). Empty state for payouts. "Payouts are processed weekly by the platform admin." note in page header.
7. **Profile** (`ProfileSection` + `ProfileForm`) — Loads `/api/profile`, builds role-specific form. Two cards: Common (name, phone, country, city, preferredLanguage select) + Role-specific. DOCTOR: specialty, subSpecialties, yearsExperience, consultationFee, onlineFee, languages, education, certifications, bio. HOSPITAL: hospitalName, beds, baseFee, languages, departments, accreditations, address, description. HOTEL: hotelName, starRating (★ select 1-5), pricePerNight, languages, amenities, roomTypes, address, description. TRANSLATOR: languages, specialization (medical/legal/general select), yearsExperience, hourlyRate, dailyRate, bio. PUT /api/profile on submit, toast on success.

### Design system adherence
- All Cards use shadcn Card (16px radius, white bg, 1px border, soft shadow)
- Pill-shaped buttons via existing Button component
- Material Symbols icons via `<Icon name="..." fill />`
- Google flat palette: primary blue, success green, warning amber, error red
- No gradients, no neon, no glassmorphism
- Loading skeletons, error states with retry, empty states everywhere
- Responsive: mobile-first, tables collapse columns on mobile (`hidden md:table-cell`), grids stack
- All user-visible text via `t('key')` — never hardcoded English

## Verification
- `bun run lint` — 0 errors, 0 warnings on new files (only pre-existing warnings in unrelated files)
- Dev log shows successful compiles and all 5 API endpoints (services, slots, payouts, reviews, profile) returning 200 when the dashboard renders
- All API endpoints verified working via curl as doctor@medtravel.com

## Notes for next agents
- The stats endpoint returns `providerName: ''` for doctors (pre-existing backend bug — `u.user?.name` instead of `u.name`). UI gracefully falls back to role label.
- Reviews endpoint returns `count: 0` even though doctor table has `reviewCount: 32` — seed data uses different subjectUserId. UI handles empty state correctly.
- The shell passes `section` and `role` props correctly per the existing NAV config in dashboard-shell.tsx.
- Patient and Admin dashboards are still stubs (Tasks 5-a and 5-c scope).
