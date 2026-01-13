import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useFinance } from '../../context/FinanceContext';
import { useChat } from '../../context/ChatContext';
import { X, Plus, Check, Trash2, Repeat, AlignLeft, Calendar } from 'lucide-react';
import { Recurrence, Transaction } from '../../types';
import { format, parseISO, addDays, addMonths, addYears, getDay, isBefore, isSameDay } from 'date-fns';

interface TransactionDraft extends Partial<Transaction> {
  tempId: string;
}

const TransactionModal: React.FC = () => {
  const { modalState, closeTransactionModal, addTransaction, addTransactions, updateTransaction, addCategory, categories } = useFinance();
  const { isOpen, mode, drafts: initialDrafts } = modalState;
  const { setMessages } = useChat();

  const [drafts, setDrafts] = useState<TransactionDraft[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (initialDrafts && initialDrafts.length > 0) {
        setDrafts(initialDrafts.map((d, i) => ({
          ...d,
          tempId: `draft-${i}-${Date.now()}`,
          type: d.type || 'EXPENSE',
          amount: d.amount !== undefined ? d.amount : 0,
          date: d.date || format(new Date(), 'yyyy-MM-dd'),
          status: d.status || 'ACTUAL',
          recurrence: d.recurrence || Recurrence.NONE,
          recurrenceEndDate: d.recurrenceEndDate || format(addMonths(new Date(), 1), 'yyyy-MM-dd'),
          includeInBalance: d.includeInBalance !== undefined ? d.includeInBalance : true,
          description: d.description || '',
          category: d.category || ''
        })));
      } else {
        setDrafts([{
          tempId: `draft-0-${Date.now()}`,
          type: 'EXPENSE',
          amount: 0,
          date: format(new Date(), 'yyyy-MM-dd'),
          status: 'ACTUAL',
          recurrence: Recurrence.NONE,
          recurrenceEndDate: format(addMonths(new Date(), 1), 'yyyy-MM-dd'),
          includeInBalance: true,
          description: '',
          category: ''
        }]);
      }
      setActiveIndex(0);
      setIsCreatingCategory(false);
      setNewCategoryName('');
    } else {
        setDrafts([]);
    }
  }, [isOpen, initialDrafts]);

  const activeDraft = drafts[activeIndex];

  const updateActiveDraft = (field: keyof Transaction, value: any) => {
    setDrafts(prev => prev.map((d, i) => 
      i === activeIndex ? { ...d, [field]: value } : d
    ));
  };

  const generatePeriodicDates = (start: string, end: string, recurrence: Recurrence) => {
    const dates: string[] = [];
    let current = parseISO(start);
    const endDate = parseISO(end);

    if (isBefore(endDate, current)) return [start];

    while (current <= endDate || isSameDay(current, endDate)) {
      const day = getDay(current); 
      let shouldAdd = false;

      switch (recurrence) {
        case Recurrence.DAILY: shouldAdd = true; break;
        case Recurrence.WEEKLY: shouldAdd = true; break;
        case Recurrence.MONTHLY: shouldAdd = true; break;
        case Recurrence.YEARLY: shouldAdd = true; break;
      }

      if (shouldAdd) dates.push(format(current, 'yyyy-MM-dd'));

      if (recurrence === Recurrence.WEEKLY) current = addDays(current, 7);
      else if (recurrence === Recurrence.MONTHLY) current = addMonths(current, 1);
      else if (recurrence === Recurrence.YEARLY) current = addYears(current, 1);
      else current = addDays(current, 1);

      if (dates.length > 366) break; 
    }
    return dates;
  };

  const handleSaveAll = () => {
    const allValid = drafts.every(d => {
        const isPeriodic = d.recurrence !== Recurrence.NONE;
        return d.amount && d.amount > 0 && d.category && d.date && (!isPeriodic || d.recurrenceEndDate);
    });
    if (!allValid) return;

    let totalCreated = 0;
    const processedCategories = new Set<string>();

    drafts.forEach(d => {
       const catName = d.category!.trim(); 
       const catType = d.type!;
       const uniqueKey = `${catName.toLowerCase()}-${catType}`;

       // Automatically add the category if it doesn't exist yet
       if (!categories.some(c => c.name.toLowerCase() === catName.toLowerCase() && c.type === catType) && !processedCategories.has(uniqueKey)) {
           addCategory(catName, catType);
           processedCategories.add(uniqueKey);
           setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `Создал новую категорию: ${catName}.`, timestamp: new Date() }]);
       }

       const baseData = {
         type: d.type!,
         amount: Number(d.amount),
         category: catName,
         status: d.status!,
         recurrence: Recurrence.NONE, 
         includeInBalance: d.includeInBalance ?? true,
         description: d.description || '' 
       };

       if (mode === 'EDIT' && d.id) {
          updateTransaction({ ...baseData, id: d.id, date: d.date! } as Transaction);
          totalCreated++;
       } else if (d.recurrence === Recurrence.NONE) {
          addTransaction({ ...baseData, date: d.date! });
          totalCreated++;
       } else {
          const dates = generatePeriodicDates(d.date!, d.recurrenceEndDate!, d.recurrence!);
          const batch = dates.map(date => ({ ...baseData, date }));
          addTransactions(batch);
          totalCreated += batch.length;
       }
    });

    const isMultiple = totalCreated > 1;
    let message = isMultiple 
        ? `Создано ${totalCreated} операций на общую сумму ${drafts.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0) * (totalCreated / drafts.length)} ₽.`
        : `Записал ${activeDraft.type === 'INCOME' ? 'доход' : 'расход'} в категорию ${activeDraft.category} на сумму ${activeDraft.amount} ₽.`;

    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: message, timestamp: new Date() }]);
    closeTransactionModal();
  };

  if (!isOpen || !activeDraft) return null;

  const isPeriodic = activeDraft.recurrence !== Recurrence.NONE;
  const filteredCategories = categories.filter(c => c.type === activeDraft.type);

  const handleAddNewCategory = () => {
      if (newCategoryName.trim()) {
          // Immediately set this name as the current selected category for the draft
          updateActiveDraft('category', newCategoryName.trim());
          setIsCreatingCategory(false);
          setNewCategoryName('');
      }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={closeTransactionModal} className="absolute inset-0" />
      <div className="bg-fin-card w-full max-w-[380px] rounded-[28px] border border-fin-border flex flex-col shadow-2xl relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="pt-5 px-5 flex items-center justify-between">
             <h3 className="text-base font-bold text-fin-text">{mode === 'EDIT' ? 'Редактирование' : 'Новая запись'}</h3>
             <button onClick={closeTransactionModal} className="text-fin-textSec p-1 bg-fin-bgSec rounded-full"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-5">
            <div className="flex flex-col items-center gap-3">
                 <div className="flex p-0.5 bg-fin-bgSec rounded-lg border border-fin-border/50 w-full max-w-[200px]">
                    <button onClick={() => updateActiveDraft('type', 'EXPENSE')} className={`flex-1 py-1.5 rounded-md text-[10px] font-bold ${activeDraft.type === 'EXPENSE' ? 'bg-fin-card text-fin-error' : 'text-fin-textSec opacity-50'}`}>Расход</button>
                    <button onClick={() => updateActiveDraft('type', 'INCOME')} className={`flex-1 py-1.5 rounded-md text-[10px] font-bold ${activeDraft.type === 'INCOME' ? 'bg-fin-card text-fin-success' : 'text-fin-textSec opacity-50'}`}>Доход</button>
                </div>
                <div className="relative flex items-baseline justify-center gap-1">
                    <input type="number" value={activeDraft.amount || ''} onChange={(e) => updateActiveDraft('amount', e.target.value)} placeholder="0" className={`w-full bg-transparent text-center text-5xl font-bold outline-none ${activeDraft.type === 'INCOME' ? 'text-fin-success' : 'text-fin-text'}`} autoFocus />
                    <span className="text-fin-textTert text-2xl font-medium absolute -right-6 top-1/2 -translate-y-1/2">₽</span>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-center max-h-[110px] overflow-y-auto no-scrollbar min-h-[40px]">
                 {isCreatingCategory ? (
                   <div className="flex items-center gap-2 w-full animate-in slide-in-from-left-2">
                     <input 
                       autoFocus
                       type="text" 
                       value={newCategoryName}
                       onChange={(e) => setNewCategoryName(e.target.value)}
                       onKeyDown={(e) => {
                           if (e.key === 'Enter') handleAddNewCategory();
                           if (e.key === 'Escape') setIsCreatingCategory(false);
                       }}
                       placeholder="Название категории"
                       className="flex-1 bg-fin-bgSec border border-fin-accent/50 rounded-full px-4 py-1.5 text-xs text-fin-text outline-none focus:border-fin-accent transition-colors"
                     />
                     <button 
                       onClick={handleAddNewCategory}
                       className="p-1.5 bg-fin-accent text-white rounded-full hover:scale-105 active:scale-95 transition-transform"
                     >
                       <Check size={14} />
                     </button>
                     <button 
                       onClick={() => setIsCreatingCategory(false)}
                       className="p-1.5 bg-fin-bgSec text-fin-textTert rounded-full hover:text-fin-text transition-colors"
                     >
                       <X size={14} />
                     </button>
                   </div>
                 ) : (
                   <>
                     {filteredCategories.map(cat => (
                         <button 
                            key={cat.id} 
                            onClick={() => updateActiveDraft('category', cat.name)} 
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${activeDraft.category === cat.name ? `bg-fin-text text-fin-bg border-fin-text` : 'bg-fin-bgSec border-fin-border/50 text-fin-textSec hover:border-fin-border'}`}
                         >
                            {cat.name}
                         </button>
                     ))}
                     <button 
                        onClick={() => setIsCreatingCategory(true)} 
                        className="px-3 py-1.5 rounded-full text-xs border border-dashed border-fin-border text-fin-textTert flex items-center gap-1 hover:border-fin-accent hover:text-fin-accent transition-colors"
                     >
                        <Plus size={12} /> Категория
                     </button>
                   </>
                 )}
            </div>

            <div className="grid grid-cols-2 gap-2">
                 <div className="bg-fin-bgSec rounded-xl px-2 py-1.5 border border-fin-border/50 flex flex-col gap-1">
                      <span className="text-[8px] text-fin-textTert uppercase font-bold">{isPeriodic ? 'Начало' : 'Дата'}</span>
                      <div className="flex items-center gap-2"><Calendar size={12} className="text-fin-textTert"/><input type="date" value={activeDraft.date || ''} onChange={(e) => updateActiveDraft('date', e.target.value)} className="bg-transparent text-xs font-bold text-fin-text outline-none w-full" /></div>
                 </div>
                 <div className="bg-fin-bgSec rounded-xl px-2 py-1.5 border border-fin-border/50 flex flex-col gap-1">
                    <span className="text-[8px] text-fin-textTert uppercase font-bold">Период</span>
                    <div className="flex items-center gap-2"><Repeat size={12} className="text-fin-textTert"/><select value={activeDraft.recurrence} onChange={(e) => updateActiveDraft('recurrence', e.target.value)} className="bg-transparent text-xs font-bold text-fin-text outline-none w-full appearance-none">
                        <option value={Recurrence.NONE}>Разово</option>
                        <option value={Recurrence.DAILY}>Каждый день</option>
                        <option value={Recurrence.WEEKLY}>Каждую неделю</option>
                        <option value={Recurrence.MONTHLY}>Каждый месяц</option>
                        <option value={Recurrence.YEARLY}>Каждый год</option>
                    </select></div>
                 </div>
            </div>

            {isPeriodic && (
                <div className="bg-fin-bgSec rounded-xl px-2 py-1.5 border border-fin-border/50 flex flex-col gap-1 animate-in fade-in slide-in-from-top-2">
                    <span className="text-[8px] text-fin-textTert uppercase font-bold">Дата завершения</span>
                    <div className="flex items-center gap-2"><Calendar size={12} className="text-fin-textTert"/><input type="date" value={activeDraft.recurrenceEndDate || ''} onChange={(e) => updateActiveDraft('recurrenceEndDate', e.target.value)} className="bg-transparent text-xs font-bold text-fin-text outline-none w-full" /></div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-2">
                 <button onClick={() => updateActiveDraft('status', activeDraft.status === 'ACTUAL' ? 'PLANNED' : 'ACTUAL')} className={`rounded-xl py-2 border text-[10px] font-bold uppercase transition-all ${activeDraft.status === 'PLANNED' ? 'bg-fin-accent/10 border-fin-accent/30 text-fin-accent' : 'bg-fin-bgSec border-fin-border/50 text-fin-textTert'}`}>{activeDraft.status === 'ACTUAL' ? 'Факт' : 'План'}</button>
                 <button onClick={() => updateActiveDraft('includeInBalance', !activeDraft.includeInBalance)} className={`rounded-xl py-2 border text-[10px] font-bold uppercase transition-all ${activeDraft.includeInBalance ? 'bg-fin-success/10 border-fin-success/30 text-fin-success' : 'bg-fin-bgSec border-fin-border/50 text-fin-textTert'}`}>{activeDraft.includeInBalance ? 'В балансе' : 'Скрыто'}</button>
            </div>

            <button onClick={handleSaveAll} disabled={!activeDraft.amount || activeDraft.amount <= 0 || !activeDraft.category} className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg ${!activeDraft.amount || activeDraft.amount <= 0 || !activeDraft.category ? 'bg-fin-bgSec text-fin-textTert border border-fin-border' : 'bg-fin-accent text-white'}`}><Check size={18} strokeWidth={3} /><span>Сохранить</span></button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TransactionModal;