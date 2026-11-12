import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { reverseEngineeringApi } from './vite-plugin-reverse-engineering';

export default defineConfig({
  plugins: [react(), reverseEngineeringApi()],
  server: {
    port: 3000,
    // Uploaded inputs and run workspaces change while the app is open; they are
    // not app source, so watching them would only trigger needless reloads.
    watch: {
      ignored: ['**/inputs/**', '**/.phoenix-workspace/**', '**/docs/reverse-engineering/**'],
    },
  },
});
