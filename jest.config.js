module.exports = {
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testEnvironment: 'node',
  testRegex: '\\.spec.ts$',
  testPathIgnorePatterns: [
    '/lib/',
    '/node_modules/',
    '/test-mocha/',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEnv: ['jest-extended', './test/config/testSetupFile.ts'],
  globalSetup: './test/config/globalSetup.ts',
  globalTeardown: './test/config/globalTeardown.ts',
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'reports/junit',
    }],
  ],
  coverageDirectory: 'reports/coverage',
  collectCoverage: false, // if enabled, breakpoints in src do not work because of instrumentation
  coveragePathIgnorePatterns: [
    '/test/',
    // TODO remove this once mocha tests rewritten to jest
    '/test-mocha/',
  ],
};
