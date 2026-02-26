import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Transaction } from '../types';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isAudio?: boolean;
  duration?: number;
  audioUrl?: string;
  toolCall?: any;
  transactions?: Transaction[];
  imageUrl?: string;
  prompt?: {
    type: 'show' | 'delete';
    question: string;
    transactions: Transaction[];
    responded?: boolean;
  };
}

interface ChatContextType {
  messages: Message[];
  addMessage: (msg: Message) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  clearMessages: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const DEFAULT_MESSAGE: Message = {
  id: '1',
  role: 'assistant',
  content: 'Привет! Я ваш финансовый ассистент. Расскажите о ваших расходах или доходах.',
  timestamp: new Date(),
};

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('fin_chat_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
      }
    } catch (e) {
      console.error('Failed to parse chat messages', e);
    }
    return [DEFAULT_MESSAGE];
  });

  const addMessage = (msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  };

  const clearMessages = () => {
    localStorage.removeItem('fin_chat_messages');
    setMessages([{ ...DEFAULT_MESSAGE, id: Date.now().toString(), timestamp: new Date() }]);
  };

  useEffect(() => {
    localStorage.setItem('fin_chat_messages', JSON.stringify(messages));
  }, [messages]);

  return (
    <ChatContext.Provider value={{ messages, addMessage, setMessages, clearMessages }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within ChatProvider');
  return context;
};

// Алиас для обратной совместимости
export const useChatContext = useChat;
