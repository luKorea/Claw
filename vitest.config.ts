import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// vitest 2 内置依赖 vite 5,与项目主 vite 6 类型有冲突(@vitejs/plugin-react 暴露的是 vite 6 类型)。
// 运行时 vite 5 也能加载 vite 6 兼容插件,这里用宽松类型跳过静态校验。
export default defineConfig({
  // @ts-expect-error vite 5 vs vite 6 plugin 类型不兼容,运行时无碍
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/components/ui/**',
      ],
    },
    server: {
      deps: {
        inline: ['@anthropic-ai/sdk'],
      },
    },
  },
});
