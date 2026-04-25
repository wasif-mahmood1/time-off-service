module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1'
  },
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.(spec|int-spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json'
      }
    ]
  }
};
