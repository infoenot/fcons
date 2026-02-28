// ============================================================
// polzaService.ts — замена geminiService.ts
// Polza.ai (OpenAI-совместимый API, работает без VPN в России)
// Модели: openai/gpt-4o-mini (чат + фото) + openai/gpt-4o-mini-transcribe (голос)
// ============================================================

const POLZA_BASE_URL = "https://api.polza.ai/v1";

// ── Описание инструментов (Function Calling) ────────────────

const tools = [
  {
    type: "function",
    function: {
      name: "addTransaction",
      description:
        "Добавить новую финансовую транзакцию (расход или доход). Использовать, когда пользователь сообщает о покупке, получении денег или планирует платеж.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["INCOME", "EXPENSE"],
            description: "Тип: доход (INCOME) или расход (EXPENSE)?",
          },
          amount: { type: "number", description: "Сумма денег." },
          date: {
            type: "string",
            description:
              "Дата в формате YYYY-MM-DD. Если не указана — использовать сегодня.",
          },
          category: {
            type: "string",
            description:
              "Категория транзакции (например: Еда, Зарплата, Интернет).",
          },
          status: {
            type: "string",
            enum: ["ACTUAL", "PLANNED"],
            description:
              "ACTUAL если уже случилось, PLANNED если в будущем.",
          },
          description: { type: "string", description: "Краткое описание." },
          recurrence: {
            type: "string",
            enum: ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"],
            description: "Повторяемость.",
          },
        },
        required: ["type", "amount", "date", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTransactions",
      description:
        "Получить список транзакций и общую сумму. Использовать, когда пользователь спрашивает о расходах, доходах или планах.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Начальная дата (YYYY-MM-DD)." },
          endDate: { type: "string", description: "Конечная дата (YYYY-MM-DD)." },
          category: { type: "string", description: "Фильтр по категории." },
          type: {
            type: "string",
            enum: ["INCOME", "EXPENSE"],
            description: "Тип транзакции.",
          },
          status: {
            type: "string",
            enum: ["ACTUAL", "PLANNED"],
            description: "Статус: ACTUAL (факт) или PLANNED (план).",
          },
          addedByName: {
            type: "string",
            description: "Имя участника — показать только его транзакции. Например: 'Мария', 'жена', 'я'.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getBalance",
      description:
        "Рассчитать баланс на определённую дату. Использовать для вопросов 'сколько у меня денег', 'какой будет баланс'.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Дата расчёта (YYYY-MM-DD). По умолчанию сегодня.",
          },
        },
        required: ["date"],
      },
    },
  },
];

// ── Системный промпт ─────────────────────────────────────────

const getSystemPrompt = (memberNames?: string[], summary?: string) => {
  const today = new Date().toISOString().split("T")[0];
  const todayFormatted = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });
  const membersLine = memberNames && memberNames.length > 1
    ? `\nУчастники совместного бюджета: ${memberNames.join(", ")}.`
    : "";
  const summaryLine = summary ? `\n\nТЕКУЩИЕ ДАННЫЕ БЮДЖЕТА:\n${summary}` : "";
  return `Ты — финансовый ассистент семейного бюджета. Сегодня ${todayFormatted} (${today}).${membersLine}${summaryLine}

ВАЖНО: У тебя ЕСТЬ доступ к транзакциям пользователя через инструмент getTransactions. Никогда не говори "у меня нет доступа" или "предоставьте информацию" — просто вызови getTransactions и ответь на основе реальных данных.

Твои задачи:
1. Распознавать траты и доходы → сохранять через addTransaction.
2. Анализировать бюджет, искать транзакции → использовать getTransactions (всегда, когда нужны данные).
3. Считать баланс → использовать getBalance.
4. Распознавать фото чека → добавлять все позиции как транзакции.

Правила ответов:
- Когда спрашивают про бюджет, расходы, проблемы — сначала вызови getTransactions, потом отвечай
- После создания 1 транзакции: напиши одну строку "Записал: {категория} {сумма} ₽"
- После создания нескольких: напиши итог "Записал {N} операций на {сумма} ₽" и перечисли кратко
- Когда ищешь транзакции конкретного участника (жена, муж, имя) — используй параметр addedByName
- Отвечай кратко, на русском. Без лишних вступлений.\`;
};

// ── Вспомогательная функция запроса к Polza.ai ───────────────

const polzaFetch = async (endpoint: string, body: object): Promise<any> => {
  const apiKey = import.meta.env.VITE_API_KEY;
  if (!apiKey) throw new Error("API_KEY_NOT_CONFIGURED");

  const response = await fetch(`${POLZA_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) throw new Error("QUOTA_EXCEEDED");
    throw new Error(`Polza API error ${response.status}: ${errorText}`);
  }

  return response.json();
};

// ── Расшифровка голоса (аудио → текст) ──────────────────────

const transcribeAudio = async (
  audioBase64: string,
  mimeType: string
): Promise<string> => {
  const apiKey = import.meta.env.VITE_API_KEY;
  if (!apiKey) throw new Error("API_KEY_NOT_CONFIGURED");

  const byteString = atob(audioBase64);
  const byteArray = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    byteArray[i] = byteString.charCodeAt(i);
  }
  const audioBlob = new Blob([byteArray], { type: mimeType });

  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");
  formData.append("model", "openai/gpt-4o-mini-transcribe");
  formData.append("language", "ru");

  const response = await fetch(`${POLZA_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("QUOTA_EXCEEDED");
    throw new Error(`Transcription error: ${response.status}`);
  }

  const data = await response.json();
  return data.text || "";
};

// ── Главная функция (совместима с вызовами из ChatScreen) ────
// Сигнатура не изменилась — ChatScreen работает без изменений!

export const generateAIResponse = async (
  prompt: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
  imageBase64?: string,
  audioBase64?: string,
  audioMimeType?: string,
  memberNames?: string[],
  summary?: string
) => {
  let finalPrompt = prompt;

  if (audioBase64) {
    try {
      const transcribed = await transcribeAudio(
        audioBase64,
        audioMimeType || "audio/webm"
      );
      finalPrompt = transcribed || "Прослушай это сообщение и выполни действие.";
    } catch (e) {
      console.error("Transcription failed:", e);
      finalPrompt = "Не удалось распознать голос. Попробуй ещё раз.";
    }
  }

  if (!finalPrompt && imageBase64) {
    finalPrompt = "Проанализируй чек на фото и добавь все транзакции.";
  }

  const messages: any[] = [
    { role: "system", content: getSystemPrompt(memberNames, summary) },
  ];

  history.slice(-10).forEach((msg) => {
    if (!msg.content) return;
    messages.push({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    });
  });

  if (imageBase64) {
    messages.push({
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
        },
        { type: "text", text: finalPrompt },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: finalPrompt || "Привет",
    });
  }

  const data = await polzaFetch("/chat/completions", {
    model: "openai/gpt-4o-mini",
    messages,
    tools,
    tool_choice: "auto",
    max_tokens: 1000,
    temperature: 0.2,
  });

  const choice = data.choices?.[0];
  if (!choice) throw new Error("Пустой ответ от Polza.ai");

  const message = choice.message;

  const functionCalls: { name: string; args: any }[] = [];

  if (message.tool_calls && message.tool_calls.length > 0) {
    for (const toolCall of message.tool_calls) {
      if (toolCall.type === "function") {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          functionCalls.push({ name: toolCall.function.name, args });
        } catch (e) {
          console.error("Failed to parse tool call args:", e);
        }
      }
    }
  }

  return {
    text: message.content || "",
    functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
  };
};
