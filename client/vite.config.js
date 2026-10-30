import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: ['..'] }, // the app imports ../shared/format.js
    proxy: { '/api': 'http://localhost:3001' },
  },
});
