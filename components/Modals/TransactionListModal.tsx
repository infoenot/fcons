import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Transaction } from '../../types';
import { X, Plus, Edit2, Trash2, Check, Repeat, Pencil, CheckCheck } from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { useChat } from '../../context/ChatContext';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

interface TransactionListModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  transactions: Transaction[];
  mode?: 'DEFAULT' | 'NOTIFICATIONS';
  onAdd?: () => void;
  onTitleChange?: (newTitle: string) => void;
}

const TransactionListModal: React.FC<TransactionListModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  transactions,
  mode = 'DEFAULT',
  onAdd,
  onTitleChange
}) => {
  const { deleteTransaction, openTransactionModal, updateTransaction } = useFinance();
  const { setMessages } = useChat();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTempTitle(title);
  }, [title]);

  useEffect(() => {
      if (isEditingTitle && titleInputRef.current) {
          titleInputRef.current.focus();
      }
  }, [isEditingTitle]);

  if (!isOpen) return null;

  const handleEdit = (t: Transaction) => {
    openTransactionModal('EDIT', t);
  };

  const handleDelete = (id: string) => {
    const t = transactions.find(tx => tx.id === id);
    if (confirm('Удалить эту операцию?')) {
      deleteTransaction(id);
      if (t) {
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'assistant',
            content: `Удалил операцию: ${t.category}, сумма ${t.amount} ₽.`,
            timestamp: new Date()
        }]);
      }
    }
  };

  const handleConfirm = (t: Transaction) => {
    updateTransaction({ ...t, status: 'ACTUAL' });
    setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Подтвердил выполнение операции: ${t.category}, ${t.amount} ₽.`,
        timestamp: new Date()
      }]);
  };

  const handleConfirmAll = () => {
    if (transactions.length === 0) return;
    
    transactions.forEach(t => {
      updateTransaction({ ...t, status: 'ACTUAL' });
    });

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Одобрил все запланированные операции (${transactions.length} шт.).`,
      timestamp: new Date()
    }]);
    
    onClose();
  };

  const saveTitle = () => {
      setIsEditingTitle(false);
      if (tempTitle.trim() && tempTitle !== title && onTitleChange) {
          onTitleChange(tempTitle.trim());
      } else {
          setTempTitle(title);
      }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') saveTitle();
      if (e.key === 'Escape') {
          setIsEditingTitle(false);
          setTempTitle(title);
      }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div onClick={onClose} className="absolute inset-0" />
      <div 
        className="bg-fin-card w-full max-w-md max-h-[85vh] h-[600px] rounded-[32px] p-6 border border-fin-border flex flex-col shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-5 duration-300 relative transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6 border-b border-fin-border pb-4 shrink-0 gap-4">
          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
                 <div className="flex items-center gap-2">
                     <input 
                        ref={titleInputRef}
                        type="text" 
                        value={tempTitle}
                        onChange={(e) => setTempTitle(e.target.value)}
                        onBlur={saveTitle}
                        onKeyDown={handleTitleKeyDown}
                        className="bg-fin-bgSec border border-fin-border rounded-lg px-2 py-1 text-xl font-bold text-fin-text outline-none focus:border-fin-accent w-full"
                     />
                 </div>
            ) : (
                <div className="flex items-center gap-2 group">
                    <h3 
                        className="text-xl font-bold text-fin-text truncate cursor-pointer"
                        onClick={() => onTitleChange && setIsEditingTitle(true)}
                    >
                        {title}
                    </h3>
                    {onTitleChange && (
                        <button onClick={() => setIsEditingTitle(true)} className="text-fin-textTert opacity-0 group-hover:opacity-100 transition-opacity hover:text-fin-accent">
                            <Pencil size={16} />
                        </button>
                    )}
                </div>
            )}
            
            {subtitle && <p className="text-fin-textSec text-sm mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 bg-fin-bgSec rounded-full hover:text-fin-text text-fin-textSec transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-3 no-scrollbar pb-6">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-fin-textTert opacity-60">
              <span className="text-3xl mb-2">📭</span>
              <span className="text-sm">Нет операций</span>
            </div>
          ) : (
            transactions.map(t => (
              <div key={t.id} className="flex flex-col gap-2 p-4 bg-fin-bgSec rounded-btn border border-fin-border group">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className={`w-1 h-8 rounded-full ${t.type === 'INCOME' ? 'bg-fin-success' : 'bg-fin-error'}`}></div>
                    <div>
                      <p className="font-semibold text-fin-text text-sm flex items-center gap-2">
                        {t.category}
                        {t.recurrence !== 'NONE' && (<Repeat size={12} className="text-fin-textTert" />)}
                      </p>
                      <div className="flex flex-col">
                          {t.description && <p className="text-xs text-fin-textTert">{t.description}</p>}
                          {mode === 'NOTIFICATIONS' && (
                              <p className="text-[10px] text-fin-textTert font-medium uppercase tracking-wider mt-0.5">
                                  {format(parseISO(t.date), 'd MMM', { locale: ru })}
                              </p>
                          )}
                      </div>
                      {t.status === 'PLANNED' && mode !== 'NOTIFICATIONS' && (
                          <span className="text-[10px] bg-fin-border px-2 py-0.5 rounded text-fin-textSec font-bold uppercase tracking-wider mt-1 inline-block">План</span>
                      )}
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${t.type === 'INCOME' ? 'text-fin-success' : 'text-fin-text'}`}>
                    {t.type === 'INCOME' ? '+' : '-'}{t.amount.toLocaleString()} ₽
                  </span>
                </div>

                {/* Actions */}
                <div className={`flex justify-end gap-2 pt-2 border-t border-fin-border/30 mt-1 transition-opacity ${mode === 'NOTIFICATIONS' ? 'opacity-100' : 'opacity-100 sm:opacity-0 group-hover:opacity-100'}`}>
                   {mode === 'NOTIFICATIONS' && (
                       <button 
                           onClick={() => handleConfirm(t)}
                           className="flex-1 py-1.5 bg-fin-success/10 border border-fin-success/20 text-fin-success rounded-lg flex items-center justify-center gap-1.5 hover:bg-fin-success/20 transition-all active:scale-95 mr-auto"
                       >
                           <Check size={14} strokeWidth={2.5} /> <span className="text-xs font-bold">Подтвердить</span>
                       </button>
                   )}
                   
                   <button onClick={() => handleEdit(t)} className="p-1.5 text-fin-textSec hover:text-fin-accent hover:bg-fin-accent/10 rounded-md transition-colors">
                       <Edit2 size={16} />
                   </button>
                   <button onClick={() => handleDelete(t.id)} className="p-1.5 text-fin-textSec hover:text-fin-error hover:bg-fin-error/10 rounded-md transition-colors">
                       <Trash2 size={16} />
                   </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {(onAdd || (mode === 'NOTIFICATIONS' && transactions.length > 0)) && (
          <div className="pt-4 border-t border-fin-border shrink-0 flex flex-col gap-2">
            {mode === 'NOTIFICATIONS' && transactions.length > 0 && (
              <button 
                onClick={handleConfirmAll} 
                className="w-full py-4 bg-fin-success hover:brightness-110 text-white rounded-btn font-bold text-base transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <CheckCheck size={20} /> Одобрить все
              </button>
            )}
            {onAdd && (
              <button 
                onClick={onAdd} 
                className="w-full py-4 bg-fin-accent hover:bg-fin-accentSec text-white rounded-btn font-bold text-base transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={20} /> Добавить операцию
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default TransactionListModal;