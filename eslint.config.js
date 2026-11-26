import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'Modelos 3D/*/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module'
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'warn'
    }
  },
  {
    files: ['server/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['client/**/*.js', 'Modelos 3D/**/*.js'],
    languageOptions: { globals: { ...globals.browser, io: 'readonly' } }
  },
  {
    files: ['shared/**/*.js'],
    languageOptions: { globals: globals['shared-node-browser'] }
  }
];
