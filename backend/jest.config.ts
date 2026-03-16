import type { Config } from 'jest';

const config: Config = {
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
