import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // server modules import `server-only`, which throws outside a React server
    alias: { 'server-only': fileURLToPath(new URL('./src/test-server-only.ts', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
