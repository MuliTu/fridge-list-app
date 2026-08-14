import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'node:util'
import { ReadableStream, TransformStream } from 'node:stream/web'

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

// LangChain's runnable stream utilities use the Web Streams API. Node exposes
// it, but Jest's jsdom sandbox does not copy it onto the test global.
if (typeof globalThis.ReadableStream === 'undefined') {
  ;(globalThis as any).ReadableStream = ReadableStream
}
if (typeof globalThis.TransformStream === 'undefined') {
  ;(globalThis as any).TransformStream = TransformStream
}

// Radix positioning primitives observe their trigger/content dimensions. jsdom
// has no layout engine or ResizeObserver, so a no-op observer is sufficient for
// interaction tests while the real browser keeps the native implementation.
if (typeof globalThis.ResizeObserver === 'undefined') {
  ;(globalThis as any).ResizeObserver = class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
