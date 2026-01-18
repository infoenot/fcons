// Fix: Add a reference to node types to resolve TypeScript error on process.cwd()
/// <reference types="node" />

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Загружаем переменные окружения из текущей директории.
  // Третий параметр '' позволяет загружать все переменные.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Это критически важная часть для работы на Netlify:
      // Мы заменяем строку 'process.env.API_KEY' в коде на реальное значение ключа VITE_API_KEY при сборке.
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY)
    }
  }
})