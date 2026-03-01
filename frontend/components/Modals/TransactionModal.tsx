import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  const [showDateSheet, setShowDateSheet] = useState(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

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
    if (key === '=') {
      try {
        // Вычисляем выражение: заменяем % на /100*
        const expr = amountStr.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
        // eslint-disable-next-line no-new-func
        const result = Function('"use strict"; return (' + expr + ')')();
        if (!isNaN(result) && isFinite(result)) {
          const rounded = Math.round(result * 100) / 100;
          const str = String(rounded);
          setAmountStr(str);
          updateDraft('amount', rounded);
        }
      } catch {}
      return;
    }
    const operators = ['+', '-', '*', '/'];
    // Не давать ставить оператор в начале кроме минуса
    if (operators.includes(key)) {
      if (!amountStr) return;
      // Заменить последний оператор если он уже стоит
      const lastChar = amountStr.slice(-1);
      if (operators.includes(lastChar)) {
        const next = amountStr.slice(0, -1) + key;
        setAmountStr(next);
        return;
      }
      setAmountStr(amountStr + key);
      return;
    }
    if (key === '%') {
      if (!amountStr || ['+','-','*','/'].includes(amountStr.slice(-1))) return;
      setAmountStr(amountStr + '%');
      return;
    }
    // Точка — только одна в текущем числе (после последнего оператора)
    const operators2 = ['+', '-', '*', '/'];
    const lastOperatorIdx = Math.max(...operators2.map(op => amountStr.lastIndexOf(op)));
    const currentNum = lastOperatorIdx >= 0 ? amountStr.slice(lastOperatorIdx + 1) : amountStr;
    if (key === '.' && currentNum.includes('.')) return;
    if (currentNum === '0' && key !== '.') {
      const next = amountStr.slice(0, -1) + key;
      setAmountStr(next);
      const val = parseFloat(next);
      if (!isNaN(val)) updateDraft('amount', val);
      return;
    }
    if (currentNum.includes('.') && currentNum.split('.')[1]?.length >= 2) return;
    const next = amountStr + key;
    setAmountStr(next);
    const val = parseFloat(next);
    if (!isNaN(val)) updateDraft('amount', val);
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
      <div className="flex items-center justify-between px-5 pt-[70px] pb-3 shrink-0">
        <button
          onClick={closeTransactionModal}
          className="text-fin-textSec text-sm font-medium hover:text-fin-text transition-colors active:scale-95 px-1"
        >Отмена</button>

        {/* Переключатель типа — по центру, цветной */}
        <div className="flex bg-fin-bgSec border border-fin-border rounded-full p-0.5 gap-0.5">
          <button
            onClick={() => { updateDraft('type', 'EXPENSE'); updateDraft('category', ''); }}
            className={`px-5 py-2 rounded-full text-sm font-bold transition-all duration-200 active:scale-95 ${
              isExpense ? 'bg-fin-card text-fin-text border border-fin-border' : 'text-fin-textSec hover:text-fin-text'
            }`}
          >Расход</button>
          <button
            onClick={() => { updateDraft('type', 'INCOME'); updateDraft('category', ''); }}
            className={`px-5 py-2 rounded-full text-sm font-bold transition-all duration-200 active:scale-95 ${
              !isExpense ? 'bg-fin-card text-fin-text border border-fin-border' : 'text-fin-textSec hover:text-fin-text'
            }`}
          >Доход</button>
        </div>

        {/* Placeholder для симметрии */}
        <div className="w-9" />
      </div>

      {/* SCROLLABLE BODY */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-5">

        {/* Сумма — по левому краю, шрифт уменьшается при длинном числе */}
        <div className="flex items-baseline gap-2 py-3 overflow-hidden">
          <span className={`font-bold tracking-tight transition-all ${
            amountStr.length > 9 ? 'text-3xl' : amountStr.length > 6 ? 'text-5xl' : 'text-6xl'
          } ${isExpense ? 'text-fin-text' : 'text-fin-success'} ${!amountStr ? 'opacity-20' : ''}`}>
            {amountStr || '0'}
          </span>
          <span className={`text-fin-textTert font-light transition-all ${
            amountStr.length > 9 ? 'text-xl' : amountStr.length > 6 ? 'text-2xl' : 'text-3xl'
          }`}>₽</span>
        </div>

        {/* Категории */}
        <div className="mb-3">

          <div className="flex flex-wrap gap-2">
            {filteredCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => updateDraft('category', cat.name)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-all active:scale-95 ${
                  activeDraft.category === cat.name
                    ? 'bg-fin-card text-fin-text border-fin-border'
                    : 'border-fin-border text-fin-textSec'
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

        {/* Статус + В балансе */}
        <div className="flex gap-3 mb-3">
          <div className="flex-1 bg-fin-bgSec border border-fin-border rounded-2xl px-3 py-2">
            <p className="text-[10px] font-bold text-fin-textTert uppercase tracking-widest mb-2">Статус</p>
            <div className="flex bg-fin-bg rounded-full p-0.5 border border-fin-border">
              <button
                onClick={() => updateDraft('status', 'ACTUAL')}
                className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all ${
                  activeDraft.status === 'ACTUAL' ? 'bg-fin-card text-fin-text border border-fin-border' : 'text-fin-textTert'
                }`}
              >Факт</button>
              <button
                onClick={() => updateDraft('status', 'PLANNED')}
                className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all ${
                  activeDraft.status === 'PLANNED' ? 'bg-fin-card text-fin-text border border-fin-border' : 'text-fin-textTert'
                }`}
              >План</button>
            </div>
          </div>
          <div className="flex-1 bg-fin-bgSec border border-fin-border rounded-2xl px-3 py-2">
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

        {/* Дата */}
        <div className="mb-3">
          <button
            onClick={() => setShowDateSheet(true)}
            className="w-full bg-fin-bgSec border border-fin-border rounded-2xl px-4 py-3 flex justify-between items-center hover:border-fin-accent transition-colors"
          >
            <span className="text-sm font-medium text-fin-text">Дата</span>
            <div className="flex items-center gap-1 text-fin-textSec">
              <span className="text-sm">{customDateLabel || (activeDraft.date === today ? 'Сегодня' : activeDraft.date === yesterday ? 'Вчера' : activeDraft.date === tomorrow ? 'Завтра' : activeDraft.date)}</span>
              <ChevronRight size={15} />
            </div>
          </button>
          <input ref={dateInputRef} type="date" value={activeDraft.date || ''} onChange={e => { updateDraft('date', e.target.value); setShowDateSheet(false); }} className="sr-only" />
        </div>

        {/* Повторение */}
        <div className="mb-3">
          <button
            onClick={() => setShowRecurrenceSheet(true)}
            className="w-full bg-fin-bgSec border border-fin-border rounded-2xl px-4 py-2.5 flex justify-between items-center hover:border-fin-accent transition-colors"
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

        {/* Нампад — layout iOS */}
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {/* Строка 1: AC ⌫ / * */}
          <button onClick={() => { setAmountStr(''); updateDraft('amount', undefined); }} className="py-3 rounded-2xl text-sm font-bold bg-fin-bgSec text-fin-textSec border border-fin-border active:scale-95 select-none">AC</button>
          <button onClick={() => handleNumpad('backspace')} className="py-3 rounded-2xl text-xl font-semibold bg-fin-bgSec text-fin-textSec border border-fin-border active:scale-95 select-none flex items-center justify-center"><Delete size={17} /></button>
          <button onClick={() => handleNumpad('/')} className="py-3 rounded-2xl text-xl font-semibold bg-fin-bgSec text-fin-textSec border border-fin-border active:scale-95 select-none">/</button>
          <button onClick={() => handleNumpad('*')} className="py-3 rounded-2xl text-xl font-semibold bg-fin-bgSec text-fin-textSec border border-fin-border active:scale-95 select-none">×</button>
          {/* Строка 2: 7 8 9 - */}
          {['7','8','9'].map(k => <button key={k} onClick={() => handleNumpad(k)} className="py-3 rounded-2xl text-xl font-semibold bg-fin-bgSec text-fin-text border border-fin-border hover:bg-fin-card active:scale-95 select-none">{k}</button>)}
          <button onClick={() => handleNumpad('-')} className="py-3 rounded-2xl text-xl font-semibold bg-fin-bgSec text-fin-textSec border border-fin-border active:scale-95 select-none">−</button>
          {/* Строка 3: 4 5 6 + */}
          {['4','5','6'].map(k => <button key={k} onClick={() => handleNumpad(k)} className="py-3 rounded-2xl text-xl font-semibold bg-fin-bgSec text-fin-text border border-fin-border hover:bg-fin-card active:scale-95 select-none">{k}</button>)}
          <button onClick={() => handleNumpad('+')} className="py-3 rounded-2xl text-xl font-semibold bg-fin-bgSec text-fin-textSec border border-fin-border active:scale-95 select-none">+</button>
          {/* Строка 4: 1 2 3 + (продолжение) */}
          {['1','2','3'].map(k => <button key={k} onClick={() => handleNumpad(k)} className="py-3 rounded-2xl text-xl font-semibold bg-fin-bgSec text-fin-text border border-fin-border hover:bg-fin-card active:scale-95 select-none">{k}</button>)}
          <button onClick={() => handleNumpad('%')} className="py-3 rounded-2xl text-xl font-semibold bg-fin-bgSec text-fin-textSec border border-fin-border active:scale-95 select-none">%</button>
          {/* Строка 5: 0 . = */}
          <button onClick={() => handleNumpad('0')} className="col-span-2 py-3 rounded-2xl text-xl font-semibold bg-fin-bgSec text-fin-text border border-fin-border hover:bg-fin-card active:scale-95 select-none text-left pl-6">0</button>
          <button onClick={() => handleNumpad('.')} className="py-3 rounded-2xl text-xl font-semibold bg-fin-bgSec text-fin-text border border-fin-border hover:bg-fin-card active:scale-95 select-none">.</button>
          <button onClick={() => handleNumpad('=')} className="py-3 rounded-2xl text-xl font-bold bg-fin-bgSec text-fin-text border border-fin-border active:scale-95 select-none">=</button>
        </div>

      </div>

      {/* ФИКСИРОВАННАЯ ЗОНА ДЕЙСТВИЙ — без разделителя */}
      <div className="shrink-0 px-5 pt-3 pb-6 bg-fin-bg">
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={!isValid}
            className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] ${
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

      {/* SHEET: Дата */}
      {showDateSheet && (
        <div className="absolute inset-0 z-10 bg-black/60 flex items-end" onClick={() => setShowDateSheet(false)}>
          <div className="w-full bg-fin-card rounded-t-3xl border-t border-fin-border p-4 pb-10 animate-in slide-in-from-bottom-4 duration-200" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-fin-border rounded-full mx-auto mb-5" />
            <h4 className="text-base font-bold text-fin-text mb-3 px-2">Дата</h4>
            {[
              { label: 'Вчера', value: yesterday },
              { label: 'Сегодня', value: today },
              { label: 'Завтра', value: tomorrow },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => { updateDraft('date', opt.value); setShowDateSheet(false); }}
                className={`w-full text-left px-4 py-3.5 rounded-xl text-sm font-medium transition-all mb-1 flex items-center justify-between ${
                  activeDraft.date === opt.value ? 'bg-fin-accent/10 text-fin-accent' : 'text-fin-text hover:bg-fin-bgSec'
                }`}
              >
                {opt.label}
                {activeDraft.date === opt.value && <Check size={15} />}
              </button>
            ))}
            <button
              onClick={() => { setShowDateSheet(false); setTimeout(() => dateInputRef.current?.showPicker?.(), 100); }}
              className="w-full text-left px-4 py-3.5 rounded-xl text-sm font-medium text-fin-text hover:bg-fin-bgSec transition-all flex items-center justify-between"
            >
              <span>Выбрать дату...</span>
              {customDateLabel && <span className="text-fin-accent text-sm">{customDateLabel}</span>}
            </button>
          </div>
        </div>
      )}

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

      {/* CONFIRM DELETE — полный непрозрачный overlay */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-20 bg-fin-bg flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
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
