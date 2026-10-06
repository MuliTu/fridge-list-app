import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, parseEnv } from 'node:util'

import demoConfiguration from '../demo.config.json' with { type: 'json' }

export const DEMO_CONFIG = Object.freeze(demoConfiguration)

const credentialOrIntegrationKey = /(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY|SERVICE_ACCOUNT|GOOGLE_APPLICATION_CREDENTIALS|ENDPOINT|BASE_URL|RECEIPT_SCAN_URL|LANGCHAIN_TRACING|LANGSMITH_TRACING)/i

/** File-only preflight. This does not assert that the app consumes these settings. */
export const validateDemoConfig = (configuration, inheritedEnvironment = {}) => {
  const errors = []
  for (const [key, expected] of Object.entries(DEMO_CONFIG)) {
    if (configuration[key] !== expected) errors.push(`${key} must match the synthetic demo template`)
    if (inheritedEnvironment[key] !== undefined && inheritedEnvironment[key] !== expected) {
      errors.push(`${key} conflicts with the inherited environment`)
    }
  }
  for (const key of Object.keys(configuration)) {
    if (!Object.hasOwn(DEMO_CONFIG, key)) errors.push(`${key} is not allowed in the demo configuration`)
  }
  for (const [key, value] of Object.entries(inheritedEnvironment)) {
    if (value && !Object.hasOwn(DEMO_CONFIG, key) && credentialOrIntegrationKey.test(key)) {
      errors.push(`${key} must be unset for the demo preflight`)
    }
  }
  return errors
}

export const checkDemoConfigFile = (path, inheritedEnvironment = {}) => {
  let configuration
  try {
    configuration = parseEnv(readFileSync(path, 'utf8'))
  } catch {
    // Do not echo parser messages: malformed lines may contain credentials.
    return ['Cannot read the demo env file; copy .env.demo.example to .env.demo']
  }
  return validateDemoConfig(configuration, inheritedEnvironment)
}

const main = () => {
  let values
  try {
    ;({ values } = parseArgs({ options: { env: { type: 'string', default: '.env.demo' } } }))
  } catch {
    console.error('Usage: npm run demo:check -- --env <demo-env-file>')
    process.exitCode = 1
    return
  }
  const errors = checkDemoConfigFile(values.env, process.env)
  if (errors.length) {
    console.error('Demo configuration rejected:\n' + errors.map((error) => `- ${error}`).join('\n'))
    process.exitCode = 1
    return
  }
  console.log('Demo configuration preflight passed. App/emulator wiring is not yet verified; this command starts no services.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
