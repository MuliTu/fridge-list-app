import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'node:util'

// jsdom's test environment doesn't expose TextEncoder/TextDecoder globally by
// default — @tanstack/react-router needs them at import time (its SSR stream
// serializer), so any test importing a route file fails before it even renders
// anything without this polyfill.
if (typeof globalThis.TextEncoder === 'undefined') {
  ;(globalThis as any).TextEncoder = TextEncoder
}
if (typeof globalThis.TextDecoder === 'undefined') {
  ;(globalThis as any).TextDecoder = TextDecoder
}
