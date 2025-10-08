module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.spec.ts'],
    collectCoverageFrom: [
        '**/*.ts',
        '!**/node_modules/**',
        '!**/build/**',
        '!**/coverage/**',
        '!**/tests/**'
    ],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    transform: {
        '^.+\\.ts$': 'ts-jest',
    },
    testTimeout: 60000
};