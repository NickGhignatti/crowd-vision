import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default defineConfig((env) => {
  const viteConf = typeof viteConfig === 'function' ? viteConfig(env) : viteConfig

  return mergeConfig(
    viteConf,
    defineConfig({
      test: {
        environment: 'happy-dom',
        exclude: [...configDefaults.exclude, 'e2e/**'],
        root: fileURLToPath(new URL('./', import.meta.url)),
        setupFiles: ['./src/components/__tests__/setup.ts'],
        globals: true,
        mockReset: true,
        restoreMocks: true,
        deps: {
          optimizer: {
            web: {
              enabled: true,
              include: ['vue', 'vue-router', '@vue/test-utils'],
            },
          },
        },
        pool: "threads"
      },
    }),
  )
})
