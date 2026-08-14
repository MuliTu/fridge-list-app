import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultRoot = path.resolve(scriptDirectory, '..')

const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/
const TEST_FILE_PATTERN = /(?:^|\/)(?:(?:__tests__|test)\/|[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$)/

// Domain and application code should describe business behaviour without binding
// itself to delivery frameworks or infrastructure/provider SDKs.
const FORBIDDEN_CORE_PACKAGES = [
  '@google-cloud/',
  '@langchain/',
  '@tanstack/',
  'express',
  'firebase',
  'firebase-admin',
  'langchain',
  'next',
  'nodemailer',
  'react',
  'react-dom',
  'vite'
]

// Routes are delivery adapters. Provider construction belongs in a server
// composition/infrastructure module, not beside request parsing and mapping.
const PROVIDER_PACKAGES = [
  '@google-cloud/',
  '@langchain/',
  'firebase',
  'firebase-admin',
  'langchain',
  'node:dns',
  'openai',
  'nodemailer'
]

// These packages are server-only even when imported outside module entry
// points. Checking the package directly prevents an accidental client bundle
// leak that a *.server import-name convention alone cannot catch.
const SERVER_ONLY_PACKAGES = [
  '@google-cloud/',
  '@langchain/',
  'firebase-admin',
  'langchain',
  'node:',
  'nodemailer',
  'openai'
]

const packageMatches = (specifier, packages) =>
  packages.some(
    (packageName) =>
      specifier === packageName ||
      specifier.startsWith(
        packageName.endsWith('/') || packageName.endsWith(':')
          ? packageName
          : `${packageName}/`
      )
  )

const toPosix = (value) => value.split(path.sep).join('/')

const walk = async (directory) => {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }

  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name)
      return entry.isDirectory() ? walk(target) : [target]
    })
  )
  return nested.flat()
}

const extractImports = (source) => {
  const imports = []
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      imports.push({
        specifier: match[1],
        line: source.slice(0, match.index).split('\n').length
      })
    }
  }

  return imports
}

const findModuleRoot = (moduleRelativePath, entryRoots) => {
  const matchingRoot = entryRoots
    .filter(
      (entryRoot) =>
        moduleRelativePath === entryRoot || moduleRelativePath.startsWith(`${entryRoot}/`)
    )
    .sort((left, right) => right.length - left.length)[0]

  return matchingRoot ?? moduleRelativePath.split('/')[0]
}

const moduleTarget = (file, specifier, root, entryRoots) => {
  const modulesRoot = path.join(root, 'src/modules')
  let resolved

  if (specifier.startsWith('.')) {
    resolved = path.resolve(path.dirname(file), specifier)
  } else if (specifier.startsWith('src/modules/')) {
    resolved = path.join(root, specifier)
  } else if (specifier.startsWith('@/modules/')) {
    resolved = path.join(root, 'src', specifier.slice(2))
  } else {
    return undefined
  }

  const relative = toPosix(path.relative(modulesRoot, resolved))
  if (relative.startsWith('../') || relative === '..') return undefined
  const moduleName = findModuleRoot(relative, entryRoots)
  const remainder = relative.slice(moduleName.length).replace(/^\//, '')
  return { moduleName, segments: remainder ? remainder.split('/') : [] }
}

const containingModule = (file, root, entryRoots) => {
  const relative = toPosix(path.relative(path.join(root, 'src/modules'), file))
  if (relative.startsWith('../') || relative === '..') return undefined
  return findModuleRoot(relative, entryRoots)
}

const isPublicModuleEntry = (segments) =>
  segments.length === 0 ||
  (segments.length === 1 && ['index', 'server'].includes(segments[0]))

const isServerCapableSource = (relative) =>
  relative.includes('.server.') ||
  relative.startsWith('src/routes/api/') ||
  /^src\/modules\/.+\/infrastructure\//.test(relative) ||
  /^src\/modules\/.+\/(?:server|composition\.server)\.[cm]?[jt]sx?$/.test(relative)

const importsServerModule = (specifier, target) =>
  specifier.includes('.server') || target?.segments.at(-1) === 'server'

const violation = (relative, line, rule, specifier, detail) =>
  `${relative}:${line} [${rule}] ${detail} (import: ${specifier})`

export const checkArchitecture = async (root = defaultRoot) => {
  const sourceRoot = path.join(root, 'src')
  const files = (await walk(sourceRoot)).filter((file) => SOURCE_FILE_PATTERN.test(file))
  const entryRoots = files
    .filter((file) => /[/\\](?:index|server)\.[cm]?[jt]sx?$/.test(file))
    .map((file) =>
      toPosix(path.relative(path.join(root, 'src/modules'), path.dirname(file)))
    )
    .filter((entryRoot) => !entryRoot.startsWith('../'))
  const violations = []
  let filesChecked = 0

  for (const file of files) {
    const relative = toPosix(path.relative(root, file))
    if (TEST_FILE_PATTERN.test(relative)) continue
    filesChecked += 1

    const source = await readFile(file, 'utf8')
    const imports = extractImports(source)
    const sourceModule = containingModule(file, root, entryRoots)
    const isCore = /^src\/modules\/[^/]+\/(?:domain|application)\//.test(relative)
    const isRoute = relative.startsWith('src/routes/')
    const isClient = !isServerCapableSource(relative)

    if (isCore) {
      for (const match of source.matchAll(/\b(?:process\.env|import\.meta\.env)\b/g)) {
        violations.push(
          violation(
            relative,
            source.slice(0, match.index).split('\n').length,
            'application-environment',
            match[0],
            'domain/application code must receive validated configuration from server composition'
          )
        )
      }
    }

    for (const { specifier, line } of imports) {
      const target = moduleTarget(file, specifier, root, entryRoots)

      if (isCore && packageMatches(specifier, FORBIDDEN_CORE_PACKAGES)) {
        violations.push(
          violation(
            relative,
            line,
            'core-provider-framework',
            specifier,
            'domain/application code must not import provider or framework packages'
          )
        )
      }

      if (
        target &&
        target.moduleName !== sourceModule &&
        !isPublicModuleEntry(target.segments)
      ) {
        violations.push(
          violation(
            relative,
            line,
            'module-public-api',
            specifier,
            `cross-module imports must use src/modules/${target.moduleName} or src/modules/${target.moduleName}/server`
          )
        )
      }

      if (isClient && importsServerModule(specifier, target)) {
        violations.push(
          violation(
            relative,
            line,
            'client-server-boundary',
            specifier,
            'client-capable code must not import a server-only module'
          )
        )
      }

      if (isClient && packageMatches(specifier, SERVER_ONLY_PACKAGES)) {
        violations.push(
          violation(
            relative,
            line,
            'client-server-package',
            specifier,
            'client-capable code must not import a server-only package'
          )
        )
      }

      if (isRoute && packageMatches(specifier, PROVIDER_PACKAGES)) {
        violations.push(
          violation(
            relative,
            line,
            'route-provider-sdk',
            specifier,
            'routes must receive provider-backed services from server composition code'
          )
        )
      }
    }
  }

  return { filesChecked, violations }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  const rootArgument = process.argv.find((argument) => argument.startsWith('--root='))
  const root = rootArgument ? path.resolve(rootArgument.slice('--root='.length)) : defaultRoot
  const result = await checkArchitecture(root)

  if (result.violations.length > 0) {
    console.error(`architecture:check found ${result.violations.length} violation(s):`)
    console.error(result.violations.map((item) => `- ${item}`).join('\n'))
    process.exitCode = 1
  } else {
    console.log(`architecture:check passed (${result.filesChecked} source files checked)`)
  }
}
