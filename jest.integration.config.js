/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.integration\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.dto.ts',
    '!**/*.tokens.ts',
    '!**/*.config.ts',
    '!**/index.ts',
    '!**/*.module.ts',
    '!**/*.spec.ts',
    '!**/*.test.ts',
    '!**/*.integration.ts',
  ],
  coverageDirectory: '../coverage-integration',
  testEnvironment: 'node',
  testTimeout: 30000,
  // Run integration tests serially to avoid DB conflicts
  maxWorkers: 1,
};
