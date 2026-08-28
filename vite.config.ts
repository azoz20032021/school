import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['logo.png'],
        manifest: {
          name: 'ثانوية المعالي الأهلية',
          short_name: 'ثانوية المعالي ',
          description: 'نظام إدارة شؤون الطلاب',
          theme_color: '#4f46e5',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: 'logo.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'logo.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    build: {
      // Split the dependencies out of the app bundle so a code change does not
      // invalidate ~350KB of unchanged vendor code in every user's cache.
      rollupOptions: {
        output: {
          // Matching on the resolved path catches sub-entries too
          // (react-dom/client, motion/react, ...), which the array form misses.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)/.test(id)) return 'vendor-react';
            if (/[\\/]node_modules[\\/](motion|framer-motion)/.test(id)) return 'vendor-motion';
            if (/[\\/]node_modules[\\/]lucide-react/.test(id)) return 'vendor-icons';
            return 'vendor';
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
