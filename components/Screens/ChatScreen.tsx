import React, { useState, useRef, useEffect } from 'react';
import { Mic, Loader2, Send, Square, Play, Pause } from 'lucide-react';
import { generateAIResponse } from '../../services/geminiService';
import { useFinance } from '../../context/FinanceContext';
import { useChat, Message } from '../../context/ChatContext';
import { format, differenceInCalendarDays, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Transaction } from '../../types';

interface ChatScreenProps {
  isStatsOpen?: boolean;
}

export default function ChatScreen({ isStatsOpen = true }: ChatScreenProps) {
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

  const { getSummary, openTransactionModal, transactions } = useFinance();

  const summary = getSummary(new Date());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea logic
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to shrink if text is deleted
      textareaRef.current.style.height = 'auto';
      // Set height to scrollHeight but limit to ~6 rows (approx 160px)
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
      // Convert current messages to simple history object
      // Take last 15 messages to keep context window reasonable but effective
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
    
    // Capture history BEFORE adding the new message to state (since state update is async)
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
                // Pass history to context
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
    
    // Capture history BEFORE adding the new message to state
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

  const processAIResult = async (result: any) => {
      const responseText = result.text; 
      const functionCalls = result.functionCalls;
      
      const drafts: Partial<Transaction>[] = [];
      let systemResponseData: string | null = null;

      if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
             if (call.name === 'addTransaction') {
                 // Collect all drafts
                 const args = call.args;
                 drafts.push({
                     type: args.type || 'EXPENSE',
                     amount: args.amount,
                     date: args.date || format(new Date(), 'yyyy-MM-dd'),
                     category: args.category,
                     status: args.status || 'ACTUAL',
                     recurrence: args.recurrence || 'NONE',
                     description: args.description || args.category,
                     // Default assumption until user edits in modal
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
                     // Calculate total sum for the AI
                     const totalSum = filtered.reduce((sum, t) => sum + t.amount, 0);
                     
                     // Limit to last 20 to avoid token limits on large history
                     const limited = filtered.slice(-20);
                     systemResponseData = `Найдено транзакций: ${filtered.length}. ОБЩАЯ СУММА: ${totalSum} ₽.\nСписок:\n` + limited.map(t => 
                        `- ${t.date} | ${t.type === 'INCOME' ? 'Доход' : 'Расход'} | ${t.category} | ${t.amount}₽`
                     ).join('\n');
                     if (filtered.length > 20) systemResponseData += `\n...и еще ${filtered.length - 20} записей.`;
                 }
             } else if (call.name === 'getBalance') {
                 const { date } = call.args;
                 if (date) {
                    // Calculate running balance up to this date
                    let runningBalance = 0;
                    // Sort all transactions by date
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

      // If we got tool data (read operation), feed it back to AI
      if (systemResponseData !== null) {
          try {
             const history = getHistory();
             const dataPrompt = `[SYSTEM_DATA_RESPONSE]\n${systemResponseData}\n\nОтветь пользователю на основе этих данных. Если это был вопрос о сумме, обязательно назови итоговую цифру.`;
             const nextResult = await generateAIResponse(dataPrompt, history);
             await processAIResult(nextResult);
          } catch (e) {
             console.error(e);
             setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: "Ошибка анализа данных.", timestamp: new Date() }]);
             setLoading(false);
          }
          return; // Stop processing, we deferred to next call
      }

      if (drafts.length > 0) {
          openTransactionModal('CONFIRM', drafts);
      }

      if (responseText) {
          setMessages(prev => [...prev, { 
            id: (Date.now() + 1).toString(), 
            role: 'assistant', 
            content: responseText,
            timestamp: new Date()
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
      
      // Capture history
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

  const formatCurrency = (val: number, isExpense: boolean = false) => {
    // Add visual minus if it's an expense and > 0
    const prefix = isExpense && val > 0 ? '-' : '';
    return prefix + val.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
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

  const getCashGapDisplay = () => {
    if (!summary.cashGap) return 'Нет';
    const days = differenceInCalendarDays(parseISO(summary.cashGap.date), new Date());
    if (days <= 0) return 'Сегодня';
    return `${days} д.`;
  };

  const stats = [
    { label: 'Поступления', value: formatCurrency(summary.income) },
    { label: 'Все расходы', value: formatCurrency(summary.expense, true) },
    { label: 'Доход в день', value: formatCurrency(summary.avgDailyIncome) },
    { label: 'Расход в день', value: formatCurrency(summary.avgDailyExpense, true) },
    { label: 'На конец мес.', value: formatCurrency(summary.projectedBalance) },
    { label: 'Кассовый разрыв', value: getCashGapDisplay() },
  ];

  // Extended Wave Data for a fuller look (Reduced by ~15% length)
  const waveData = [
    15, 30, 20, 45, 30, 60, 45, 80, 50, 70, 45, 30, 
    55, 75, 50, 30, 60, 40, 75, 55, 30, 45, 20, 60, 
    80
  ];

  return (
    <div className="flex flex-col h-full bg-fin-bg overflow-hidden mt-2.5">
      
      {/* Stats Dashboard */}
      <div 
          className={`px-4 transition-all duration-300 ease-in-out overflow-hidden shrink-0 ${
              isStatsOpen ? 'max-h-[500px] mb-4 opacity-100' : 'max-h-0 mb-0 opacity-0'
          }`}
      >
        <div className="grid grid-cols-2 gap-3 py-2">
          {stats.map((stat, idx) => (
            <div key={idx} className="bg-fin-card border border-fin-border rounded-card p-4 flex flex-col justify-between h-24 shadow-sm">
              <span className="text-fin-textTert text-xs font-medium">{stat.label}</span>
              <span className="text-fin-text text-xl font-medium tracking-tight">{stat.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 px-4 pb-1 min-h-0 flex flex-col">
        {/* Chat Card Container */}
        <div className="bg-fin-card rounded-3xl flex-1 flex flex-col border border-fin-border relative overflow-hidden shadow-sm">
          
          {/* Messages List */}
          <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-6 pt-6">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                
                {/* Message Header (Name + Date) */}
                <span className={`text-[10px] text-fin-textTert mb-1.5 font-medium tracking-wide ${msg.role === 'user' ? 'px-1' : 'px-0'}`}>
                    {getMessageDateLabel(msg.timestamp, msg.role)}
                </span>

                {/* Message Bubble */}
                <div className={`
                  text-[14px] font-normal tracking-[0] leading-[1.35] transition-all max-w-[75%]
                  ${msg.role === 'user' 
                    ? 'bg-fin-accent text-white rounded-2xl rounded-br-none shadow-md p-3.5' 
                    : 'bg-transparent text-fin-text pt-0 pb-1'} 
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
                           
                           {/* Fin-Tech Waveform: Vertical, Centered, Thin lines */}
                           <div className="flex-1 flex items-center justify-center gap-[2px] h-8 mx-2 select-none pointer-events-none">
                              {waveData.map((h, i) => (
                                <div 
                                  key={i} 
                                  className={`
                                    w-[2px] rounded-full transition-all duration-300
                                    ${playingMsgId === msg.id ? 'bg-white' : 'bg-white/40'}
                                  `}
                                  style={{
                                      height: `${Math.max(20, h)}%`,
                                      // Subtle pulse scale when playing for "Active" feel without messy animation
                                      transform: playingMsgId === msg.id ? 'scaleY(1.1)' : 'scaleY(1)'
                                  }}
                                />
                              ))}
                           </div>

                           <span className="text-[10px] font-mono opacity-80 tracking-widest ml-auto shrink-0 pt-0.5">
                               {formatDuration(msg.duration)}
                           </span>
                       </div>
                   ) : msg.content}
                </div>
              </div>
            ))}
            
            {loading && (
               <div className="flex items-center gap-2 text-fin-textTert text-xs pl-0 mt-2">
                 <Loader2 className="animate-spin" size={12} />
                 <span>Анализирую...</span>
               </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-fin-card shrink-0 flex items-end justify-between gap-4">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={handleFileUpload}
            />
            
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? "Запись..." : "Сообщение..."}
              className="bg-transparent border-none outline-none text-fin-textTert placeholder-fin-textTert/50 text-base font-medium flex-1 resize-none py-2 max-h-[160px] overflow-y-auto no-scrollbar"
              disabled={loading || isRecording}
            />

            <button 
              onClick={input.length > 0 ? handleSendText : handleMicClick}
              disabled={loading}
              className={`w-[46px] h-[46px] rounded-full flex items-center justify-center shadow-md hover:scale-105 transition-all active:scale-95 shrink-0 ${
                  isRecording ? 'bg-fin-error text-white animate-pulse' : 'bg-fin-accent text-white'
              }`}
            >
              {input.length > 0 ? (
                  <Send size={20} className="ml-0.5" /> 
              ) : isRecording ? (
                  <Square size={18} fill="currentColor" />
              ) : (
                  <Mic size={24} />
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}