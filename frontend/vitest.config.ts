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
        globals: true,
        mockReset: true,
        restoreMocks: true,
        pool: "threads",
        coverage: {
          provider: 'v8',
          include: ['src/**/*.{ts,vue}'],
          exclude: ['src/main.ts', 'src/**/*.d.ts', 'src/assets/**', 'src/i18n.ts'],
          reporter: ['text-summary', 'json-summary', 'lcov'],
        }
      },
    }),
  )
})
