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
- SpaceMember — участник Space с ролью (owner / member_full / member_own)

## Архитектура

### Auth flow
1. Фронт шлёт POST /api/auth/telegram с заголовком x-telegram-init-data
2. Если initData пустой (браузер, не Telegram) — fallback { id: "1", first_name: "Test" }
3. Бэкенд создаёт User в БД если не существует
4. Фронт получает space через GET /api/spaces/my (создаётся автоматически)
5. Если в startapp параметре есть invite_TOKEN — автоматически вступает в чужой space
6. Грузит транзакции, категории и участников по spaceId

### Роли участников Space
- owner — создатель space, полный доступ, может управлять участниками, менять роли, очищать данные
- member_full — может всё (добавлять, редактировать, удалять любые транзакции)
- member_own — может только добавлять транзакции и редактировать/удалять СВОИ

### Инвайт-система
- У каждого Space есть уникальный inviteToken (cuid)
- Инвайт-ссылка: https://t.me/famcons_bot/finapp?startapp=invite_{TOKEN}
- При открытии приложения фронт читает initDataUnsafe.start_param
- Если start_param начинается с invite_ — вызывает GET /api/spaces/join/{token}
- Новый участник вступает с ролью member_full (owner может изменить)

### API endpoints
- POST   /api/auth/telegram — авторизация
- GET    /api/spaces/my — получить/создать space (возвращает { space, role })
- DELETE /api/spaces/my/clear — удалить все транзакции и категории (только owner)
- GET    /api/spaces/join/:token — вступить в space по инвайту
- GET    /api/spaces/:spaceId/members — список участников с аватарами и ролями
- PUT    /api/spaces/:spaceId/members/:userId/role — сменить роль (только owner)
- DELETE /api/spaces/:spaceId/members/:userId — удалить участника (owner) или покинуть (сам)
- GET    /api/transactions?spaceId=N — список транзакций (включает поле addedBy)
- POST   /api/transactions — создать транзакцию
- PUT    /api/transactions/:id — обновить (member_own — только свои)
- DELETE /api/transactions/:id — удалить (member_own — только свои)
- GET    /api/categories?spaceId=N — список категорий
- POST   /api/categories — создать категорию
- PUT    /api/categories/:id — обновить категорию
- DELETE /api/categories/:id — удалить категорию

### Prisma схема (актуальная)
Transaction: id, type, amount, date, category, status, recurrence, recurrenceEndDate, includeInBalance, description, addedById, spaceId
  + include addedBy: { id, name, avatar, telegramId }
Category: id, name, type, color, icon, spaceId
User: id, telegramId, name, avatar, plan
Space: id, name, inviteToken
SpaceMember: userId, spaceId, role ("owner" | "member_full" | "member_own")

### Ключевые файлы фронтенда
- frontend/index.tsx — инициализация Telegram WebApp (ready, expand, disableVerticalSwipes)
- frontend/index.html — viewport-fit=cover для safe-area-inset
- frontend/context/FinanceContext.tsx — вся логика работы с API, хранит currentUser, spaceRole, spaceMembers, inviteLink
- frontend/context/ChatContext.tsx — история чата, clearMessages()
- frontend/services/api.ts — все HTTP-запросы к бэкенду
- frontend/services/polzaService.ts — интеграция с polza.ai (function calling)
- frontend/components/Layout/Header.tsx — хедер с балансом, отступ сверху через paddingTop
- frontend/components/Modals/TransactionModal.tsx — полноэкранная форма добавления транзакции
- frontend/components/Screens/CalendarScreen.tsx — календарь, категории, транзакции
- frontend/components/Screens/AccountScreen.tsx — профиль, управление участниками, инвайт

## Текущее состояние (актуально на 28.02.2026)
✅ Бэкенд задеплоен и работает
✅ Фронтенд задеплоен
✅ Auth через Telegram работает
✅ Транзакции сохраняются в БД
✅ Категории сохраняются в БД
✅ Кнопка "Очистить все данные" удаляет данные с сервера (только owner)
✅ Профиль показывает реальное имя и ID из Telegram
✅ Аватар пользователя из Telegram отображается в профиле
✅ Светлая тема — убраны хардкодные тёмные цвета в CalendarScreen
✅ Форма добавления транзакции переделана: цифровая клавиатура, чипсы категорий, быстрые кнопки даты
✅ Telegram WebApp инициализируется через tg.ready() + tg.expand()
✅ Периодические транзакции исправлены (TransactionModal.tsx + CalendarScreen.tsx)
✅ Стили дней календаря — 5 состояний
✅ Стили блоков категорий расходов — прозрачные, доходов — с фоном
✅ Кнопка + новая категория — прозрачная с пунктиром
✅ Переключатель Категории/Транзакции — контейнер прозрачный
✅ Счётчик транзакций в блоке категории (правый верхний угол)
✅ Баг с дублированием суммы в категориях с одинаковым именем — исправлен (фильтр по type)
✅ Совместный бюджет — инвайт по ссылке, роли owner/member_full/member_own
✅ Аватары участников в AccountScreen
✅ Владелец может менять роли и удалять участников
✅ member_own видит все транзакции, но редактирует/удаляет только свои
✅ Transaction.addedBy — показывает кто добавил

## Миграция БД (нужно выполнить после деплоя)
```sql
-- Обновить роль существующих владельцев
UPDATE "SpaceMember" SET role = 'owner' WHERE role = 'member' AND id IN (
  SELECT DISTINCT ON (s.id) sm.id FROM "SpaceMember" sm
  JOIN "Space" s ON sm."spaceId" = s.id
  ORDER BY s.id, sm.id ASC
);

-- Обновить остальных
UPDATE "SpaceMember" SET role = 'member_full' WHERE role = 'member';
```

## Периодические транзакции — как работает (важно)
- При создании периодической транзакции (recurrence != NONE) генерируется массив отдельных транзакций
- Каждая копия сохраняется в БД с recurrence: 'NONE' — они независимы друг от друга
- Можно редактировать/удалять/переводить в факт каждую отдельно
- Даты генерируются через new Date(year, month, day) — локальное время, без UTC-смещения
- generatePeriodicDates в TransactionModal.tsx — макс 366 записей

## Стили календаря (CalendarScreen.tsx) — 5 состояний дней
1. Пустой день — просто цифра, нет фона, нет обводки (text-fin-textTert, border-transparent)
2. Текущий день — зелёный фон, белый текст (bg-fin-accent, text-white)
3. День с транзакциями — тёмный фон, светлый текст, обводка (bg-fin-bgSec, border-fin-border)
4. Кассовый разрыв + транзакции — тёмный фон, красный текст, обводка
5. Кассовый разрыв без транзакций — просто красные цифры, нет фона, нет обводки

## Стили блоков категорий (CalendarScreen.tsx)
- Доходы: bg-fin-card (с фоном)
- Расходы: bg-transparent (только обводка)
- Кнопка +: bg-transparent, border-dashed
- Переключатель Категории/Транзакции: контейнер bg-transparent с обводкой, активный чипс bg-fin-card
- getCategoryTotal и getCategoryCount фильтруют по имени И по типу (INCOME/EXPENSE) — важно

## Известные проблемы
- Кнопка "Закрыть" Telegram при открытии через бота перекрывает хедер.
  Решение: в Header.tsx отступ сверху задаётся через style={{ paddingTop: '50px' }}
  (строка 22). Можно подбирать вручную если не подходит.

## Что ещё не сделано / идеи
- Кнопка "Выйти" (сейчас не работает)
- Уведомления через бота о плановых платежах
- Показать аватар автора рядом с каждой транзакцией в списке/календаре
