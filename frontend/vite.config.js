import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173, // 可选，前端端口
    proxy: {
      '/api': {
        target: 'http://localhost:3001', // 后端服务地址，根据实际修改
        changeOrigin: true,
      },
    },
  },
});