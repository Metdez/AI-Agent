import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'CommonJS' } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/app/api/sessions/[id]/extract/route.ts',
    'src/app/api/sessions/[id]/generate/route.ts',
    'src/app/api/auth/signup/route.ts',
    'src/app/api/auth/login/route.ts',
    'src/app/api/auth/logout/route.ts',
    'src/app/api/auth/session/route.ts',
    'src/app/api/sessions/[id]/export/pdf/route.ts',
    'src/app/api/sessions/[id]/export/docx/route.ts',
    'src/lib/export-helpers.ts',
  ],
}

export default config
