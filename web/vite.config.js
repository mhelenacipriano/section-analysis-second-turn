import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the build works from any sub-path (GitHub Pages project sites, Vercel, a folder)
export default defineConfig({ base: './', plugins: [react()], build: { chunkSizeWarningLimit: 700 } });
