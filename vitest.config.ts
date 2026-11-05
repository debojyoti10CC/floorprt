import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['apps/**/*.test.ts','packages/*/src/**/*.test.ts','services/**/*.test.ts'],testTimeout:20000}});
