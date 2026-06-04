module.exports = {
  ignorePatterns: [
    '.eslintrc.js',
    '*.config.js',
    '**/dist/**',
    '**/*.d.ts',
    '**/*.test.ts',
    'extract-pdf.js',
    'scripts/**',
  ],
  parser: '@typescript-eslint/parser',
  extends: [
    'airbnb-typescript/base',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: [
      './src/frontend/tsconfig.json',
      './src/shared/tsconfig.json',
      './src/electron/tsconfig.json',
      './src/backend/tsconfig.json',
      './tsconfig.scripts.json',
    ],
  },
  rules: {
    'import/prefer-default-export': 'off',
    'import/extensions': 'off',
    'import/no-extraneous-dependencies': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
};
