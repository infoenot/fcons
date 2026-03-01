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
  const { pendingConfirmations, updateTransaction, deleteTransaction, spaceMembers } = useFinance();
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
                      <div className="flex items-center">
                        {/* Аватар автора */}
                        {spaceMembers.length > 1 && tx.addedBy ? (
                            tx.addedBy.avatar ? (
                                <img src={tx.addedBy.avatar} alt={tx.addedBy.name} title={tx.addedBy.name} className="w-8 h-8 rounded-full object-cover border border-fin-border shrink-0 mr-3" />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-fin-bgSec border border-fin-border flex items-center justify-center text-fin-accent font-bold text-xs shrink-0 mr-3" title={tx.addedBy.name}>
                                    {tx.addedBy.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                                </div>
                            )
                        ) : null}
                        {/* Основное содержимое */}
                        <div className="flex-1 flex flex-col gap-2">
                            <div className="flex justify-between items-start">
                                <span className="font-semibold text-fin-text text-base truncate">{tx.category}</span>
                                <span className={`font-medium text-base whitespace-nowrap ${tx.type === 'INCOME' ? 'text-fin-success' : 'text-fin-text'}`}>
                                    {tx.type === 'INCOME' ? '+' : '-'}{tx.amount.toLocaleString('ru-RU')} ₽
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-fin-textTert">
                                    {format(parseISO(tx.date), 'd MMM, eee', { locale: ru }).replace(/\./g, '')}
                                </span>
                                <div className="flex items-center gap-1.5">
                                    {/* Компактные кнопки действий */}
                                    <button
                                        onClick={() => startEdit(tx)}
                                        className="p-1.5 text-fin-textTert hover:text-fin-accent hover:bg-fin-accent/10 rounded-lg transition-colors"
                                        title="Редактировать"
                                    >
                                        <Edit2 size={13} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(tx.id)}
                                        className="p-1.5 text-fin-textTert hover:text-fin-error hover:bg-fin-error/10 rounded-lg transition-colors"
                                        title="Удалить"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                    <button
                                        onClick={() => handleConfirm(tx.id)}
                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-fin-success/10 border border-fin-success/30 text-fin-success rounded-lg text-xs font-bold hover:bg-fin-success/20 transition-all active:scale-95"
                                    >
                                        <Check size={11} strokeWidth={2.5} /> Факт
                                    </button>
                                </div>
                            </div>
                        </div>
                      </div>
                  )}
               </div>
             ))}
          </div>
       </div>
    </div>
  );
};

export default NotificationsModal;