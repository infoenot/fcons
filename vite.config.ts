
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
// Fix: Import process explicitly to resolve TypeScript error regarding 'cwd'
import process from 'node:process'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Загружаем переменные окружения из текущей директории. 
  // Третий параметр '' позволяет загружать все переменные, включая те, что без префикса VITE_
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Это критически важная часть для работы на Netlify:
      // Мы заменяем строку 'process.env.API_KEY' в коде на реальное значение ключа при сборке.
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY || env.API_KEY)
    }
  }
})
