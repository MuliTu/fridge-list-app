import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'
import { checkDemoConfigFile } from './check-demo-config.mjs'

const errors = checkDemoConfigFile('.env.demo', process.env)
if (errors.length) {
  console.error('Demo startup rejected:\n' + errors.map((error) => `- ${error}`).join('\n'))
  process.exit(1)
}
const configuration = parseEnv(readFileSync('.env.demo', 'utf8'))
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--mode', 'demo', '--host', '127.0.0.1'], {
  stdio: 'inherit', env: { ...process.env, ...configuration }
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('error', () => { console.error('Demo server could not start.'); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
