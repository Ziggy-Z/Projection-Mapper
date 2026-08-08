import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the built bundle also works opened from disk or any subpath.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
});
