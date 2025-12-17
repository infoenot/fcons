import { GoogleGenAI, FunctionDeclaration, Type, Tool } from "@google/genai";

// We define the tools that Gemini can "call"
const addTransactionTool: FunctionDeclaration = {
  name: "addTransaction",
  description: "Добавить новую финансовую транзакцию (расход или доход). Использовать, когда пользователь сообщает о покупке, получении денег или планирует платеж.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      type: { type: Type.STRING, enum: ["INCOME", "EXPENSE"], description: "Тип: доход (INCOME) или расход (EXPENSE)?" },
      amount: { type: Type.NUMBER, description: "Сумма денег." },
      date: { type: Type.STRING, description: "Дата в формате YYYY-MM-DD. Если не указана, использовать сегодня." },
      category: { type: Type.STRING, description: "Категория транзакции (например, Еда, Зарплата, Интернет)." },
      status: { type: Type.STRING, enum: ["ACTUAL", "PLANNED"], description: "ACTUAL если уже случилось, PLANNED если в будущем." },
      description: { type: Type.STRING, description: "Краткое описание." },
      recurrence: { type: Type.STRING, enum: ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"], description: "Повторяемость." }
    },
    required: ["type", "amount", "date", "category"]
  }
};

const getTransactionsTool: FunctionDeclaration = {
  name: "getTransactions",
  description: "Получить список транзакций и общую сумму. Использовать, когда пользователь спрашивает 'сколько я потратил 2 декабря', 'какие расходы за месяц' или просит показать историю.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      startDate: { type: Type.STRING, description: "Начальная дата (YYYY-MM-DD). Для одного дня startDate = endDate." },
      endDate: { type: Type.STRING, description: "Конечная дата (YYYY-MM-DD)." },
      category: { type: Type.STRING, description: "Фильтр по категории (частичное совпадение)." },
      type: { type: Type.STRING, enum: ["INCOME", "EXPENSE"], description: "Тип транзакции." }
    }
  }
};

const getBalanceTool: FunctionDeclaration = {
  name: "getBalance",
  description: "Рассчитать баланс на определенную дату. Использовать, когда пользователь спрашивает 'какой у меня баланс', 'сколько денег будет 5 числа' и т.д.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      date: { type: Type.STRING, description: "Дата, на которую нужно рассчитать баланс (YYYY-MM-DD). Если 'сейчас' или 'сегодня', использовать текущую дату." }
    },
    required: ["date"]
  }
};

const tools: Tool[] = [
  { functionDeclarations: [addTransactionTool, getTransactionsTool, getBalanceTool] }
];

export const generateAIResponse = async (
  prompt: string,
  history: { role: 'user' | 'assistant', content: string }[] = [],
  imageBase64?: string,
  audioBase64?: string,
  audioMimeType?: string
) => {
  if (!process.env.API_KEY) {
    console.error("API Key is missing. Ensure process.env.API_KEY is set.");
    throw new Error("API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-2.5-flash"; // Fast model for tools

  const contents: any[] = [];

  // 1. Add History
  // Gemini requires the conversation to start with a user message.
  // We filter out any leading model messages.
  let firstUserFound = false;

  history.forEach(msg => {
      // Skip system messages or empty content if any
      if (!msg.content) return;
      
      const role = msg.role === 'assistant' ? 'model' : 'user';

      if (role === 'user') {
          firstUserFound = true;
      }

      if (!firstUserFound && role === 'model') {
          return;
      }

      contents.push({
          role: role,
          parts: [{ text: msg.content }]
      });
  });

  // 2. Add Current Request
  const parts: any[] = [];
  
  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBase64
      }
    });
  }

  if (audioBase64) {
     parts.push({
      inlineData: {
        mimeType: audioMimeType || "audio/webm", 
        data: audioBase64
      }
    });
  }

  // If we have audio but no prompt, provide a default instruction
  let textPrompt = prompt;
  if (!textPrompt && audioBase64) {
      textPrompt = "Прослушай это аудио. Если это транзакция - добавь её. Если вопрос про баланс или расходы - ответь на него.";
  } else if (!textPrompt && imageBase64) {
      textPrompt = "Проанализируй изображение чека или товара и выдели детали транзакции.";
  }

  parts.push({ text: textPrompt });

  contents.push({
      role: 'user',
      parts: parts
  });

  const currentDate = new Date().toISOString().split('T')[0];

  try {
    const result = await ai.models.generateContent({
      model,
      contents: contents,
      config: {
        tools: tools,
        systemInstruction: `Ты — полезный и профессиональный финансовый ассистент. 
        Твоя цель — помогать пользователю вести учет финансов.
        
        СЕГОДНЯШНЯЯ ДАТА: ${currentDate}.
        Используй эту дату для расчета относительных дат (сегодня, завтра, вчера).

        Всегда отвечай на РУССКОМ языке.
        
        1. Если пользователь сообщает о трате или доходе -> вызывай addTransaction.
        2. Если пользователь спрашивает 'сколько я потратил', 'мои расходы за...' -> вызывай getTransactions.
        3. Если пользователь спрашивает 'какой баланс', 'сколько денег останется...' -> вызывай getBalance.
        
        Если данных нет, скажи об этом вежливо.
        Стиль: Профессиональный, лаконичный, "Нео-Финтех".`
      }
    });

    return result;
  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
};