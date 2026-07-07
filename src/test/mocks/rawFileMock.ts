// Stands in for `*.md?raw` imports (currently just CHANGELOG.md, see ChangelogModal.tsx)
// — Jest has no concept of Vite's `?raw` query suffix, so moduleNameMapper redirects
// here instead of trying to load the real file. No test needs the real changelog text.
const mock = '# Changelog\n\n## [0.0.0] - mock\n\n### Added\n- mock entry for tests\n'

export default mock
