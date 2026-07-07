// .cjs extension deliberately — package.json has "type": "module", so a plain
// .js config here would be loaded as ESM and break Jest's CommonJS-based config
// loading. ts-jest transforms test files to CommonJS via tsconfig.jest.json
// regardless of the app's own ESM/bundler-mode tsconfig.json (Vite's own resolution
// mode isn't meaningful inside Jest's Node-based test runner).
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test/setupTests.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }]
  },
  moduleNameMapper: {
    '\\.md\\?raw$': '<rootDir>/src/test/mocks/rawFileMock.ts',
    '\\.css$': '<rootDir>/src/test/mocks/fileMock.ts'
  },
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
}
