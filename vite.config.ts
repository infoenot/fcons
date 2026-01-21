import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Загружаем переменные окружения из текущей директории.
  // Третий параметр '' позволяет загружать все переменные.
  // FIX: Replaced `process.cwd()` with an empty string and removed the unnecessary Node.js types reference to fix build configuration errors.
  const env = loadEnv(mode, '', '');
  
  return {
    plugins: [react()],
    define: {
      // Это критически важная часть для работы на Netlify:
      // Мы заменяем строку 'process.env.API_KEY' в коде на реальное значение ключа API_KEY при сборке.
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  }
})
