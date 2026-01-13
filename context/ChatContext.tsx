import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Transaction } from '../types';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isAudio?: boolean;
  duration?: number; // Duration in seconds
  audioUrl?: string; // URL for playback
  toolCall?: any;
  transactions?: Transaction[]; // For interactive cards in chat
}

interface ChatContextType {
  messages: Message[];
  addMessage: (msg: Message) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize from localStorage or default
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('fin_chat_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        // We need to convert string timestamps back to Date objects
        return parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
      }
    } catch (e) {
      console.error("Failed to parse chat messages", e);
    }

    // Default message if nothing saved
    return [
      { 
        id: '1', 
        role: 'assistant', 
        content: 'Напоминаю: на завтра не запланировано никаких расходов. Диктуйте, я запланирую...',
        timestamp: new Date()
      }
    ];
  });

  const addMessage = (msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  };

  // Persist messages whenever they change
  useEffect(() => {
    localStorage.setItem('fin_chat_messages', JSON.stringify(messages));
  }, [messages]);

  return (
    <ChatContext.Provider value={{ messages, addMessage, setMessages }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat must be used within ChatProvider");
  return context;
};