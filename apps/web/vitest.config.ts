import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@techsprout/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts'),
    },
  },
});
