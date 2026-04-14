import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  base: process.env.VITE_BASE ?? '/',
  build: {
    outDir: '../demo-dist',
    emptyOutDir: true,
  },
  server: {
    open: true,
  },
});
