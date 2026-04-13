import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['tests/editor/**', 'node_modules/**'],
  },
});
