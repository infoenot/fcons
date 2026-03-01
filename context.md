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
- POST   /api/auth/telegram — авторизация
- GET    /api/spaces/my — получить/создать space
- DELETE /api/spaces/my/clear — удалить все транзакции и категории
- GET    /api/transactions?spaceId=N — список транзакций
- POST   /api/transactions — создать транзакцию
- PUT    /api/transactions/:id — обновить транзакцию
- DELETE /api/transactions/:id — удалить транзакцию
- GET    /api/categories?spaceId=N — список категорий
- POST   /api/categories — создать категорию
- PUT    /api/categories/:id — обновить категорию
- DELETE /api/categories/:id — удалить категорию

### Prisma схема (актуальная)
Transaction: id, type, amount, date, category, status, recurrence, recurrenceEndDate, includeInBalance, description, addedById, spaceId
Category: id, name, type, color, icon, spaceId
User: id, telegramId, name, avatar, plan
Space: id, name, inviteToken
SpaceMember: userId, spaceId, role

### Ключевые файлы фронтенда
- frontend/index.tsx — инициализация Telegram WebApp (ready, expand, disableVerticalSwipes)
- frontend/index.html — viewport-fit=cover для safe-area-inset
- frontend/context/FinanceContext.tsx — вся логика работы с API, хранит currentUser
- frontend/context/ChatContext.tsx — история чата, clearMessages()
- frontend/services/api.ts — все HTTP-запросы к бэкенду
- frontend/services/polzaService.ts — интеграция с polza.ai (function calling)
- frontend/components/Layout/Header.tsx — хедер с балансом, отступ сверху через paddingTop
- frontend/components/Modals/TransactionModal.tsx — полноэкранная форма добавления транзакции
- frontend/components/Screens/CalendarScreen.tsx — календарь, категории, транзакции
- frontend/components/Screens/AccountScreen.tsx — профиль с реальными данными из Telegram

## Текущее состояние (актуально на 28.02.2026)
✅ Бэкенд задеплоен и работает
✅ Фронтенд задеплоен
✅ Auth через Telegram работает
✅ Транзакции сохраняются в БД
✅ Категории сохраняются в БД
✅ Кнопка "Очистить все данные" удаляет данные с сервера
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

---

## Патчи (хронология начиная с 01.03.2026)

### patch1-3 — Мульти-юзер
- Приглашения в Space, роли OWNER/MEMBER_FULL/MEMBER_OWN
- Аватары участников в карточках транзакций (addedBy)
- Real-time polling каждые 15 сек
- Фикс getMySpace: приоритет joined spaces над personal

### patch4-5 — AI ассистент улучшения
- Системный промпт: бюджетная сводка в каждом запросе (баланс, доходы/расходы, плановых впереди)
- Никогда не говорит "нет доступа" — использует getTransactions проактивно
- Фильтр addedByName: "покажи расходы жены" / "мои траты"
- После создания транзакции: "Записал: {категория} {сумма} ₽" — коротко

### patch6 — Hotfix синтаксис
- Баг: Python экранировал backtick в конце шаблонной строки → `\`` → сборка падала
- Файл: polzaService.ts

### patch7 — Формат ответов AI
- Ответы максимум 5-6 пунктов, списки через `- `
- Нет вступлений "Конечно!", нет длинных текстов
- Файл: polzaService.ts

### patch8 — UX фиксы
- NotificationsModal: компактный вид карточки (без большой кнопки "Подтвердить")
- CalendarScreen: сортировка транзакций по возрастанию даты (1 мар → 31 мар)

### patch9-11 — Редизайн TransactionModal
- Переключатель Расход/Доход по центру хедера, цветной (красный/зелёный)
- Фиксированная кнопка Сохранить внизу (не скроллится)
- Нампад с операторами + =
- Динамический размер шрифта суммы
- pt-[70px] — отступ от Telegram UI
- Дата как bottom sheet (Вчера/Сегодня/Завтра/Выбрать дату)
- "Отмена" вместо X кнопки

### patch12 — Markdown в чате
- Компонент MarkdownMessage: парсит **жирный**, - списки, пустые строки
- Только для сообщений ассистента

### patch13 — Нампад iOS
- Нампад: AC ⌫ / × | 7 8 9 − | 4 5 6 + | 1 2 3 % | 0(wide) . =
- Дата перемещена после блока Статус/Баланс

### patch14 — Чипс статуса + финальные фиксы
- Чипс `План` / `Факт` — серый текст в рамке (border-fin-border) на каждой карточке транзакции
- Места: CalendarScreen, ChatScreen, TransactionListModal, NotificationsModal
- Удалена дублирующаяся строка "Дата" в TransactionModal
- Отступы сжаты чтобы нампад влезал без скролла

## Карточка транзакции — стандартный вид (везде одинаковый)
аватар | категория + сумма (справа) | дата + чипс "План"/"Факт" + иконки действий

## Дизайн-токены (CSS variables в index.html)
`fin-bg`, `fin-bgSec`, `fin-card`, `fin-border`, `fin-text`, `fin-textSec`, `fin-textTert`,
`fin-accent` (sage green #6b9b85), `fin-success`, `fin-error`, `fin-warning`

### patch15 — Нейтральный дизайн TransactionModal
- Переключатель Расход/Доход — убран красный/зелёный, теперь серый (bg-fin-card + border)
- Кнопка `=` — серая как остальные кнопки нампада
- Статус Факт/План — нейтральный серый
- Активная категория — серая с обводкой вместо зелёной
- Единственный зелёный акцент — кнопка Сохранить
- Цвет типа транзакции виден только в цифре суммы (красная/зелёная)

### patch16 — Фикс уведомлений (важный урок)
- Проблема: кнопка "Подтвердить" и белая линия не убирались несмотря на правки
- Причина: уведомления рендерятся через **TransactionListModal.tsx**, а НЕ через NotificationsModal.tsx
- Фикс: убрана большая кнопка "Подтвердить" и border-t из TransactionListModal
- Теперь: маленькая иконка ✓ вместо кнопки, карточка чистая

## ВАЖНО: где что рендерится
- **Уведомления (колокольчик)** → `TransactionListModal.tsx` (не NotificationsModal!)
- **NotificationsModal.tsx** — не используется для основного отображения карточек
