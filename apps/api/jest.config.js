module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '.*\\.(spec|test)\\.ts$',
  // E2E roda no Playwright (test/e2e), não no Jest.
  testPathIgnorePatterns: ['/node_modules/', '/test/e2e/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@bolao/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@bolao/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!**/*.dto.ts'],
  coverageDirectory: 'coverage',
};
