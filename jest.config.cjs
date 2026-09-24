// .cjs extension deliberately — package.json has "type": "module", so a plain
// .js config here would be loaded as ESM and break Jest's CommonJS-based config
// loading. ts-jest transforms test files to CommonJS via tsconfig.jest.json
// regardless of the app's own ESM/bundler-mode tsconfig.json (Vite's own resolution
// mode isn't meaningful inside Jest's Node-based test runner).
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/test-support/setupTests.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }]
  },
  moduleNameMapper: {
    '\\.css$': '<rootDir>/tests/test-support/mocks/fileMock.ts',
    // jose ships pure ESM with no CJS build — Jest's CJS module registry can't load
    // it directly ("Unexpected token 'export'"). See tests/test-support/mocks/joseMock.ts for
    // the full reasoning; this fakes the small slice of jose's API this app uses.
    '^jose$': '<rootDir>/tests/test-support/mocks/joseMock.ts'
  },
  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx}'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
}
