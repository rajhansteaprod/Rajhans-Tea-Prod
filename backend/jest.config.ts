import type { Config } from 'jest';

const config: Config = {
  // ---------------------------------------------------------------------------
  // COVERAGE THRESHOLDS
  // ---------------------------------------------------------------------------
  // After running tests, Jest measures how much of your SOURCE code was actually
  // executed by tests. This is called "code coverage".
  //
  // Think of it like this: if you have 100 lines of code and your tests only
  // run through 60 of them, your coverage is 60%.
  //
  // These thresholds act as a GATE — if coverage drops below these numbers,
  // the test run fails. This prevents developers from adding new code without
  // writing tests for it.
  //
  // What each metric means:
  //   branches  → every if/else path (e.g. both the "if user exists" and "if not" branch)
  //   functions → every function/method must be called at least once by a test
  //   lines     → every line of code must be executed at least once
  //   statements → every statement (similar to lines but more granular)
  //
  // Start low while features are being built rapidly. Raise incrementally as
  // unit tests are added for each slice (target: 70%+ before production).
  coverageThreshold: {
    global: {
      branches: 5,
      functions: 5,
      lines: 5,
      statements: 5,
    },
  },

  // Tell Jest WHERE to collect coverage from.
  // We only want to measure coverage of our actual source code (src/),
  // not the test files themselves or config files.
  collectCoverageFrom: [
    'src/**/*.ts',           // include all TypeScript source files
    '!src/server.ts',        // exclude server entry point (just starts the app, not testable logic)
    '!src/config/index.ts',  // exclude config (just reads env vars)
    '!src/**/*.d.ts',        // exclude type declaration files
  ],

  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      moduleNameMapper: {
        '^@config/(.*)$': '<rootDir>/src/config/$1',
        '^@api/(.*)$': '<rootDir>/src/api/$1',
        '^@services/(.*)$': '<rootDir>/src/services/$1',
        '^@repositories/(.*)$': '<rootDir>/src/repositories/$1',
        '^@models/(.*)$': '<rootDir>/src/models/$1',
        '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
        '^@utils/(.*)$': '<rootDir>/src/utils/$1',
        '^@loaders/(.*)$': '<rootDir>/src/loaders/$1',
      },
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      globalSetup: '<rootDir>/tests/integration/setup/global-setup.ts',
      globalTeardown: '<rootDir>/tests/integration/setup/global-teardown.ts',
      moduleNameMapper: {
        '^@config/(.*)$': '<rootDir>/src/config/$1',
        '^@api/(.*)$': '<rootDir>/src/api/$1',
        '^@services/(.*)$': '<rootDir>/src/services/$1',
        '^@repositories/(.*)$': '<rootDir>/src/repositories/$1',
        '^@models/(.*)$': '<rootDir>/src/models/$1',
        '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
        '^@utils/(.*)$': '<rootDir>/src/utils/$1',
        '^@loaders/(.*)$': '<rootDir>/src/loaders/$1',
      },
    },
    {
      displayName: 'sanity',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/sanity/**/*.test.ts'],
      moduleNameMapper: {
        '^@config/(.*)$': '<rootDir>/src/config/$1',
        '^@api/(.*)$': '<rootDir>/src/api/$1',
        '^@services/(.*)$': '<rootDir>/src/services/$1',
        '^@repositories/(.*)$': '<rootDir>/src/repositories/$1',
        '^@models/(.*)$': '<rootDir>/src/models/$1',
        '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
        '^@utils/(.*)$': '<rootDir>/src/utils/$1',
        '^@loaders/(.*)$': '<rootDir>/src/loaders/$1',
      },
    },
  ],
};

export default config;
