import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const target = env.VITE_API_TARGET || 'http://localhost'

  return {
    plugins: [vue(), vueDevTools()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/auth': {
          target: target,
          changeOrigin: true,
        },
        '/twin': {
          target: target,
          changeOrigin: true,
        },
        '/socket.io': {
          target: target,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  }
})
