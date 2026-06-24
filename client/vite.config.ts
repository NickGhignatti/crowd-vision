import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { templateCompilerOptions } from '@tresjs/core'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_TARGET || 'http://localhost'

  return {
    plugins: [vue(templateCompilerOptions), mode === 'development' ? vueDevTools() : null],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    build: {
      target: 'esnext',
      // Strip console/debugger in production via Rolldown's native (oxc) minifier,
      // so no separate esbuild install is needed.
      rolldownOptions: {
        output: {
          minify:
            mode === 'production'
              ? { compress: { dropConsole: true, dropDebugger: true } }
              : false,
        },
      },
    },
    optimizeDeps: {
      // Force Vite to pre-bundle Three.js as a single unit
      include: ['three', '@tresjs/core', '@tresjs/cientos']
    },
    server: {
      // Pre-loads critical files so the browser doesn't wait when you first open the app
      warmup: {
        clientFiles: ['./src/main.ts', './src/App.vue'],
      },
      proxy: {
        // Helper to avoid repeating code.
        // 'secure: false' is recommended for local dev to avoid SSL errors.
        ...['/auth', '/twin', '/agent'].reduce(
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
  } satisfies UserConfig
})
