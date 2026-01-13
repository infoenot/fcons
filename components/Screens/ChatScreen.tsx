import React, { useState, useRef, useEffect } from 'react';
import { Mic, Loader2, Send, Square, Play, Pause, Edit2, Trash2, Repeat, Check } from 'lucide-react';
import { generateAIResponse } from '../../services/geminiService';
import { useFinance } from '../../context/FinanceContext';
import { useChat, Message } from '../../context/ChatContext';
import { format, differenceInCalendarDays, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Transaction } from '../../types';

export default function ChatScreen() {
  const [input, setInput] = useState('');
  const { messages, setMessages } = useChat(); 
  
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { openTransactionModal, transactions, deleteTransaction } = useFinance();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const getHistory = () => {
      return messages.slice(-15).map(m => ({
          role: m.role,
          content: m.content
      }));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const duration = Math.round((Date.now() - recordingStartTimeRef.current) / 1000); 
        
        await handleSendAudio(audioBlob, duration);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Не удалось получить доступ к микрофону.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSendAudio = async (audioBlob: Blob, duration: number) => {
    const audioUrl = URL.createObjectURL(audioBlob);
    
    const userMsg: Message = { 
        id: Date.now().toString(), 
        role: 'user', 
        content: 'Голосовое сообщение',
        timestamp: new Date(),
        isAudio: true,
        duration: duration < 1 ? 1 : duration,
        audioUrl: audioUrl 
    };
    
    const history = getHistory();
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];
            const mimeType = audioBlob.type || 'audio/webm';
            
            try {
                const result = await generateAIResponse("", history, undefined, base64Audio, mimeType);
                await processAIResult(result);
            } catch (e) {
                console.error(e);
                setMessages(prev => [...prev, { id: (Date.now()+1).toString(), role: 'assistant', content: "Ошибка обработки аудио.", timestamp: new Date() }]);
                setLoading(false);
            }
        };
    } catch (error) {
        setLoading(false);
    }
  };

  const togglePlayback = (msgId: string, url?: string) => {
      if (!url) return;
      if (playingMsgId === msgId) {
          if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current = null;
          }
          setPlayingMsgId(null);
      } else {
          if (audioRef.current) {
              audioRef.current.pause();
          }
          const audio = new Audio(url);
          audioRef.current = audio;
          setPlayingMsgId(msgId);
          audio.play().catch(e => {
              console.error("Playback error", e);
              setPlayingMsgId(null);
          });
          audio.onended = () => {
              setPlayingMsgId(null);
              audioRef.current = null;
          };
      }
  };

  const handleSendText = async () => {
    if (!input.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input, timestamp: new Date() };
    const history = getHistory();

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const result = await generateAIResponse(userMsg.content, history);
      await processAIResult(result);
    } catch (error) {
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'assistant', 
        content: "Ошибка соединения.",
        timestamp: new Date()
      }]);
      setLoading(false);
    }
  };

  const processAIResult = async (result: any, foundTransactions?: Transaction[]) => {
      const responseText = result.text; 
      const functionCalls = result.functionCalls;
      
      const drafts: Partial<Transaction>[] = [];
      let systemResponseData: string | null = null;
      let nextFoundTransactions: Transaction[] | undefined = foundTransactions;

      if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
             if (call.name === 'addTransaction') {
                 const args = call.args;
                 drafts.push({
                     type: args.type || 'EXPENSE',
                     amount: args.amount,
                     date: args.date || format(new Date(), 'yyyy-MM-dd'),
                     category: args.category,
                     status: args.status || 'ACTUAL',
                     recurrence: args.recurrence || 'NONE',
                     description: args.description || args.category,
                     includeInBalance: true 
                 });
             } else if (call.name === 'getTransactions') {
                 const { startDate, endDate, category, type } = call.args;
                 let filtered = transactions;
                 
                 if (type) filtered = filtered.filter(t => t.type === type);
                 if (category) filtered = filtered.filter(t => t.category.toLowerCase().includes(category.toLowerCase()));
                 if (startDate) filtered = filtered.filter(t => t.date >= startDate);
                 if (endDate) filtered = filtered.filter(t => t.date <= endDate);

                 if (filtered.length === 0) {
                     systemResponseData = "Транзакции не найдены за указанный период.";
                 } else {
                     const totalSum = filtered.reduce((sum, t) => sum + t.amount, 0);
                     const limited = filtered.slice(-20);
                     nextFoundTransactions = filtered; // Keep all results to show as cards
                     systemResponseData = `Найдено транзакций: ${filtered.length}. ОБЩАЯ СУММА: ${totalSum} ₽.\nСписок:\n` + limited.map(t => 
                        `- ${t.date} | ${t.type === 'INCOME' ? 'Доход' : 'Расход'} | ${t.category} | ${t.amount}₽`
                     ).join('\n');
                     if (filtered.length > 20) systemResponseData += `\n...и еще ${filtered.length - 20} записей.`;
                 }
             } else if (call.name === 'getBalance') {
                 const { date } = call.args;
                 if (date) {
                    let runningBalance = 0;
                    const sorted = [...transactions]
                      .filter(t => t.includeInBalance)
                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                    
                    for (const t of sorted) {
                        if (t.date <= date) {
                            if (t.type === 'INCOME') runningBalance += t.amount;
                            else runningBalance -= t.amount;
                        }
                    }
                    systemResponseData = `Баланс на дату ${date} составляет: ${runningBalance} ₽.`;
                 }
             }
        }
      }

      if (systemResponseData !== null) {
          try {
             const history = getHistory();
             const dataPrompt = `[SYSTEM_DATA_RESPONSE]\n${systemResponseData}\n\nОтветь пользователю на основе этих данных. Если это был вопрос о сумме, обязательно назови итоговую цифру. Сделай ответ кратким.`;
             const nextResult = await generateAIResponse(dataPrompt, history);
             // Pass found transactions to the next recursion level
             await processAIResult(nextResult, nextFoundTransactions);
          } catch (e) {
             console.error(e);
             setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: "Ошибка анализа данных.", timestamp: new Date() }]);
             setLoading(false);
          }
          return;
      }

      if (drafts.length > 0) {
          openTransactionModal('CONFIRM', drafts);
      }

      if (responseText) {
          setMessages(prev => [...prev, { 
            id: (Date.now() + 1).toString(), 
            role: 'assistant', 
            content: responseText,
            timestamp: new Date(),
            transactions: foundTransactions // Attach cards here
          }]);
      } else if (drafts.length === 0) {
          setMessages(prev => [...prev, { 
            id: (Date.now() + 1).toString(), 
            role: 'assistant', 
            content: "Не удалось распознать команду.",
            timestamp: new Date()
          }]);
      }

      setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const history = getHistory();
      const reader = new FileReader();
      reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          const userMsg: Message = { id: Date.now().toString(), role: 'user', content: "[IMG_UPLOAD]", timestamp: new Date() };
          setMessages(prev => [...prev, userMsg]);
          setLoading(true);
          try {
             const result = await generateAIResponse("Scan this receipt.", history, base64);
             await processAIResult(result);
          } catch (err) {
              console.error(err);
              setLoading(false);
          }
      };
      reader.readAsDataURL(file);
  };
  
  const formatDuration = (seconds?: number) => {
      if (!seconds) return "00:00";
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getMessageDateLabel = (date: Date, role: 'user' | 'assistant') => {
      const name = role === 'user' ? 'Вы' : 'Ассистент';
      const dateStr = format(date, 'd MMM, HH:mm', { locale: ru }).replace('.', '');
      return `${name} (${dateStr})`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const waveData = [15, 30, 20, 45, 30, 60, 45, 80, 50, 70, 45, 30, 55, 75, 50, 30, 60, 40, 75, 55, 30, 45, 20, 60, 80];

  return (
    <div className="flex flex-col h-full bg-fin-bg overflow-hidden mt-2.5">
      <div className="flex-1 px-4 pb-3 pt-4 min-h-0 flex flex-col gap-4">
        
        {/* Chat Message List */}
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              
              <span className="text-[10px] text-fin-textTert mb-1.5 font-medium tracking-wide px-1">
                  {getMessageDateLabel(msg.timestamp, msg.role)}
              </span>

              <div className={`
                text-[14px] font-normal tracking-[0] leading-[1.35] transition-all max-w-[85%]
                ${msg.role === 'user' 
                  ? 'bg-fin-accent text-white rounded-2xl rounded-br-none shadow-md p-3.5' 
                  : 'text-left text-fin-text'} 
              `}>
                 {msg.isAudio ? (
                     <div className="flex items-center gap-3 py-1 px-2 w-full min-w-[170px]">
                         <button 
                           onClick={() => togglePlayback(msg.id, msg.audioUrl)}
                           className={`
                              w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all 
                              ${playingMsgId === msg.id ? 'bg-white text-fin-accent shadow-md scale-105' : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'}
                           `}
                         >
                             {playingMsgId === msg.id ? (
                                 <Pause size={14} fill="currentColor" />
                             ) : (
                                 <Play size={14} fill="currentColor" className="ml-0.5" />
                             )}
                         </button>
                         <div className="flex-1 flex items-center justify-center gap-[2px] h-8 mx-2 select-none pointer-events-none">
                            {waveData.map((h, i) => (
                              <div key={i} className={`w-[2px] rounded-full transition-all duration-300 ${playingMsgId === msg.id ? 'bg-white' : 'bg-white/40'}`} style={{ height: `${Math.max(20, h)}%`, transform: playingMsgId === msg.id ? 'scaleY(1.1)' : 'scaleY(1)' }} />
                            ))}
                         </div>
                         <span className="text-[10px] font-mono opacity-80 tracking-widest ml-auto shrink-0 pt-0.5">
                             {formatDuration(msg.duration)}
                         </span>
                     </div>
                 ) : (
                   <div className="space-y-3">
                      {msg.content !== "[IMG_UPLOAD]" && <div>{msg.content}</div>}
                      
                      {msg.transactions && msg.transactions.length > 0 && (
                        <div className="space-y-2 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                           {msg.transactions.map((tx) => (
                             <ChatTransactionCard 
                               key={tx.id} 
                               transaction={tx} 
                               onEdit={() => openTransactionModal('EDIT', tx)}
                               onDelete={() => {
                                 if(confirm('Удалить операцию?')) {
                                   deleteTransaction(tx.id);
                                   setMessages(prev => [...prev, {
                                     id: Date.now().toString(),
                                     role: 'assistant',
                                     content: `Удалил ${tx.category} на сумму ${tx.amount} ₽.`,
                                     timestamp: new Date()
                                   }]);
                                 }
                               }}
                             />
                           ))}
                        </div>
                      )}
                   </div>
                 )}
              </div>
            </div>
          ))}
          
          {loading && (
             <div className="flex items-start">
               <div className="flex items-center gap-2 text-fin-textTert text-xs pl-0 mt-2">
                 <Loader2 className="animate-spin" size={12} />
                 <span>Анализирую...</span>
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-fin-card rounded-3xl border border-fin-border p-4 flex items-end justify-between gap-4 shadow-sm shrink-0">
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
          <textarea ref={textareaRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={isRecording ? "Запись..." : "Сообщение..."} className="bg-transparent border-none outline-none text-fin-text placeholder-fin-textTert/50 text-base font-medium flex-1 resize-none py-2 max-h-[160px] overflow-y-auto no-scrollbar" disabled={loading || isRecording} />
          <button onClick={input.length > 0 ? handleSendText : handleMicClick} disabled={loading} className={`w-[46px] h-[46px] rounded-full flex items-center justify-center shadow-md hover:scale-105 transition-all active:scale-95 shrink-0 ${isRecording ? 'bg-fin-error text-white animate-pulse' : 'bg-fin-accent text-white'}`}>
            {input.length > 0 ? <Send size={20} className="ml-0.5" /> : isRecording ? <Square size={18} fill="currentColor" /> : <Mic size={24} />}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ChatTransactionCardProps {
  transaction: Transaction;
  onEdit: () => void;
  onDelete: () => void;
}

const ChatTransactionCard: React.FC<ChatTransactionCardProps> = ({ transaction, onEdit, onDelete }) => {
  return (
    <div className="bg-fin-bgSec border border-fin-border rounded-xl p-3 flex flex-col gap-2 max-w-[280px]">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className={`w-1 h-6 rounded-full ${transaction.type === 'INCOME' ? 'bg-fin-success' : 'bg-fin-error'}`} />
          <div className="min-w-0">
            <div className="text-xs font-bold text-fin-text truncate">{transaction.category}</div>
            <div className="text-[9px] text-fin-textTert font-medium uppercase tracking-wider">
              {format(parseISO(transaction.date), 'd MMM', { locale: ru })}
            </div>
          </div>
        </div>
        <div className="text-xs font-bold text-fin-text">
          {transaction.type === 'INCOME' ? '+' : '-'}{transaction.amount.toLocaleString()} ₽
        </div>
      </div>
      
      <div className="flex gap-2 pt-1 border-t border-fin-border/30 justify-end">
        <button 
          onClick={onEdit}
          className="p-1.5 text-fin-textTert hover:text-fin-accent hover:bg-fin-accent/5 rounded-md transition-all flex items-center gap-1"
        >
          <Edit2 size={12} />
          <span className="text-[10px]">Изм.</span>
        </button>
        <button 
          onClick={onDelete}
          className="p-1.5 text-fin-textTert hover:text-fin-error hover:bg-fin-error/5 rounded-md transition-all flex items-center gap-1"
        >
          <Trash2 size={12} />
          <span className="text-[10px]">Удал.</span>
        </button>
      </div>
    </div>
  );
};