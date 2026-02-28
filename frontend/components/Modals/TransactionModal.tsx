import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useFinance } from '../../context/FinanceContext';
import { useChat } from '../../context/ChatContext';
import { ArrowLeft, Trash2, AlertTriangle, Plus, Delete } from 'lucide-react';
import { Recurrence, Transaction, TransactionType } from '../../types';
import { format, addDays, addMonths, addYears, parseISO, isBefore, isSameDay, subDays } from 'date-fns';

interface TransactionDraft extends Partial<Transaction> {
  tempId: string;
}

const RECURRENCE_OPTIONS = [
  { value: Recurrence.NONE, label: 'Разово' },
  { value: Recurrence.DAILY, label: 'Каждый день' },
  { value: Recurrence.WEEKLY, label: 'Каждую неделю' },
  { value: Recurrence.MONTHLY, label: 'Каждый месяц' },
  { value: Recurrence.YEARLY, label: 'Каждый год' },
];

const TransactionModal: React.FC = () => {
  const { modalState, closeTransactionModal, addTransaction, addTransactions, updateTransaction, addCategory, categories, deleteTransaction } = useFinance();
  const { isOpen, mode, drafts: initialDrafts } = modalState;
  const { setMessages } = useChat();

  const [drafts, setDrafts] = useState<TransactionDraft[]>([]);
  const [activeIndex] = useState(0);
  const [amountStr, setAmountStr] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRecurrenceSheet, setShowRecurrenceSheet] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShowDeleteConfirm(false);
      setShowRecurrenceSheet(false);
      setNewCategoryName('');
      setShowAddCategory(false);

      const d = initialDrafts?.[0];
      const draft: TransactionDraft = {
        tempId: `draft-0-${Date.now()}`,
        type: d?.type || 'EXPENSE',
        amount: d?.amount,
        date: d?.date || format(new Date(), 'yyyy-MM-dd'),
        status: d?.status || 'ACTUAL',
        recurrence: d?.recurrence || Recurrence.NONE,
        recurrenceEndDate: d?.recurrenceEndDate || format(addMonths(new Date(), 1), 'yyyy-MM-dd'),
        includeInBalance: d?.includeInBalance !== undefined ? d.includeInBalance : true,
        description: '',
        category: d?.category || '',
        id: d?.id,
      };
      setDrafts([draft]);
      setAmountStr(d?.amount ? String(d.amount) : '');
    } else {
      setDrafts([]);
      setAmountStr('');
    }
  }, [isOpen, initialDrafts]);

  const activeDraft = drafts[activeIndex];

  const updateDraft = (field: keyof TransactionDraft, value: any) => {
    setDrafts(prev => prev.map((d, i) => i === activeIndex ? { ...d, [field]: value } : d));
  };

  // Numpad logic
  const handleNumpad = (key: string) => {
    if (key === '⌫') {
      const next = amountStr.slice(0, -1);
      setAmountStr(next);
      updateDraft('amount', next ? parseFloat(next) : undefined);
      return;
    }
    if (key === '.' && amountStr.includes('.')) return;
    if (amountStr === '0' && key !== '.') {
      setAmountStr(key);
      updateDraft('amount', parseFloat(key));
      return;
    }
    // Max 2 decimal places
    if (amountStr.includes('.') && amountStr.split('.')[1]?.length >= 2) return;
    const next = amountStr + key;
    setAmountStr(next);
    updateDraft('amount', parseFloat(next));
  };

  // Date quick buttons
  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  const getDateLabel = () => {
    if (activeDraft?.date === today) return null;
    if (activeDraft?.date === yesterday) return null;
    if (activeDraft?.date === tomorrow) return null;
    return activeDraft?.date ? format(parseISO(activeDraft.date), 'dd.MM.yyyy') : null;
  };

  const filteredCategories = useMemo(() =>
    categories.filter(c => c.type === activeDraft?.type),
    [categories, activeDraft?.type]
  );

  const handleAddCategory = async () => {
    if (newCategoryName.trim() && activeDraft) {
      await addCategory(newCategoryName.trim(), activeDraft.type!);
      updateDraft('category', newCategoryName.trim());
      setNewCategoryName('');
      setShowAddCategory(false);
    }
  };

  const handleSave = async () => {
    if (!activeDraft?.amount || activeDraft.amount <= 0 || !activeDraft.category) return;

    const catName = activeDraft.category.trim();
    const catType = activeDraft.type!;

    if (!categories.some(c => c.name.toLowerCase() === catName.toLowerCase() && c.type === catType)) {
      await addCategory(catName, catType);
    }

    const baseData = {
      type: catType,
      amount: Number(activeDraft.amount),
      category: catName,
      status: activeDraft.status!,
      recurrence: activeDraft.recurrence || Recurrence.NONE,
      includeInBalance: activeDraft.includeInBalance ?? true,
      description: '',
    };

    if (mode === 'EDIT' && activeDraft.id) {
      const updated = { ...baseData, id: activeDraft.id, date: activeDraft.date! } as Transaction;
      await updateTransaction(updated);
    } else if (baseData.recurrence === Recurrence.NONE) {
      await addTransaction({ ...baseData, date: activeDraft.date! });
    } else {
      const dates = generatePeriodicDates(activeDraft.date!, activeDraft.recurrenceEndDate!, baseData.recurrence);
      await addTransactions(dates.map(date => ({ ...baseData, date, recurrence: Recurrence.NONE })));
    }

    closeTransactionModal();
  };

  const generatePeriodicDates = (start: string, end: string, recurrence: Recurrence) => {
    const dates: string[] = [];
    let current = parseISO(start);
    const endDate = parseISO(end);
    if (isBefore(endDate, current)) return [start];
    while (current <= endDate || isSameDay(current, endDate)) {
      dates.push(format(current, 'yyyy-MM-dd'));
      if (recurrence === Recurrence.WEEKLY) current = addDays(current, 7);
      else if (recurrence === Recurrence.MONTHLY) current = addMonths(current, 1);
      else if (recurrence === Recurrence.YEARLY) current = addYears(current, 1);
      else current = addDays(current, 1);
      if (dates.length > 366) break;
    }
    return dates;
  };

  const confirmDelete = () => {
    if (mode === 'EDIT' && activeDraft?.id) {
      deleteTransaction(activeDraft.id);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Удалил операцию: ${activeDraft.category}, ${activeDraft.amount} ₽.`,
        timestamp: new Date()
      }]);
      closeTransactionModal();
    }
  };

  if (!isOpen || !activeDraft) return null;

  const isValid = activeDraft.amount && activeDraft.amount > 0 && activeDraft.category;
  const isPeriodic = activeDraft.recurrence !== Recurrence.NONE;
  const recurrenceLabel = RECURRENCE_OPTIONS.find(o => o.value === activeDraft.recurrence)?.label || 'Разово';
  const customDateLabel = getDateLabel();

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-fin-bg flex flex-col animate-in slide-in-from-bottom-full duration-300">

      {/* Header */}
      <div className="flex items-center px-4 pt-4 pb-2 shrink-0">
        <button onClick={closeTransactionModal} className="p-2 -ml-2 text-fin-textSec hover:text-fin-text transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h3 className="flex-1 text-center text-base font-bold text-fin-text">
          {mode === 'EDIT' ? 'Редактирование' : 'Новая операция'}
        </h3>
        {mode === 'EDIT' ? (
          <button onClick={() => setShowDeleteConfirm(true)} className="p-2 -mr-2 text-fin-error">
            <Trash2 size={20} />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">

        {/* Type switcher */}
        <div className="flex px-4 pt-2 pb-1">
          <div className="flex bg-fin-bgSec p-1 rounded-full border border-fin-border w-full">
            <button
              onClick={() => { updateDraft('type', 'EXPENSE'); updateDraft('category', ''); }}
              className={`flex-1 py-2 rounded-full text-sm font-bold transition-all ${activeDraft.type === 'EXPENSE' ? 'bg-fin-card text-fin-error shadow-sm' : 'text-fin-textSec'}`}
            >Расход</button>
            <button
              onClick={() => { updateDraft('type', 'INCOME'); updateDraft('category', ''); }}
              className={`flex-1 py-2 rounded-full text-sm font-bold transition-all ${activeDraft.type === 'INCOME' ? 'bg-fin-card text-fin-success shadow-sm' : 'text-fin-textSec'}`}
            >Доход</button>
          </div>
        </div>

        {/* Amount display */}
        <div className="flex items-center justify-center gap-2 py-6 px-4">
          <span className={`text-7xl font-bold tracking-tight ${activeDraft.type === 'INCOME' ? 'text-fin-success' : 'text-fin-text'} ${!amountStr ? 'opacity-30' : ''}`}>
            {amountStr || '0'}
          </span>
          <span className="text-4xl text-fin-textTert font-medium">₽</span>
        </div>

        {/* Category chips */}
        <div className="px-4 mb-4">
          <p className="text-[10px] font-bold text-fin-textTert uppercase tracking-widest mb-2">Категория</p>
          <div className="flex flex-wrap gap-2">
            {filteredCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => updateDraft('category', cat.name)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                  activeDraft.category === cat.name
                    ? 'bg-fin-accent text-white border-fin-accent'
                    : 'bg-fin-bgSec border-fin-border text-fin-text hover:border-fin-accent'
                }`}
              >
                {cat.name}
              </button>
            ))}
            {showAddCategory ? (
              <div className="flex items-center gap-2 w-full mt-1">
                <input
                  autoFocus
                  type="text"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                  placeholder="Название категории"
                  className="flex-1 bg-fin-bgSec border border-fin-accent rounded-full px-4 py-2 text-sm text-fin-text outline-none"
                />
                <button onClick={handleAddCategory} disabled={!newCategoryName.trim()} className="p-2 bg-fin-accent text-white rounded-full disabled:opacity-50">
                  <Plus size={16} />
                </button>
                <button onClick={() => setShowAddCategory(false)} className="p-2 text-fin-textTert">
                  <ArrowLeft size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddCategory(true)}
                className="px-4 py-2 rounded-full text-sm font-medium border border-dashed border-fin-border text-fin-textTert hover:border-fin-accent hover:text-fin-accent transition-all"
              >
                + Новая
              </button>
            )}
          </div>
        </div>

        {/* Date quick buttons */}
        <div className="px-4 mb-4">
          <p className="text-[10px] font-bold text-fin-textTert uppercase tracking-widest mb-2">Дата</p>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'Вчера', value: yesterday },
              { label: 'Сегодня', value: today },
              { label: 'Завтра', value: tomorrow },
            ].map(btn => (
              <button
                key={btn.value}
                onClick={() => updateDraft('date', btn.value)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                  activeDraft.date === btn.value
                    ? 'bg-fin-accent text-white border-fin-accent'
                    : 'bg-fin-bgSec border-fin-border text-fin-text hover:border-fin-accent'
                }`}
              >
                {btn.label}
              </button>
            ))}
            <label className={`px-4 py-2 rounded-full text-sm font-medium border transition-all cursor-pointer ${
              customDateLabel
                ? 'bg-fin-accent text-white border-fin-accent'
                : 'bg-fin-bgSec border-fin-border text-fin-textSec hover:border-fin-accent'
            }`}>
              {customDateLabel || '📅'}
              <input
                type="date"
                value={activeDraft.date || ''}
                onChange={e => updateDraft('date', e.target.value)}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {/* Status + Balance row */}
        <div className="px-4 mb-4 flex gap-3">
          <div className="flex-1 bg-fin-card border border-fin-border rounded-2xl p-3">
            <p className="text-[10px] font-bold text-fin-textTert uppercase tracking-widest mb-2">Статус</p>
            <div className="flex bg-fin-bgSec p-0.5 rounded-full border border-fin-border">
              <button onClick={() => updateDraft('status', 'ACTUAL')} className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all ${activeDraft.status === 'ACTUAL' ? 'bg-fin-card text-fin-text shadow-sm' : 'text-fin-textTert'}`}>Факт</button>
              <button onClick={() => updateDraft('status', 'PLANNED')} className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all ${activeDraft.status === 'PLANNED' ? 'bg-fin-card text-fin-text shadow-sm' : 'text-fin-textTert'}`}>План</button>
            </div>
          </div>
          <div className="flex-1 bg-fin-card border border-fin-border rounded-2xl p-3">
            <p className="text-[10px] font-bold text-fin-textTert uppercase tracking-widest mb-2">В балансе</p>
            <div className="flex items-center justify-between px-1 mt-1">
              <span className="text-xs text-fin-textSec">{activeDraft.includeInBalance ? 'Да' : 'Нет'}</span>
              <button
                onClick={() => updateDraft('includeInBalance', !activeDraft.includeInBalance)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${activeDraft.includeInBalance ? 'bg-fin-accent' : 'bg-fin-border'}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${activeDraft.includeInBalance ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Recurrence */}
        <div className="px-4 mb-4">
          <button
            onClick={() => setShowRecurrenceSheet(true)}
            className="w-full bg-fin-card border border-fin-border rounded-2xl p-4 flex justify-between items-center"
          >
            <span className="text-sm font-medium text-fin-text">Повторение</span>
            <span className="text-sm text-fin-textSec">{recurrenceLabel} ›</span>
          </button>
          {isPeriodic && (
            <div className="mt-2 bg-fin-card border border-fin-border rounded-2xl p-4 flex justify-between items-center animate-in fade-in">
              <label className="text-sm font-medium text-fin-text">Завершить</label>
              <input
                type="date"
                value={activeDraft.recurrenceEndDate || ''}
                onChange={e => updateDraft('recurrenceEndDate', e.target.value)}
                className="bg-transparent text-sm text-fin-text outline-none text-right"
              />
            </div>
          )}
        </div>

        {/* Numpad */}
        <div className="px-4 pb-2">
          <div className="grid grid-cols-3 gap-2">
            {['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(key => (
              <button
                key={key}
                onClick={() => handleNumpad(key)}
                className={`py-4 rounded-2xl text-xl font-semibold transition-all active:scale-95 ${
                  key === '⌫'
                    ? 'bg-fin-bgSec text-fin-error border border-fin-border'
                    : 'bg-fin-bgSec text-fin-text border border-fin-border hover:bg-fin-card'
                }`}
              >
                {key === '⌫' ? <Delete size={20} className="mx-auto" /> : key}
              </button>
            ))}
          </div>
        </div>

        {/* Save button */}
        <div className="px-4 pb-6 pt-2">
          <button
            onClick={handleSave}
            disabled={!isValid}
            className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] ${
              isValid
                ? 'bg-fin-accent text-white hover:brightness-110'
                : 'bg-fin-bgSec text-fin-textTert border border-fin-border cursor-not-allowed'
            }`}
          >
            {mode === 'EDIT' ? 'Сохранить изменения' : 'Добавить'}
          </button>
        </div>
      </div>

      {/* Recurrence sheet */}
      {showRecurrenceSheet && (
        <div className="absolute inset-0 z-10 bg-black/60 flex items-end" onClick={() => setShowRecurrenceSheet(false)}>
          <div className="w-full bg-fin-card rounded-t-3xl border-t border-fin-border p-4 pb-8" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-fin-border rounded-full mx-auto mb-4" />
            <h4 className="text-base font-bold text-fin-text mb-3 px-2">Повторение</h4>
            {RECURRENCE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { updateDraft('recurrence', opt.value); setShowRecurrenceSheet(false); }}
                className={`w-full text-left px-4 py-3.5 rounded-xl text-sm font-medium transition-all mb-1 ${
                  activeDraft.recurrence === opt.value
                    ? 'bg-fin-accent/10 text-fin-accent'
                    : 'text-fin-text hover:bg-fin-bgSec'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-20 bg-fin-bg/95 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
          <div className="w-16 h-16 bg-fin-error/10 text-fin-error rounded-full flex items-center justify-center mb-4">
            <AlertTriangle size={32} />
          </div>
          <h4 className="text-xl font-bold text-fin-text mb-2">Удалить операцию?</h4>
          <p className="text-fin-textSec text-sm mb-8">Это действие нельзя отменить.</p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button onClick={confirmDelete} className="w-full py-4 bg-fin-error text-white rounded-2xl font-bold text-base active:scale-95 transition-all">Удалить</button>
            <button onClick={() => setShowDeleteConfirm(false)} className="w-full py-4 bg-fin-bgSec border border-fin-border text-fin-text rounded-2xl font-bold text-base active:scale-95 transition-all">Отмена</button>
          </div>
        </div>
      )}

    </div>,
    document.body
  );
};

export default TransactionModal;
