import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isAudio?: boolean;
  duration?: number; // Duration in seconds
  audioUrl?: string; // URL for playback
  toolCall?: any;
}

interface ChatContextType {
  messages: Message[];
  addMessage: (msg: Message) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([
    { 
      id: '1', 
      role: 'assistant', 
      content: 'Напоминаю: на завтра не запланировано никаких расходов. Диктуйте, я запланирую...',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2) // 2 hours ago
    }
  ]);

  const addMessage = (msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  };

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