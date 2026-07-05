import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { AuthProvider } from '../AuthContext.jsx'
import Layout from '../Layout.jsx'
import appCss from '../App.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { title: 'רשימת הבית' }
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Secular+One&family=Rubik:wght@400;500;700&display=swap'
      },
      { rel: 'stylesheet', href: appCss }
    ]
  }),
  shellComponent: RootDocument
})

function RootDocument({ children }) {
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
