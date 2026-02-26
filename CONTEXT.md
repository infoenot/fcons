# fcons — контекст проекта

## Стек
- Frontend: React + Vite + TypeScript → https://infoenot-fcons-45f4.twc1.net/
- Backend: Node.js + Express + Prisma + PostgreSQL → https://infoenot-fcons-6ca6.twc1.net
- Telegram: t.me/famcons_bot/finapp
- Repo: https://github.com/infoenot/fcons
- AI: polza.ai (OpenAI-совместимый, gpt-4o-mini) через VITE_API_KEY

## Структура репо
- /frontend — React приложение
- /backend — Express API

## Что такое проект
Финансовый ассистент в Telegram Mini App. Главный интерфейс — чат с AI (polza.ai).
Пользователь говорит/пишет о расходах, AI распознаёт и создаёт транзакцию.
Данные хранятся на сервере (PostgreSQL), привязаны к Telegram пользователю через Space.

Ключевые концепции:
- ACTUAL (факт) vs PLANNED (план) транзакции
- Кассовый разрыв — если бегущий баланс уходит в минус
- Space — рабочее пространство пользователя, создаётся автоматически при первом входе

## Архитектура

### Auth flow
1. Фронт шлёт POST /api/auth/telegram с заголовком x-telegram-init-data
2. Если initData пустой (браузер, не Telegram) — fallback { id: "1", first_name: "Test" }
3. Бэкенд создаёт User в БД если не существует
4. Фронт получает space через GET /api/spaces/my (создаётся автоматически)
5. Грузит транзакции и категории по spaceId

### API endpoints
- POST /api/auth/telegram — авторизация
- GET  /api/spaces/my — получить/создать space
- DELETE /api/spaces/my/clear — удалить все транзакции и категории
- GET  /api/transactions?spaceId=N — список транзакций
- POST /api/transactions — создать транзакцию
- PUT  /api/transactions/:id — обновить транзакцию
- DELETE /api/transactions/:id — удалить транзакцию
- GET  /api/categories?spaceId=N — список категорий
- POST /api/categories — создать категорию
- PUT  /api/categories/:id — обновить категорию
- DELETE /api/categories/:id — удалить категорию

### Prisma схема (актуальная)
Transaction: id, type, amount, date, category, status, recurrence, recurrenceEndDate, includeInBalance, description, addedById, spaceId
Category: id, name, type, color, icon, spaceId
User: id, telegramId, name, avatar, plan
Space: id, name, inviteToken
SpaceMember: userId, spaceId, role

### Ключевые файлы фронтенда
- frontend/context/FinanceContext.tsx — вся логика работы с API и состоянием
- frontend/context/ChatContext.tsx — история чата, clearMessages()
- frontend/services/api.ts — все HTTP-запросы к бэкенду
- frontend/services/polzaService.ts — интеграция с polza.ai (function calling)

## Текущее состояние (актуально на 26.02.2026)
✅ Бэкенд задеплоен и работает
✅ Фронтенд задеплоен
✅ Auth через Telegram работает
✅ Транзакции сохраняются в БД
✅ Категории сохраняются в БД
✅ Кнопка "Очистить все данные" удаляет данные с сервера

## Что ещё не сделано / идеи
- Показывать реальное имя и аватар пользователя из Telegram в профиле
- Уведомления через бота о плановых платежах
- Повторяющиеся транзакции (recurrence логика на фронте)
- Кнопка "Выйти" (сейчас не работает)
