
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Загружаем локальные переменные из .env файлов
  // Fix: Use '.' instead of process.cwd() to avoid TypeScript errors regarding the Process type.
  const env = loadEnv(mode, '.', '');
  
  return {
    plugins: [react()],
    define: {
      // Поддерживаем как локальный запуск (env), так и переменные Netlify (process.env)
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY)
    }
  }
})
