import configuration from '../../demo.config.json'

declare const __FRIDGE_DEMO_MODE__: boolean

export const DEMO_CLIENT_MODE =
  typeof __FRIDGE_DEMO_MODE__ !== 'undefined' && __FRIDGE_DEMO_MODE__ === true

export const demoFirebaseConfig = {
  apiKey: configuration.VITE_FIREBASE_API_KEY,
  authDomain: configuration.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: configuration.VITE_FIREBASE_DATABASE_URL,
  projectId: configuration.VITE_FIREBASE_PROJECT_ID,
  appId: configuration.VITE_FIREBASE_APP_ID
}

export type DemoEnvironment = Readonly<Record<string, string | undefined>>

/** Admin emulator routing uses process-level variables, so both sources must agree. */
export const assertDemoRuntimeEnvironment = (
  environment: DemoEnvironment,
  processEnvironment: DemoEnvironment
): void => {
  for (const [key, expected] of Object.entries(configuration)) {
    if (environment[key] !== expected || processEnvironment[key] !== expected) {
      throw new Error(`Demo runtime configuration mismatch: ${key}`)
    }
  }
  const forbidden = /(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|SERVICE_ACCOUNT|GOOGLE_APPLICATION_CREDENTIALS|ENDPOINT|BASE_URL|RECEIPT_SCAN_URL|LANGCHAIN_TRACING|LANGSMITH_TRACING|API_KEY)/i
  for (const source of [environment, processEnvironment]) {
    for (const [key, value] of Object.entries(source)) {
      if (value && !(key in configuration) && forbidden.test(key)) {
        throw new Error(`Demo runtime forbids configuration: ${key}`)
      }
    }
  }
}
