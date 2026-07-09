// TanStack Start's SPA-mode prerender step actually mounts the app and runs effects
// (unlike a normal server-render, which never fires useEffect at all) — so any
// Firebase realtime listener started unconditionally in an effect opens a real,
// permanent connection to the production database during every build. Firebase's
// SDK deliberately keeps that connection open forever (it's a realtime listener),
// and the prerender crawl never tears the component down, so the build process
// hangs indefinitely waiting on that socket. Confirmed directly: a hung `vite build`
// held an established TLS connection to `*.europe-west1.firebasedatabase.app` (this
// project's own Realtime Database) minutes after all real build output had already
// been written to disk.
//
// The obvious-looking fix — checking TanStack Router's own `router.isPrerendering()`
// — does NOT work here: that flag is only set on the router instance constructed
// inside the SSR request handler, but the render pass that actually fires effects
// during a prerender crawl runs through the app's own client-side `getRouter()`
// (src/router.tsx), which never receives that flag. Confirmed by testing: guarding
// with `useRouter().isPrerendering()` still left the same live Firebase socket open.
// The one signal that's reliably readable regardless of which router/render pass is
// currently executing is the raw environment variable TanStack Start's CLI sets for
// the whole prerender process (`TSS_PRERENDERING=true`) — `typeof process` is
// checked first since `process` doesn't exist in a real browser at all (this hook
// runs in every environment, including production client code).
//
// Effects that touch Firebase (reads, writes, or listeners) must check this and
// no-op during prerender; the real subscription/write then runs normally on the
// client after hydration, exactly as before SPA mode existed.
export function useIsPrerendering() {
  return typeof process !== 'undefined' && process.env?.TSS_PRERENDERING === 'true'
}
