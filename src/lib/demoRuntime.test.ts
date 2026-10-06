import configuration from '../../demo.config.json'
import { assertDemoRuntimeEnvironment, DEMO_CLIENT_MODE, demoFirebaseConfig } from './demoRuntime'

describe('isolated demo runtime', () => {
  it('defaults to the normal client path without an explicit build flag', () => {
    expect(DEMO_CLIENT_MODE).toBe(false)
  })

  it('shares the exact synthetic SDK configuration with preflight', () => {
    expect(demoFirebaseConfig.projectId).toBe(configuration.FIREBASE_PROJECT_ID)
    expect(demoFirebaseConfig.databaseURL).toBe(configuration.FIREBASE_DATABASE_URL)
    expect(() => assertDemoRuntimeEnvironment(configuration, configuration)).not.toThrow()
  })

  it.each(['FIREBASE_PROJECT_ID', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST', 'VITE_DEV_AUTH_BYPASS'])('rejects process/source disagreement for %s', (key) => {
    expect(() => assertDemoRuntimeEnvironment(configuration, { ...configuration, [key]: 'wrong' })).toThrow(key)
    expect(() => assertDemoRuntimeEnvironment({ ...configuration, [key]: 'wrong' }, configuration)).toThrow(key)
  })

  it.each(['GOOGLE_API_KEY', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'LANGSMITH_TRACING', 'RECEIPT_SCAN_URL'])('rejects injected %s without exposing its value', (key) => {
    expect(() => assertDemoRuntimeEnvironment(configuration, { ...configuration, [key]: 'private-sentinel' })).toThrow(key)
    try {
      assertDemoRuntimeEnvironment(configuration, { ...configuration, [key]: 'private-sentinel' })
    } catch (error) {
      expect(String(error)).not.toContain('private-sentinel')
    }
  })
})
