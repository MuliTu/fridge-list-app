import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'
import { checkDemoConfigFile } from './check-demo-config.mjs'

const errors = checkDemoConfigFile('.env.demo', process.env)
if (errors.length) {
  console.error('Demo build rejected:\n' + errors.map((error) => `- ${error}`).join('\n'))
  process.exit(1)
}
const configuration = parseEnv(readFileSync('.env.demo', 'utf8'))
const guard = fileURLToPath(new URL('./demo-build-network.cjs', import.meta.url))
const runtime = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'SYSTEMROOT'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]))
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), 'build', '--mode', 'demo'], {
  stdio: 'inherit',
  env: { ...runtime, ...configuration, NODE_OPTIONS: `--require ${JSON.stringify(guard)}`, DO_NOT_TRACK: '1', NODE_ENV: 'production' }
})
let timedOut = false
const timer = setTimeout(() => {
  timedOut = true
  console.error('Isolated build exceeded 180 seconds; artifacts alone do not establish success.')
  child.kill('SIGKILL')
}, 180_000)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('error', () => { clearTimeout(timer); process.exitCode = 1 })
child.on('exit', (code, signal) => {
  clearTimeout(timer)
  process.exitCode = timedOut ? 1 : code ?? (signal ? 1 : 0)
})
