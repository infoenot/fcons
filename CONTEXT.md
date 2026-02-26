# fcons — контекст проекта

## Стек
- Frontend: React + Vite + TypeScript → https://infoenot-fcons-45f4.twc1.net/
- Backend: Node.js + Express + Prisma + PostgreSQL → https://infoenot-fcons-6ca6.twc1.net
- Telegram: t.me/famcons_bot/finapp
- Repo: https://github.com/infoenot/fcons

## Структура репо
- /frontend — React приложение
- /backend — Express API

## Текущая проблема
Транзакции и категории не сохраняются в БД. API запросы не уходят с фронтенда.

## Что выяснили
- Бэкенд работает: curl POST /api/auth/telegram возвращает user
- ENV на бэкенде есть: DATABASE_URL, PORT, BOT_TOKEN
- initData пустой при открытии в браузере (не в Telegram) — это нормально
- telegramAuth.ts имеет fallback: если initData пустой → { id: "1", first_name: "Test" }
- Нет Init error в консоли — значит auth проходит
- Следующий шаг: проверить /api/spaces/my и всю цепочку

## Следующий шаг
```bash
curl -s -X POST https://infoenot-fcons-6ca6.twc1.net/api/auth/telegram \
  -H "Content-Type: application/json" \
  -H "x-telegram-init-data: " && \
curl -s https://infoenot-fcons-6ca6.twc1.net/api/spaces/my \
  -H "x-telegram-init-data: "
```
