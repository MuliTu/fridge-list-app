import { access, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const stylesheetPattern = /href="(\/assets\/([^"/]+)\.css)"/g

const fileExists = async (filePath) => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function reconcileShellStylesheets(staticDir) {
  const shellPath = path.join(staticDir, '_shell.html')
  if (!(await fileExists(shellPath))) return

  const assetsDir = path.join(staticDir, 'assets')
  const emittedAssets = await readdir(assetsDir)
  let shell = await readFile(shellPath, 'utf8')

  for (const match of shell.matchAll(stylesheetPattern)) {
    const [reference, assetPath, assetBase] = match
    if (await fileExists(path.join(staticDir, assetPath))) continue

    const entryName = assetBase.replace(/-[A-Za-z0-9_-]+$/, '')
    const candidates = emittedAssets.filter(
      (asset) => asset.startsWith(`${entryName}-`) && asset.endsWith('.css')
    )
    if (candidates.length !== 1) {
      throw new Error(
        `missing stylesheet ${assetPath}; expected one emitted ${entryName}-*.css candidate, found ${candidates.length}`
      )
    }

    shell = shell.replace(reference, `href="/assets/${candidates[0]}"`)
  }

  await writeFile(shellPath, shell)

  for (const match of shell.matchAll(stylesheetPattern)) {
    if (!(await fileExists(path.join(staticDir, match[1])))) {
      throw new Error(`shell references missing stylesheet ${match[1]}`)
    }
  }
}
