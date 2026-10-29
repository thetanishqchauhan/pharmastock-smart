import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/pharmastock-smart/',
  plugins: [react()],
  test: { environment: 'node' },
});
