import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useFinance } from '../../context/FinanceContext';
import { useChat } from '../../context/ChatContext';
import { X, Trash2, AlertTriangle, Plus, Delete, ChevronRight, Check } from 'lucide-react';
import { Recurrence, Transaction, TransactionType } from '../../types';
import { format, addDays, addMonths, addYears, parseISO, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';

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

  const handleNumpad = (key: string) => {
    if (key === 'backspace') {
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
    if (amountStr.includes('.') && amountStr.split('.')[1]?.length >= 2) return;
    const next = amountStr + key;
    setAmountStr(next);
    updateDraft('amount', parseFloat(next));
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  const customDateLabel = (() => {
    if (!activeDraft?.date) return null;
    if ([today, yesterday, tomorrow].includes(activeDraft.date)) return null;
    return format(parseISO(activeDraft.date), 'd MMM', { locale: ru });
  })();

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
      await updateTransaction({ ...baseData, id: activeDraft.id, date: activeDraft.date! } as Transaction);
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
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    let current = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);
    if (endDate < current) return [start];
    while (current <= endDate) {
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

  const isValid = !!(activeDraft.amount && activeDraft.amount > 0 && activeDraft.category);
  const isPeriodic = activeDraft.recurrence !== Recurrence.NONE;
  const recurrenceLabel = RECURRENCE_OPTIONS.find(o => o.value === activeDraft.recurrence)?.label || 'Разово';
  const isExpense = activeDraft.type === 'EXPENSE';

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-fin-bg flex flex-col animate-in slide-in-from-bottom-full duration-300">

      {/* HEADER */}
      <div className="flex items-center justify-between px-5 pt-[50px] pb-3 shrink-0">
        <button
          onClick={closeTransactionModal}
          className="w-9 h-9 flex items-center justify-center bg-fin-bgSec border border-fin-border rounded-full text-fin-textSec hover:text-fin-text transition-colors active:scale-95"
        >
          <X size={17} />
        </button>

        {/* Переключатель типа — по центру, цветной */}
        <div className="flex bg-fin-bgSec border border-fin-border rounded-full p-0.5 gap-0.5">
          <button
            onClick={() => { updateDraft('type', 'EXPENSE'); updateDraft('category', ''); }}
            className={`px-5 py-2 rounded-full text-sm font-bold transition-all duration-200 active:scale-95 ${
              isExpense ? 'bg-fin-error text-white' : 'text-fin-textSec hover:text-fin-text'
            }`}
          >Расход</button>
          <button
            onClick={() => { updateDraft('type', 'INCOME'); updateDraft('category', ''); }}
            className={`px-5 py-2 rounded-full text-sm font-bold transition-all duration-200 active:scale-95 ${
              !isExpense ? 'bg-fin-success text-white' : 'text-fin-textSec hover:text-fin-text'
            }`}
          >Доход</button>
        </div>

        {/* Placeholder для симметрии */}
        <div className="w-9" />
      </div>

      {/* SCROLLABLE BODY */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-5">

        {/* Сумма — по левому краю */}
        <div className="flex items-baseline gap-2 py-3">
          <span className={`text-6xl font-bold tracking-tight transition-colors ${
            isExpense ? 'text-fin-text' : 'text-fin-success'
          } ${!amountStr ? 'opacity-20' : ''}`}>
            {amountStr || '0'}
          </span>
          <span className="text-3xl text-fin-textTert font-light">₽</span>
        </div>

        {/* Категории */}
        <div className="mb-4">

          <div className="flex flex-wrap gap-2">
            {filteredCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => updateDraft('category', cat.name)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-all active:scale-95 ${
                  activeDraft.category === cat.name
                    ? 'bg-fin-accent text-white border-fin-accent'
                    : 'bg-fin-bgSec border-fin-border text-fin-text hover:border-fin-accent'
                }`}
              >{cat.name}</button>
            ))}
            {showAddCategory ? (
              <div className="flex items-center gap-2 w-full mt-1">
                <input
                  autoFocus type="text" value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                  placeholder="Название"
                  className="flex-1 bg-fin-bgSec border border-fin-accent rounded-full px-4 py-2 text-sm text-fin-text outline-none"
                />
                <button onClick={handleAddCategory} disabled={!newCategoryName.trim()} className="p-2 bg-fin-accent text-white rounded-full disabled:opacity-40">
                  <Plus size={16} />
                </button>
                <button onClick={() => setShowAddCategory(false)} className="p-2 text-fin-textTert">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddCategory(true)}
                className="px-4 py-2 rounded-full text-sm border border-dashed border-fin-border text-fin-textTert hover:border-fin-accent hover:text-fin-accent transition-all active:scale-95"
              >+ Новая</button>
            )}
          </div>
        </div>

        {/* Дата */}
        <div className="mb-4">

          {/* Только иконка выбора даты */}
          <div className="flex items-center gap-3">
            <label className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border cursor-pointer active:scale-95 transition-all ${
              customDateLabel ? 'bg-fin-accent text-white border-fin-accent' : 'bg-fin-bgSec border-fin-border text-fin-textSec hover:border-fin-accent'
            }`}>
              <span>📅</span>
              <span>{customDateLabel || 'Выбрать дату'}</span>
              <input type="date" value={activeDraft.date || ''} onChange={e => updateDraft('date', e.target.value)} className="sr-only" />
            </label>
            {/* Быстрые кнопки */}
            {[{ label: 'Вчера', value: yesterday }, { label: 'Сегодня', value: today }, { label: 'Завтра', value: tomorrow }].map(btn => (
              <button
                key={btn.value}
                onClick={() => updateDraft('date', btn.value)}
                className={`px-3 py-2 rounded-full text-xs font-medium border transition-all active:scale-95 ${
                  activeDraft.date === btn.value
                    ? 'bg-fin-accent text-white border-fin-accent'
                    : 'bg-fin-bgSec border-fin-border text-fin-textSec hover:border-fin-accent'
                }`}
              >{btn.label}</button>
            ))}
          </div>
        </div>

        {/* Статус + В балансе */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 bg-fin-bgSec border border-fin-border rounded-2xl px-3 py-2.5">
            <p className="text-[10px] font-bold text-fin-textTert uppercase tracking-widest mb-2">Статус</p>
            <div className="flex bg-fin-bg rounded-full p-0.5 border border-fin-border">
              <button
                onClick={() => updateDraft('status', 'ACTUAL')}
                className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all ${
                  activeDraft.status === 'ACTUAL' ? 'bg-fin-accent text-white' : 'text-fin-textTert'
                }`}
              >Факт</button>
              <button
                onClick={() => updateDraft('status', 'PLANNED')}
                className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all ${
                  activeDraft.status === 'PLANNED' ? 'bg-fin-accent text-white' : 'text-fin-textTert'
                }`}
              >План</button>
            </div>
          </div>
          <div className="flex-1 bg-fin-bgSec border border-fin-border rounded-2xl px-3 py-2.5">
            <p className="text-[10px] font-bold text-fin-textTert uppercase tracking-widest mb-2">В балансе</p>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-fin-textSec">{activeDraft.includeInBalance ? 'Да' : 'Нет'}</span>
              <button
                onClick={() => updateDraft('includeInBalance', !activeDraft.includeInBalance)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                  activeDraft.includeInBalance ? 'bg-fin-accent' : 'bg-fin-border'
                }`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                  activeDraft.includeInBalance ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>
        </div>

        {/* Повторение */}
        <div className="mb-4">
          <button
            onClick={() => setShowRecurrenceSheet(true)}
            className="w-full bg-fin-bgSec border border-fin-border rounded-2xl px-4 py-3.5 flex justify-between items-center hover:border-fin-accent transition-colors"
          >
            <span className="text-sm font-medium text-fin-text">Повторение</span>
            <div className="flex items-center gap-1 text-fin-textSec">
              <span className="text-sm">{recurrenceLabel}</span>
              <ChevronRight size={15} />
            </div>
          </button>
          {isPeriodic && (
            <div className="mt-2 bg-fin-bgSec border border-fin-border rounded-2xl px-4 py-3.5 flex justify-between items-center animate-in fade-in">
              <label className="text-sm font-medium text-fin-text">Завершить</label>
              <input
                type="date" value={activeDraft.recurrenceEndDate || ''}
                onChange={e => updateDraft('recurrenceEndDate', e.target.value)}
                className="bg-transparent text-sm text-fin-accent outline-none cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Нампад */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {['1','2','3','4','5','6','7','8','9','.','0','backspace'].map(key => (
            <button
              key={key}
              onClick={() => handleNumpad(key)}
              className={`py-3.5 rounded-2xl text-xl font-semibold transition-all active:scale-95 select-none ${
                key === 'backspace'
                  ? 'bg-fin-bgSec text-fin-error border border-fin-border'
                  : 'bg-fin-bgSec text-fin-text border border-fin-border hover:bg-fin-card'
              }`}
            >
              {key === 'backspace' ? <Delete size={18} className="mx-auto" /> : key}
            </button>
          ))}
        </div>

      </div>

      {/* ФИКСИРОВАННАЯ ЗОНА ДЕЙСТВИЙ — без разделителя */}
      <div className="shrink-0 px-5 pt-3 pb-6 bg-fin-bg">
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={!isValid}
            className={`flex-1 py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] ${
              isValid
                ? 'bg-fin-accent text-white hover:brightness-110'
                : 'bg-fin-bgSec text-fin-textTert cursor-not-allowed'
            }`}
          >
            {mode === 'EDIT' ? 'Сохранить' : 'Добавить'}
          </button>
          {mode === 'EDIT' && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-14 flex items-center justify-center bg-fin-error/10 rounded-2xl text-fin-error hover:bg-fin-error/20 transition-colors active:scale-95"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      {/* SHEET: Повторение */}
      {showRecurrenceSheet && (
        <div className="absolute inset-0 z-10 bg-black/60 flex items-end" onClick={() => setShowRecurrenceSheet(false)}>
          <div className="w-full bg-fin-card rounded-t-3xl border-t border-fin-border p-4 pb-10 animate-in slide-in-from-bottom-4 duration-200" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-fin-border rounded-full mx-auto mb-5" />
            <h4 className="text-base font-bold text-fin-text mb-3 px-2">Повторение</h4>
            {RECURRENCE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { updateDraft('recurrence', opt.value); setShowRecurrenceSheet(false); }}
                className={`w-full text-left px-4 py-3.5 rounded-xl text-sm font-medium transition-all mb-1 flex items-center justify-between ${
                  activeDraft.recurrence === opt.value ? 'bg-fin-accent/10 text-fin-accent' : 'text-fin-text hover:bg-fin-bgSec'
                }`}
              >
                {opt.label}
                {activeDraft.recurrence === opt.value && <Check size={15} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* CONFIRM DELETE */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-20 bg-fin-bg/95 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
          <div className="w-16 h-16 bg-fin-error/10 text-fin-error rounded-full flex items-center justify-center mb-4">
            <AlertTriangle size={32} />
          </div>
          <h4 className="text-xl font-bold text-fin-text mb-2">Удалить операцию?</h4>
          <p className="text-fin-textSec text-sm mb-8">Это действие нельзя отменить.</p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button onClick={confirmDelete} className="w-full py-4 bg-fin-error text-white rounded-2xl font-bold active:scale-95 transition-all">Удалить</button>
            <button onClick={() => setShowDeleteConfirm(false)} className="w-full py-4 bg-fin-bgSec border border-fin-border text-fin-text rounded-2xl font-bold active:scale-95 transition-all">Отмена</button>
          </div>
        </div>
      )}

    </div>,
    document.body
  );
};

export default TransactionModal;
