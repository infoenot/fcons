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

// Маленький аватар автора транзакции
const AuthorAvatar: React.FC<{ addedBy?: Transaction['addedBy'] }> = ({ addedBy }) => {
  if (!addedBy) return null;
  const initials = addedBy.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div className="shrink-0 mr-3 self-center" title={addedBy.name}>
      {addedBy.avatar ? (
        <img
          src={addedBy.avatar}
          alt={addedBy.name}
          className="w-8 h-8 rounded-full object-cover border border-fin-border"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-fin-bgSec border border-fin-border flex items-center justify-center text-fin-accent font-bold text-xs">
          {initials}
        </div>
      )}
    </div>
  );
};

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
  const { deleteTransaction, openTransactionModal, updateTransaction, spaceMembers } = useFinance();
  const { setMessages } = useChat();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // Показываем аватары только если участников > 1
  const showAvatars = spaceMembers.length > 1;

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
    if (onTitleChange && tempTitle.trim()) onTitleChange(tempTitle.trim());
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveTitle();
    if (e.key === 'Escape') { setIsEditingTitle(false); setTempTitle(title); }
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
        <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar pb-6">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-fin-textTert opacity-60">
              <span className="text-3xl mb-2">📭</span>
              <span className="text-sm">Нет операций</span>
            </div>
          ) : (
            transactions.map(t => {
              if (mode === 'NOTIFICATIONS') {
                return (
                  <div key={t.id} className="bg-fin-bgSec border border-fin-border rounded-xl p-4 flex flex-col gap-3">
                    <div onClick={() => handleEdit(t)} className="flex items-start gap-0 cursor-pointer">
                      {showAvatars && <AuthorAvatar addedBy={t.addedBy} />}
                      <div className="flex-1 flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <span className="font-semibold text-fin-text text-base truncate">{t.category}</span>
                          <span className={`font-medium text-base whitespace-nowrap ${t.type === 'INCOME' ? 'text-fin-success' : 'text-fin-text'}`}>
                            {t.type === 'INCOME' ? '+' : '-'}{t.amount.toLocaleString('ru-RU')} ₽
                          </span>
                        </div>
                        <div className="flex justify-between items-end">
                          <span className="text-xs text-fin-textTert">
                            {capitalize(format(parseISO(t.date), 'd MMM, eee', { locale: ru }))}.
                          </span>
                          <div className="w-6 h-6 rounded-full bg-fin-bg flex items-center justify-center border border-fin-border">
                            <span className="text-xs font-semibold text-fin-textSec">
                              {t.status === 'PLANNED' ? 'П' : 'Ф'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end pt-2 border-t border-fin-border/30 mt-1">
                      <button
                        onClick={() => handleConfirm(t)}
                        className="flex-1 py-2 bg-fin-success/10 border border-fin-success/20 text-fin-success rounded-lg flex items-center justify-center gap-1.5 hover:bg-fin-success/20 transition-all active:scale-95"
                      >
                        <Check size={14} strokeWidth={2.5} /> <span className="text-xs font-bold">Подтвердить</span>
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={t.id}
                  onClick={() => handleEdit(t)}
                  className="bg-fin-bgSec border border-fin-border rounded-xl p-4 flex items-center cursor-pointer hover:bg-fin-card transition-all"
                >
                  {showAvatars && <AuthorAvatar addedBy={t.addedBy} />}
                  <div className="flex-1 flex flex-col gap-3">
                    {/* Top Row */}
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-semibold text-fin-text text-base truncate">{t.category}</span>
                        {t.recurrence !== 'NONE' && (<Repeat size={14} className="text-fin-textTert shrink-0" />)}
                      </div>
                      <span className={`font-medium text-base whitespace-nowrap ${t.type === 'INCOME' ? 'text-fin-success' : 'text-fin-text'}`}>
                        {t.type === 'INCOME' ? '+' : '-'}{t.amount.toLocaleString('ru-RU')} ₽
                      </span>
                    </div>
                    {/* Bottom Row */}
                    <div className="flex justify-between items-end">
                      <span className="text-xs text-fin-textTert">
                        {capitalize(format(parseISO(t.date), 'd MMM, eee', { locale: ru }))}.
                      </span>
                      <div className="w-6 h-6 rounded-full bg-fin-bg flex items-center justify-center border border-fin-border">
                        <span className="text-xs font-semibold text-fin-textSec">
                          {t.status === 'PLANNED' ? 'П' : 'Ф'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
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
