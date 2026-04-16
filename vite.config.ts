import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import path from 'path';

// No @vitejs/plugin-react here — Vite's built-in esbuild handles JSX via
// tsconfig's `"jsx": "react"`, which emits React.createElement calls.
// The automatic runtime (`react/jsx-runtime`) doesn't exist until React 17,
// and the peer dep advertises React 16.8+.
export default defineConfig({
  plugins: [
    dts({
      exclude: ['tests/**', 'src/__tests__/**'],
    }),
  ],
  build: {
    minify: false,
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        preserveModules: false,
        entryFileNames: '[name].js',
      },
    },
  },
});
