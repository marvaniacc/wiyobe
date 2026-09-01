/**
 * E2E (headless chromium over CDP) — patient-dashboard SPA checks for the
 * SHOW_LEGACY_PROVIDER_TYPES flag (flag OFF):
 *
 *   D0  Patient fixture signs in via the REAL /api/auth/signin
 *   D1  Sidebar contains NO "Itineraries" item; Bookings remains (control)
 *   D2  Browse section tabs: no Hospital/Hotel/Translator tabs; All+Doctor present
 *   D3  Deep-link /dashboard?section=itineraries still renders the section
 *
 * Run: bun run scripts/e2e-legacy-dom.ts http://localhost:3011
 */

const BASE = process.argv[2] || 'http://localhost:3011'
const DEBUG_PORT = 9335
const CHROME = process.env.CHROME_BIN || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'

let passCount = 0
let failCount = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passCount++; console.log(`  ✅ ${name}`) }
  else { failCount++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---- signin + cookie --------------------------------------------------------

const signinRes = await fetch(`${BASE}/api/auth/signin`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'patient@wishubest.com', password: 'patient123' }),
})
check('D0 patient fixture signin → 200', signinRes.status === 200, `status=${signinRes.status}`)
const setCookie = signinRes.headers.get('set-cookie') || ''
const eq = setCookie.indexOf('=')
const cookieName = setCookie.slice(0, eq).trim()
const cookieValue = setCookie.slice(eq + 1, setCookie.indexOf(';'))
check('D0 session cookie captured', cookieName.length > 0 && cookieValue.length > 10, `cookie=${cookieName || 'NONE'}`)

// ---- launch chromium --------------------------------------------------------
// (Bun.spawn — this e2e runs via `bun run`; Bun global types are not installed
// in this repo, hence the local declaration below.)
declare const Bun: { spawn: (cmd: string[], opts?: any) => { kill: () => void } }

const proc = Bun.spawn([CHROME, '--headless=new', '--no-sandbox', '--disable-gpu',
  '--disable-dev-shm-usage', `--remote-debugging-port=${DEBUG_PORT}`, 'about:blank'],
  { stdout: 'ignore', stderr: 'ignore', env: process.env })

let page: any = null
for (let i = 0; i < 25 && !page; i++) {
  try {
    const list = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((r) => r.json())
    page = (Array.isArray(list) ? list : []).find((t: any) => t.type === 'page') || null
  } catch { /* debugger not up yet */ }
  if (!page) await sleep(400)
}
if (!page) { console.error('FATAL: chromium debugger did not come up'); proc.kill(); process.exit(1) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { (ws as any).onopen = () => res(null); (ws as any).onerror = () => rej(new Error('ws connect failed')) })

let msgId = 0
const pending = new Map<number, (v: any) => void>()
ws.addEventListener('message', (ev: any) => {
  const data = JSON.parse((ev as MessageEvent).data)
  if (data.id && pending.has(data.id)) { pending.get(data.id)!(data); pending.delete(data.id) }
})
const send = (method: string, params: any = {}) => new Promise<any>((resolve) => {
  const id = ++msgId
  pending.set(id, resolve)
  ws.send(JSON.stringify({ id, method, params }))
})
async function evalJs(expression: string): Promise<any> {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true })
  return r?.result?.result?.value
}

await send('Page.enable')
await send('Network.enable')
await send('Network.setCookie', { name: cookieName, value: cookieValue, domain: 'localhost', path: '/' })

// D1 — dashboard boot + sidebar content
await send('Page.navigate', { url: `${BASE}/dashboard` })
await sleep(6000)
const bootText: string = (await evalJs('document.body.innerText')) || ''
check('D1 dashboard boots authenticated (Welcome back)', /Welcome back/i.test(bootText), `snippet: ${bootText.slice(0, 80).replace(/\n/g, ' ')}`)
check('D1 sidebar has NO Itineraries item', !/itinerar/i.test(bootText), 'sidebar still shows Itineraries')
check('D1 sidebar keeps Bookings (control)', /bookings|total bookings/i.test(bootText))

// D2 — Browse section: type-TAB row must show only All + Doctor.
// The tab row is the div.flex.flex-wrap.gap-1.5 inside the filter Card.
// The [class] selector needs escaping for querySelectorAll; match tab
// buttons by their structure: rounded-full buttons whose FIRST child is an
// .material-symbols-outlined icon of size 14 (the language dropdown's
// 'translate' icon button lives elsewhere and its icon span is size 16/20,
// but safest is to require the sibling text label to be one of the tab labels).
await send('Page.navigate', { url: `${BASE}/dashboard?section=browse` })
let tabsJson: string | null = null
for (let i = 0; i < 20; i++) {
  await sleep(1000)
  tabsJson = await evalJs(`
    JSON.stringify(
      [...document.querySelectorAll('button')]
        .filter((b) => {
          // Tab buttons: inline-flex rounded-full with an icon + label text
          const cls = b.className || ''
          if (!cls.includes('rounded-full')) return false
          const icon = b.querySelector('.material-symbols-outlined')?.textContent?.trim()
          return ['apps', 'medical_services', 'local_hospital', 'hotel', 'translate'].includes(icon)
            && /all|doctor|hospital|hotel|translator/i.test(b.textContent)
        })
        .map((b) => b.querySelector('.material-symbols-outlined')?.textContent?.trim())
    )
  `)
  if (tabsJson && tabsJson !== '[]' && /apps/.test(tabsJson)) break
}
let tabs: string[] = []
try { tabs = JSON.parse(tabsJson || '[]') } catch { /* keep empty */ }
// 'translate' is ALSO the language-switcher icon — but the language button
// never contains the words all/doctor/hospital, so it's excluded above.
const legacyTabsFound = tabs.filter((x) => ['local_hospital', 'hotel', 'translate'].includes(x || ''))
check('D2 Browse type tabs: NO legacy provider types (tab buttons only)', legacyTabsFound.length === 0, `tabs: ${JSON.stringify(tabs)}`)
check('D2 Browse tabs include apps(All) + medical_services(Doctor) (control)', tabs.includes('apps') && tabs.includes('medical_services'), `tabs: ${JSON.stringify(tabs)}`)

// D3 — itineraries deep-link still renders the section (poll until it does).
// NOTE: the section's rendered heading is "My Trips" (dash.itineraries →
// i18n), NOT the literal word "Itineraries" — match either.
await send('Page.navigate', { url: `${BASE}/dashboard?section=itineraries` })
let itinText = ''
for (let i = 0; i < 12; i++) {
  await sleep(1000)
  itinText = (await evalJs('document.body.innerText')) || ''
  if (/itinerar|my trips/i.test(itinText)) break
}
check('D3 ?section=itineraries deep-link renders the section (nav-hidden but reachable)',
  /itinerar|my trips/i.test(itinText), `snippet: ${itinText.slice(0, 150).replace(/\n/g, ' ')}`)

try { (ws as any).close() } catch { /* ignore */ }
proc.kill()

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
console.log(`RESULT: ${passCount} passed, ${failCount} failed`)
if (failCount > 0) process.exit(1)

// Module marker: this file uses top-level await (run with `bun run`).
export {}
