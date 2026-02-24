import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { useChat } from '../../context/ChatContext';
import { Check, Trash2, Edit2, X, Save, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

interface NotificationsModalProps {
  onClose: () => void;
}

const NotificationsModal: React.FC<NotificationsModalProps> = ({ onClose }) => {
  const { pendingConfirmations, updateTransaction, deleteTransaction } = useFinance();
  const { setMessages } = useChat();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{amount: string, date: string}>({ amount: '', date: '' });

  const handleConfirm = (id: string) => {
    const tx = pendingConfirmations.find(t => t.id === id);
    if (tx) {
      updateTransaction({ ...tx, status: 'ACTUAL' });
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Подтвердил плановую операцию: ${tx.category}, сумма ${tx.amount} ₽.`,
        timestamp: new Date()
      }]);
    }
  };

  const startEdit = (tx: any) => {
    setEditingId(tx.id);
    setEditValues({ amount: tx.amount.toString(), date: tx.date });
  };

  const saveEdit = (id: string) => {
    const tx = pendingConfirmations.find(t => t.id === id);
    if (tx) {
      const newAmount = parseFloat(editValues.amount) || tx.amount;
      updateTransaction({
        ...tx,
        amount: newAmount,
        date: editValues.date || tx.date
      });
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Обновил данные транзакции в категории ${tx.category}. Новая сумма: ${newAmount} ₽.`,
        timestamp: new Date()
      }]);
      setEditingId(null);
    }
  };

  const handleDelete = (id: string) => {
    const tx = pendingConfirmations.find(t => t.id === id);
    if (tx) {
        deleteTransaction(id);
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'assistant',
            content: `Удалил запланированную операцию: ${tx.category}, ${tx.amount} ₽.`,
            timestamp: new Date()
        }]);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
       {/* Modal Overlay to close on click outside */}
       <div className="absolute inset-0" onClick={onClose}></div>
       
       <div 
         className="relative bg-fin-card w-full max-w-sm rounded-card border border-fin-border shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200"
         onClick={(e) => e.stopPropagation()}
       >
          <div className="p-4 border-b border-fin-border flex justify-between items-center bg-fin-bgSec">
            <div className="flex items-center gap-2">
                <AlertCircle className="text-fin-accent" size={20} />
                <h3 className="text-lg font-bold text-fin-text tracking-wide">Уведомления</h3>
            </div>
            <button onClick={onClose} className="text-fin-textTert hover:text-fin-text transition-colors p-1 bg-fin-bg rounded-md">
                <X size={18} />
            </button>
          </div>
          
          <div className="overflow-y-auto p-4 space-y-3 no-scrollbar">
             {pendingConfirmations.length === 0 && (
                 <div className="text-center text-fin-textTert py-10 flex flex-col items-center">
                    <Check className="mb-3 text-fin-textTert opacity-50" size={32} />
                    <span>Все чисто</span>
                    <span className="text-xs opacity-60 mt-1">Нет транзакций для подтверждения</span>
                 </div>
             )}
             
             {pendingConfirmations.map(tx => (
               <div key={tx.id} className="bg-fin-bg rounded-xl p-3 border border-fin-border/50 flex flex-col gap-3 shadow-sm">
                  {editingId === tx.id ? (
                      // EDIT MODE
                      <div className="flex flex-col gap-2.5">
                          <div className="flex justify-between items-center px-1">
                              <span className="text-sm font-medium text-fin-accent">{tx.category}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input 
                                type="number" 
                                value={editValues.amount}
                                onChange={e => setEditValues({...editValues, amount: e.target.value})}
                                className="bg-fin-bgSec border border-fin-border rounded-input px-3 py-2 text-fin-text text-sm outline-none focus:border-fin-accent transition-colors"
                                placeholder="Сумма"
                            />
                            <input 
                                type="date" 
                                value={editValues.date}
                                onChange={e => setEditValues({...editValues, date: e.target.value})}
                                className="bg-fin-bgSec border border-fin-border rounded-input px-3 py-2 text-fin-text text-sm outline-none focus:border-fin-accent transition-colors"
                            />
                          </div>
                          <div className="flex gap-2 mt-1">
                              <button onClick={() => saveEdit(tx.id)} className="flex-1 bg-fin-accent text-white py-2 rounded-btn text-sm font-bold hover:bg-fin-accentSec transition-colors flex items-center justify-center gap-1.5">
                                  <Save size={14} /> Сохранить
                              </button>
                              <button onClick={() => setEditingId(null)} className="px-3 bg-fin-card border border-fin-border text-fin-textTert rounded-btn hover:text-fin-text transition-colors">
                                  <X size={16} />
                              </button>
                          </div>
                      </div>
                  ) : (
                      // VIEW MODE
                      <>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`w-1 h-8 rounded-full ${tx.type === 'INCOME' ? 'bg-fin-success' : 'bg-fin-textSec'}`}></div>
                                <div>
                                    <div className="font-bold text-fin-text text-sm">{tx.category}</div>
                                    <div className="text-[10px] text-fin-textTert font-medium uppercase tracking-wider">
                                        {format(parseISO(tx.date), 'd MMM', { locale: ru })} • План
                                    </div>
                                </div>
                            </div>
                            <div className="font-mono font-bold text-fin-text">{tx.amount.toLocaleString()} ₽</div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-fin-border/30">
                            <button onClick={() => handleConfirm(tx.id)} className="flex-1 py-2 bg-fin-success/10 border border-fin-success/20 text-fin-success rounded-lg flex items-center justify-center gap-1.5 hover:bg-fin-success/20 transition-all active:scale-95">
                                <Check size={14} strokeWidth={2.5} /> <span className="text-xs font-bold">Подтвердить</span>
                            </button>
                            <button onClick={() => startEdit(tx)} className="p-2 text-fin-textSec hover:text-fin-accent hover:bg-fin-accent/10 rounded-lg transition-colors border border-transparent hover:border-fin-accent/20">
                                <Edit2 size={16} />
                            </button>
                            <button onClick={() => handleDelete(tx.id)} className="p-2 text-fin-textSec hover:text-fin-error hover:bg-fin-error/10 rounded-lg transition-colors border border-transparent hover:border-fin-error/20">
                                <Trash2 size={16} />
                            </button>
                        </div>
                      </>
                  )}
               </div>
             ))}
          </div>
       </div>
    </div>
  );
};

export default NotificationsModal;