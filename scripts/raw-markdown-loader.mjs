import { readFile } from 'node:fs/promises'

// Match Vite's raw-text imports without affecting normal modules or Markdown URLs.
export async function load(url, context, nextLoad) {
  const resource = new URL(url)
  if (
    resource.protocol !== 'file:' ||
    !resource.pathname.endsWith('.md') ||
    !resource.searchParams.has('raw')
  ) {
    return nextLoad(url, context)
  }

  const text = await readFile(resource, 'utf8')
  return {
    format: 'module',
    source: `export default ${JSON.stringify(text)};`,
    shortCircuit: true
  }
}
