import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_TARGET || 'http://localhost'

  return {
    plugins: [
      vue(),
      mode === 'development' ? vueDevTools() : null,
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    build: {
      target: 'esnext',
      minify: 'esbuild',
      rollupOptions: {
        output: {
          // CACHING: Splits code into separate files.
          // If you change your app code, users don't need to re-download
          // massive libraries like Vue or Pinia (they stay cached).
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('vue') || id.includes('pinia') || id.includes('router')) {
                return 'vue-vendor'
              }
              return 'vendor'
            }
          },
        },
      },
    },

    esbuild: {
      // Automatically removes console.log and debugger from Production builds
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
    server: {
      // Pre-loads critical files so the browser doesn't wait when you first open the app
      warmup: {
        clientFiles: ['./src/main.ts', './src/App.vue'],
      },
      proxy: {
        // Helper to avoid repeating code.
        // 'secure: false' is recommended for local dev to avoid SSL errors.
        ...['/auth', '/twin', '/domains'].reduce(
          (acc, route) => ({
            ...acc,
            [route]: { target, changeOrigin: true, secure: false },
          }),
          {},
        ),
        '/socket.io': {
          target,
          ws: true,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
