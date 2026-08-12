import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' para que el index.html cargue los assets bajo file:// dentro del .exe.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist' },
});
