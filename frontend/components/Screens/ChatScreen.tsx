
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Loader2, Send, Square, Play, Pause, Edit2, Trash2, Repeat, Check, Plus, Camera, Image } from 'lucide-react';
import { generateAIResponse } from '../../services/polzaService';
import { useFinance } from '../../context/FinanceContext';
import { useChat, Message } from '../../context/ChatContext';
import { format, differenceInCalendarDays, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Transaction } from '../../types';
import BottomSheet from '../Shared/BottomSheet';

export default function ChatScreen() {
  const [input, setInput] = useState('');
  const { messages, setMessages } = useChat(); 
  
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { openTransactionModal, transactions, deleteTransactions, spaceMembers } = useFinance();

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
                const result = await generateAIResponse("", history, undefined, base64Audio, mimeType, spaceMembers.map(m => m.name));
                await processAIResult(result);
            } catch (e: any) {
                console.error(e);
                let errorMessage = "Ошибка обработки аудио.";
                if (e.message === "API_KEY_NOT_CONFIGURED") {
                    errorMessage = "Ключ API не настроен. Убедитесь, что переменная окружения API_KEY задана в настройках вашего хостинга.";
                } else if (e.message === "QUOTA_EXCEEDED") {
                    errorMessage = "Лимит бесплатных запросов к AI на сегодня исчерпан. Пожалуйста, попробуйте позже или завтра.";
                }
                setMessages(prev => [...prev, { id: (Date.now()+1).toString(), role: 'assistant', content: errorMessage, timestamp: new Date() }]);
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
    
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const isDeleteCommand = /удали|удалить|убери/.test(input.toLowerCase());

    if (isDeleteCommand && lastMessage && lastMessage.role === 'assistant' && lastMessage.transactions && lastMessage.transactions.length > 0) {
        setMessages(prev => [...prev, userMsg]);
        const transactionsToDelete = lastMessage.transactions;
        const confirmationMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: "",
            timestamp: new Date(),
            prompt: {
                type: 'delete',
                question: `Вы уверены, что хотите удалить ${transactionsToDelete.length} транзакций? Это действие необратимо.`,
                transactions: transactionsToDelete,
            }
        };
        setMessages(prev => [...prev, confirmationMsg]);
        setInput('');
        return; 
    }
    
    const history = getHistory();
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const result = await generateAIResponse(userMsg.content, history, undefined, undefined, undefined, spaceMembers.map(m => m.name));
      await processAIResult(result);
    } catch (error: any) {
      let errorMessage = "Ошибка соединения.";
      if (error.message === "API_KEY_NOT_CONFIGURED") {
        errorMessage = "Ключ API не настроен. Убедитесь, что переменная окружения API_KEY задана в настройках вашего хостинга.";
      } else if (error.message === "QUOTA_EXCEEDED") {
        errorMessage = "Лимит бесплатных запросов к AI на сегодня исчерпан. Пожалуйста, попробуйте позже или завтра.";
      }
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'assistant', 
        content: errorMessage,
        timestamp: new Date()
      }]);
      setLoading(false);
    }
  };

  const handlePromptResponse = (messageId: string, confirmed: boolean) => {
    const originalMessage = messages.find(m => m.id === messageId);
    if (!originalMessage || !originalMessage.prompt || originalMessage.prompt.responded) return;

    setMessages(prev => prev.map(m => 
        m.id === messageId 
            ? { ...m, prompt: { ...m.prompt!, responded: true } } 
            : m
    ));
    
    const { type, transactions: promptTransactions } = originalMessage.prompt;

    if (confirmed) {
        if (type === 'show') {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: "Вот запрошенные транзакции:",
                timestamp: new Date(),
                transactions: promptTransactions
            }]);
        } else if (type === 'delete') {
            const idsToDelete = promptTransactions.map(t => t.id);
            deleteTransactions(idsToDelete);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: `Удалил ${idsToDelete.length} транзакций.`,
                timestamp: new Date(),
            }]);
        }
    } else {
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'assistant',
            content: type === 'delete' ? "Удаление отменено." : "Ок.",
            timestamp: new Date()
        }]);
    }
  };

  const processAIResult = async (result: any) => {
      const responseText = result.text; 
      const functionCalls = result.functionCalls;
      
      const drafts: Partial<Transaction>[] = [];

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
                 const { startDate, endDate, category, type, status, addedByName } = call.args;
                 let filtered = transactions;
                 
                 if (type) filtered = filtered.filter(t => t.type === type);
                 if (category) filtered = filtered.filter(t => t.category.toLowerCase().includes(category.toLowerCase()));
                 if (startDate) filtered = filtered.filter(t => t.date >= startDate);
                 if (endDate) filtered = filtered.filter(t => t.date <= endDate);
                 if (status) filtered = filtered.filter(t => t.status === status);
                 if (addedByName) {
                   const selfNames = ['я', 'мои', 'мои транзакции', 'моё'];
                   const isSelf = selfNames.some(s => addedByName.toLowerCase().includes(s));
                   if (isSelf) {
                     filtered = filtered.filter(t => t.addedBy?.telegramId === currentUser?.telegramId?.toString());
                   } else {
                     filtered = filtered.filter(t => t.addedBy?.name.toLowerCase().includes(addedByName.toLowerCase()));
                   }
                 }

                 if (filtered.length === 0) {
                    setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: "Транзакции не найдены.", timestamp: new Date() }]);
                 } else {
                    const totalSum = filtered.reduce((sum, t) => sum + (t.type === 'INCOME' ? t.amount : -t.amount), 0);
                    const statusText = status === 'PLANNED' ? 'запланированных ' : status === 'ACTUAL' ? 'фактических ' : '';
                    const question = filtered.length > 30 
                      ? `Найдено ${filtered.length} ${statusText}транзакций. Точно показать?`
                      : `Найдено ${filtered.length} ${statusText}транзакций на общую сумму ${totalSum.toLocaleString()} ₽. Показать их?`;
                    
                    setMessages(prev => [...prev, {
                        id: (Date.now() + 1).toString(),
                        role: 'assistant',
                        content: "",
                        timestamp: new Date(),
                        prompt: {
                            type: 'show',
                            question,
                            transactions: filtered,
                        }
                    }]);
                 }
                 setLoading(false);
                 return;
             } else if (call.name === 'getBalance') {
                 const { date } = call.args;
                 let runningBalance = 0;
                 if (date) {
                    const sorted = [...transactions]
                      .filter(t => t.includeInBalance)
                      .sort((a, b) => new Date(a.date).getTime() - new Date(a.date).getTime());
                    
                    for (const t of sorted) {
                        if (t.date <= date) {
                            if (t.type === 'INCOME') runningBalance += t.amount;
                            else runningBalance -= t.amount;
                        }
                    }
                 }
                 setMessages(prev => [...prev, {
                     id: (Date.now() + 1).toString(),
                     role: 'assistant',
                     content: `Баланс на ${date} составляет: ${runningBalance.toLocaleString()} ₽.`,
                     timestamp: new Date()
                 }]);
             }
        }
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
          }]);
      } else if (drafts.length === 0 && (!functionCalls || functionCalls.length === 0)) {
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

      const reader = new FileReader();

      reader.onload = async (event) => {
          if (!event.target?.result || typeof event.target.result !== 'string') return;
          
          const imageUrl = event.target.result;
          const base64 = imageUrl.split(',')[1];
          const history = getHistory();
          
          const userMsg: Message = { 
            id: Date.now().toString(), 
            role: 'user', 
            content: "",
            timestamp: new Date(),
            imageUrl: imageUrl,
          };

          setMessages(prev => [...prev, userMsg]);
          setLoading(true);

          try {
             const result = await generateAIResponse("", history, base64, undefined, undefined, spaceMembers.map(m => m.name));
             await processAIResult(result);
          } catch (err: any) {
              console.error(err);
              let errorMessage = "Ошибка обработки изображения.";
              if (err.message === "QUOTA_EXCEEDED") {
                  errorMessage = "Лимит бесплатных запросов к AI на сегодня исчерпан. Пожалуйста, попробуйте позже.";
              }
              setMessages(prev => [...prev, { id: (Date.now()+1).toString(), role: 'assistant', content: errorMessage, timestamp: new Date() }]);
              setLoading(false);
          }
      };

      reader.readAsDataURL(file);
      e.target.value = '';
  };
  
  const formatDuration = (seconds?: number) => {
      if (!seconds) return "00:00";
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getMessageDateLabel = (date: Date, role: 'user' | 'assistant') => {
      const name = role === 'user' ? 'Вы' : 'Ассистент';
      const dateStr = format(date, 'd MMM, eee, HH:mm', { locale: ru }).replace(/\./g, '');
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
        
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-6 px-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              
              <span className={`text-[10px] text-fin-textTert mb-1.5 font-medium tracking-wide ${msg.role === 'assistant' ? 'pr-1' : 'px-1'}`}>
                  {getMessageDateLabel(msg.timestamp, msg.role)}
              </span>

              { msg.imageUrl && msg.role === 'user' ? (
                <div className="max-w-[85%] rounded-2xl rounded-br-none shadow-md overflow-hidden bg-fin-accent">
                    <img src={msg.imageUrl} alt="Фото чека" className="block w-full h-auto" />
                </div>
              ) : (
                <div className={`
                  text-[14px] font-normal tracking-[0] leading-[1.35] transition-all
                  ${msg.role === 'user' 
                    ? 'bg-fin-accent text-white rounded-2xl rounded-br-none shadow-md p-3.5 max-w-[85%]' 
                    : `text-left text-fin-text ${msg.transactions && msg.transactions.length > 0 ? 'w-full' : 'max-w-[78%]'}`} 
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
                        {msg.content && <div>{msg.content}</div>}

                        {msg.prompt && (
                            <div className="mt-2 space-y-3 animate-in fade-in">
                                <p className="text-sm font-medium">{msg.prompt.question}</p>
                                {!msg.prompt.responded && (
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handlePromptResponse(msg.id, true)}
                                            className={`px-4 py-1.5 rounded-btn text-xs font-bold transition-colors ${
                                                msg.prompt.type === 'delete' 
                                                ? 'bg-fin-error/10 border border-fin-error/30 text-fin-error hover:bg-fin-error/20' 
                                                : 'bg-fin-success/10 border border-fin-success/30 text-fin-success hover:bg-fin-success/20'
                                            }`}
                                        >Да</button>
                                        <button 
                                            onClick={() => handlePromptResponse(msg.id, false)} 
                                            className="px-4 py-1.5 bg-fin-bgSec border border-fin-border text-fin-textSec rounded-btn text-xs font-bold hover:bg-fin-card transition-colors"
                                        >Нет</button>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {msg.transactions && msg.transactions.length > 0 && (
                          <div className="space-y-2 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                             {msg.transactions.map((tx) => (
                               <ChatTransactionCard 
                                 key={tx.id} 
                                 transaction={tx} 
                                 onEdit={() => openTransactionModal('EDIT', tx)}
                                 showAvatar={spaceMembers.length > 1}
                               />
                             ))}
                          </div>
                        )}
                     </div>
                   )}
                </div>
              )}
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

        <div className="bg-fin-card rounded-3xl border border-fin-border p-4 flex items-end justify-between gap-3 shadow-sm shrink-0">
          <input type="file" ref={galleryInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
          <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
          <textarea ref={textareaRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={isRecording ? "Запись..." : "Жду указаний..."} className="bg-transparent border-none outline-none text-fin-text placeholder-fin-textTert/50 text-base font-medium flex-1 resize-none py-2 max-h-[160px] overflow-y-auto no-scrollbar placeholder:text-sm placeholder:font-normal" disabled={loading || isRecording} />
          
          <div className="flex items-center shrink-0 gap-4">
            <button
                onClick={() => setIsSheetOpen(true)}
                disabled={loading || isRecording}
                className="w-5 h-5 flex items-center justify-center text-fin-textTert hover:text-fin-text transition-colors rounded-full border border-fin-textTert"
                aria-label="Прикрепить фото"
            >
                <Plus size={14} />
            </button>
            <button onClick={input.length > 0 ? handleSendText : handleMicClick} disabled={loading} className={`w-[46px] h-[46px] rounded-full flex items-center justify-center shadow-md hover:scale-105 transition-all active:scale-95 ${isRecording ? 'bg-fin-error text-white animate-pulse' : 'bg-fin-accent text-white'}`}>
              {input.length > 0 ? <Send size={20} className="ml-0.5" /> : isRecording ? <Square size={18} fill="currentColor" /> : <Mic size={24} />}
            </button>
          </div>
        </div>
      </div>
      <BottomSheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)}>
        <div className="grid grid-cols-2 gap-4 p-4 pt-2">
          <button
            onClick={() => {
              cameraInputRef.current?.click();
              setIsSheetOpen(false);
            }}
            className="flex flex-col items-center justify-center gap-3 py-5 bg-fin-bgSec rounded-card border border-fin-border hover:border-fin-accent transition-colors active:scale-95"
          >
            <Camera size={28} className="text-fin-accent" />
            <span className="text-sm font-medium text-fin-text">Камера</span>
          </button>
          <button
            onClick={() => {
              galleryInputRef.current?.click();
              setIsSheetOpen(false);
            }}
            className="flex flex-col items-center justify-center gap-3 py-5 bg-fin-bgSec rounded-card border border-fin-border hover:border-fin-accent transition-colors active:scale-95"
          >
            <Image size={28} className="text-fin-accent" />
            <span className="text-sm font-medium text-fin-text">Галерея</span>
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

interface ChatTransactionCardProps {
  transaction: Transaction;
  onEdit: () => void;
  showAvatar?: boolean;
}

const ChatTransactionCard: React.FC<ChatTransactionCardProps> = ({ transaction, onEdit, showAvatar }) => {
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const author = transaction.addedBy;
  const initials = author?.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '';
  return (
    <div 
      onClick={onEdit}
      className="bg-fin-bgSec border border-fin-border rounded-xl p-4 flex items-center cursor-pointer hover:bg-fin-card transition-all w-full"
    >
      {showAvatar && author && (
        <div className="shrink-0 mr-3 self-center" title={author.name}>
          {author.avatar ? (
            <img src={author.avatar} alt={author.name} className="w-8 h-8 rounded-full object-cover border border-fin-border" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-fin-bgSec border border-fin-border flex items-center justify-center text-fin-accent font-bold text-xs">{initials}</div>
          )}
        </div>
      )}
      <div className="flex-1 flex flex-col gap-3">
        {/* Top Row */}
        <div className="flex justify-between items-start">
          <span className="font-semibold text-fin-text text-base truncate">{transaction.category}</span>
          <span className={`font-medium text-base whitespace-nowrap ${transaction.type === 'INCOME' ? 'text-fin-success' : 'text-fin-text'}`}>
            {transaction.type === 'INCOME' ? '+' : '-'}{transaction.amount.toLocaleString('ru-RU')} ₽
          </span>
        </div>
        {/* Bottom Row */}
        <div className="flex justify-between items-end">
          <span className="text-xs text-fin-textTert">
            {capitalize(format(parseISO(transaction.date), 'd MMM, eee', { locale: ru }))}.
          </span>
          <div className="w-6 h-6 rounded-full bg-fin-bg flex items-center justify-center border border-fin-border">
            <span className="text-xs font-semibold text-fin-textSec">
              {transaction.status === 'PLANNED' ? 'П' : 'Ф'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
