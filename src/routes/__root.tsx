import { type ReactNode, useEffect } from 'react'
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { AuthProvider } from '../hooks/AuthContext'
import Layout from '../components/Layout'
import appCss from '../App.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { title: 'רשימת הבית' },
      { name: 'theme-color', content: '#2f3d34' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'apple-mobile-web-app-title', content: 'רשימת קניות' }
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Secular+One&family=Rubik:wght@400;500;700&display=swap'
      },
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'icon', href: '/icons/icon-192.png' }
    ]
  }),
  shellComponent: RootDocument
})

// Registers the app-shell service worker (public/sw.js) once the page has
// finished loading — deferred to `load` (not fired eagerly on mount) so it
// never competes with the initial page's own network/CPU budget, standard
// PWA registration practice. Browser-only: SSR/prerender has no
// `navigator.serviceWorker`, and this must never run during the SPA build's
// prerender pass either (see scripts/build.mjs's note on that pass importing
// this whole module tree).
function useRegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Best-effort — a failed SW registration must never block the app
        // itself from working, it just means no offline-shell/faster-repeat-
        // load benefit this session.
      })
    }
    // `load` is a one-shot event — this effect can easily run after it has
    // already fired (client-side hydration is often faster than the page's
    // remaining subresources), and a listener attached post-fire never runs.
    // Confirmed happening in practice: registration silently never occurred.
    if (document.readyState === 'complete') {
      register()
      return
    }
    window.addEventListener('load', register)
    return () => window.removeEventListener('load', register)
  }, [])
}

function RootDocument({ children }: { children: ReactNode }) {
  useRegisterServiceWorker()
  return (
    <html lang="he" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>
          <Layout>{children}</Layout>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  )
}
