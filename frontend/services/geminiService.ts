
import { GoogleGenAI, FunctionDeclaration, Type, Tool } from "@google/genai";

// Инструмент для добавления транзакции
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

// Инструмент для получения списка транзакций
const getTransactionsTool: FunctionDeclaration = {
  name: "getTransactions",
  description: "Получить список транзакций и общую сумму. Использовать, когда пользователь спрашивает о расходах, доходах или планах. Поддерживает фильтры по дате, категории и статусу (план/факт).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      startDate: { type: Type.STRING, description: "Начальная дата (YYYY-MM-DD)." },
      endDate: { type: Type.STRING, description: "Конечная дата (YYYY-MM-DD)." },
      category: { type: Type.STRING, description: "Фильтр по категории." },
      type: { type: Type.STRING, enum: ["INCOME", "EXPENSE"], description: "Тип транзакции." },
      status: { type: Type.STRING, enum: ["ACTUAL", "PLANNED"], description: "Статус: ACTUAL (факт) или PLANNED (план)." }
    }
  }
};

// Инструмент для проверки баланса
const getBalanceTool: FunctionDeclaration = {
  name: "getBalance",
  description: "Рассчитать баланс на определенную дату. Использовать для вопросов 'сколько у меня денег', 'какой будет баланс'.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      date: { type: Type.STRING, description: "Дата расчета (YYYY-MM-DD). По умолчанию сегодня." }
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
  // Fix: Directly check and use process.env.API_KEY as per guidelines.
  if (!process.env.API_KEY) {
    throw new Error("API_KEY_NOT_CONFIGURED");
  }
  
  // Create a new instance right before making an API call to ensure it uses the correct key.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Fix: Use gemini-3-flash-preview for the financial assistant task as per guidelines.
  const modelName = 'gemini-3-flash-preview';

  const contents: any[] = [];

  // Добавление истории (ограничиваем, чтобы не раздувать контекст и беречь токены)
  let firstUserFound = false;
  history.slice(-10).forEach(msg => {
    if (!msg.content) return;
    const role = msg.role === 'assistant' ? 'model' : 'user';
    if (role === 'user') firstUserFound = true;
    if (!firstUserFound && role === 'model') return;
    contents.push({ role, parts: [{ text: msg.content }] });
  });

  // Текущий запрос
  const currentParts: any[] = [];
  if (imageBase64) {
    currentParts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
  }
  if (audioBase64) {
    currentParts.push({ inlineData: { mimeType: audioMimeType || "audio/webm", data: audioBase64 } });
  }

  let finalPrompt = prompt;
  if (!finalPrompt && audioBase64) finalPrompt = "Прослушай это сообщение и выполни действие.";
  else if (!finalPrompt && imageBase64) finalPrompt = "Проанализируй чек на фото.";
  
  currentParts.push({ text: finalPrompt || "Привет" });
  contents.push({ role: 'user', parts: currentParts });

  const today = new Date().toISOString().split('T')[0];

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        tools,
        systemInstruction: `Ты — продвинутый финансовый ассистент. Сегодня ${today}. 
        Твои задачи:
        1. Распознавать траты и доходы и сохранять их через addTransaction.
        2. Искать транзакции (включая ПЛАНОВЫЕ) через getTransactions.
        3. Считать баланс через getBalance.
        
        Отвечай всегда на русском языке, кратко и по делу.`
      }
    });

    return response;
  } catch (error: any) {
    console.error("Gemini API Error details:", error);
    
    // Если ошибка 429, выбрасываем специфичное исключение для UI
    if (error.message?.includes('429') || error.status === 'RESOURCE_EXHAUSTED' || error.message?.includes('quota')) {
      throw new Error("QUOTA_EXCEEDED");
    }
    
    throw error;
  }
};
