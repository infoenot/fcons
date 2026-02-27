import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();        // Сообщаем Telegram что приложение готово
  tg.expand();       // Разворачиваем на весь экран — убирает кнопку "Закрыть" из шапки
  tg.disableVerticalSwipes?.(); // Отключаем свайп вниз для закрытия
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
