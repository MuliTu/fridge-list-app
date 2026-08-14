import { readFile, readdir, writeFile } from 'node:fs/promises'

const assetReferences = (html) =>
  [...new Set([...html.matchAll(/\/assets\/([^"'<>?\s]+)/g)].map((match) => match[1]))]

// Vercel can restore TanStack/Vite build cache entries whose prerendered SPA shell
// still names the previous App-*.css hash even though Vite emitted a new stylesheet.
// Repair that one unambiguous reference, then reject the build if any local asset
// reference is still missing. This prevents a missing CSS request from falling
// through the SPA rewrite and returning index.html with text/html.
export async function reconcileSpaAssetReferences(htmlPath, assetsDirectory) {
  let html = await readFile(htmlPath, 'utf8')
  const files = await readdir(assetsDirectory)
  const available = new Set(files)
  const currentAppStylesheets = files.filter((file) => /^App-[A-Za-z0-9_-]+\.css$/.test(file))
  const replacements = []

  for (const reference of assetReferences(html)) {
    if (available.has(reference) || !/^App-[A-Za-z0-9_-]+\.css$/.test(reference)) continue
    if (currentAppStylesheets.length !== 1) {
      throw new Error(
        `Cannot reconcile missing stylesheet ${reference}: expected one App-*.css asset, found ${currentAppStylesheets.length}`
      )
    }
    const replacement = currentAppStylesheets[0]
    html = html.replaceAll(`/assets/${reference}`, `/assets/${replacement}`)
    replacements.push({ from: reference, to: replacement })
  }

  const missing = assetReferences(html).filter((reference) => !available.has(reference))
  if (missing.length > 0) {
    throw new Error(`SPA shell references missing build assets: ${missing.join(', ')}`)
  }

  if (replacements.length > 0) await writeFile(htmlPath, html)
  return replacements
}
