import { createFileRoute } from '@tanstack/react-router'
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import { getDatabase, ref, push, update } from 'firebase/database'
import { logger } from '../../lib/logger'

// This route exists so n8n's Siri workflow can write to the household's
// grocery list WITHOUT the Realtime Database staying world-writable. Today
// (see security-4) n8n's "Insert to Firebase"/"Update to Firebase" HTTP nodes
// PUT/PATCH directly against the RTDB REST API with no auth at all, which
// means anyone on the internet who finds the (not-secret) Firebase config can
// wipe or tamper with the data the exact same way. This route authenticates
// as an anonymous Firebase user (no service account / Admin SDK needed — just
// the same public client config the browser already uses) so the RTDB write
// rule can be tightened to `auth != null` without breaking Siri voice-add.
// n8n authenticates to THIS route with a shared secret instead — that's the
// piece that actually gates who can call it.
const firebaseConfig = {
  apiKey: 'AIzaSyAcwoGM2xPNBF372qI9kqVsp72kUG-Errs',
  authDomain: 'n8n-vocal-2-db.firebaseapp.com',
  databaseURL: 'https://n8n-vocal-2-db-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'n8n-vocal-2-db',
  appId: '1:32784605229:web:0375ee6a30d8bb5da5d8a4'
}

// Siri voice-add has no concept of "current list" (the Shortcut only ever
// sends { text, person? }) — same known, already-documented gap as the app's
// own custom-list feature. This is the one permanent household list's owner.
const DEFAULT_LIST_OWNER_KEY = 'muli_turiel@gmail_com'

// Lazily initialized and cached across warm serverless invocations — a
// distinct Firebase app name avoids any collision with a browser-side
// `initializeApp` call (different runtimes entirely, but cheap to be explicit).
let cachedAuth: Auth | null = null
let anonymousSignInPromise: Promise<void> | null = null

function getAnonAuth(): Auth {
  if (!cachedAuth) {
    const app = initializeApp(firebaseConfig, 'n8n-write-groceries')
    cachedAuth = getAuth(app)
  }
  return cachedAuth
}

async function ensureAnonymousSession(): Promise<void> {
  const auth = getAnonAuth()
  if (auth.currentUser) return
  if (!anonymousSignInPromise) {
    anonymousSignInPromise = signInAnonymously(auth)
      .then(() => undefined)
      .catch((err) => {
        // Let the next call retry instead of caching a permanent failure —
        // e.g. a transient network blip shouldn't wedge every future request.
        anonymousSignInPromise = null
        throw err
      })
  }
  return anonymousSignInPromise
}

interface WriteRequestBody {
  action: 'insert' | 'update'
  key: string | null
  item: string
  category: string
  added_at: string
  raw_text?: string
  created_by?: string | null
}

export const Route = createFileRoute('/api/n8n-write-groceries')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.N8N_WRITE_SECRET
        if (!secret) {
          logger.error('[n8n-write-groceries] N8N_WRITE_SECRET is not configured — refusing all writes')
          return Response.json({ error: true, message: 'server not configured' }, { status: 500 })
        }

        const providedSecret = request.headers.get('x-n8n-secret')
        if (providedSecret !== secret) {
          logger.warn('[n8n-write-groceries] request rejected: invalid or missing x-n8n-secret header')
          return Response.json({ error: true, message: 'unauthorized' }, { status: 401 })
        }

        let body: WriteRequestBody
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: true, message: 'invalid JSON body' }, { status: 400 })
        }

        if (body.action !== 'insert' && body.action !== 'update') {
          return Response.json({ error: true, message: 'action must be "insert" or "update"' }, { status: 400 })
        }
        if (typeof body.item !== 'string' || !body.item.trim()) {
          return Response.json({ error: true, message: 'item is required' }, { status: 400 })
        }
        if (body.action === 'update' && (typeof body.key !== 'string' || !body.key)) {
          return Response.json({ error: true, message: 'key is required for action "update"' }, { status: 400 })
        }

        logger.success(`[n8n-write-groceries] request received: action=${body.action}, item="${body.item}"`)

        try {
          await ensureAnonymousSession()
          const db = getDatabase(getAnonAuth().app)
          const groceriesRef = ref(db, `users/${DEFAULT_LIST_OWNER_KEY}/groceries`)

          if (body.action === 'insert') {
            const newRef = await push(groceriesRef, {
              item: body.item,
              category: body.category,
              added_at: body.added_at,
              raw_text: body.raw_text ?? null,
              bought: false,
              created_by: body.created_by ?? null
            })
            logger.success(`[n8n-write-groceries] inserted key=${newRef.key}`)
            return Response.json({ success: true, action: 'insert', key: newRef.key })
          }

          await update(ref(db, `users/${DEFAULT_LIST_OWNER_KEY}/groceries/${body.key}`), {
            bought: false,
            added_at: body.added_at
          })
          logger.success(`[n8n-write-groceries] updated key=${body.key}`)
          return Response.json({ success: true, action: 'update', key: body.key })
        } catch (err) {
          logger.error(`[n8n-write-groceries] write failed: ${err.message}`)
          return Response.json({ error: true, message: 'write failed' }, { status: 502 })
        }
      }
    }
  }
})
