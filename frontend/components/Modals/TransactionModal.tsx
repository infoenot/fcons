import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useFinance } from '../../context/FinanceContext';
import { useChat } from '../../context/ChatContext';
import { X, Plus, Check, Trash2, Repeat, Calendar, ChevronDown, Edit3, AlertTriangle } from 'lucide-react';
import { Recurrence, Transaction, TransactionType, Category } from '../../types';
import { format, parseISO, addDays, addMonths, addYears, getDay, isBefore, isSameDay } from 'date-fns';
import BottomSheet from '../Shared/BottomSheet';


interface TransactionDraft extends Partial<Transaction> {
  tempId: string;
}

const TransactionModal: React.FC = () => {
  const { modalState, closeTransactionModal, addTransaction, addTransactions, updateTransaction, addCategory, categories, deleteTransaction } = useFinance();
  const { isOpen, mode, drafts: initialDrafts } = modalState;
  const { setMessages } = useChat();

  const [drafts, setDrafts] = useState<TransactionDraft[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShowDeleteConfirm(false);
      if (initialDrafts && initialDrafts.length > 0) {
        setDrafts(initialDrafts.map((d, i) => ({
          ...d,
          tempId: `draft-${i}-${Date.now()}`,
          type: d.type || 'EXPENSE',
          amount: d.amount !== undefined ? d.amount : undefined,
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
          amount: undefined,
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
    } else {
        setDrafts([]);
    }
  }, [isOpen, initialDrafts]);

  const activeDraft = drafts[activeIndex];

  const updateActiveDraft = (field: keyof TransactionDraft, value: any) => {
    setDrafts(prev => prev.map((d, i) => 
      i === activeIndex ? { ...d, [field]: value } : d
    ));
  };

  const handleSaveAll = async () => {
    const allValid = drafts.every(d => d.amount && d.amount > 0 && d.category && d.date);
    if (!allValid) return;
  
    const createdOrUpdatedTransactions: Transaction[] = [];
    const processedCategories = new Set<string>();
  
    for (const d of drafts) {
      const catName = d.category!.trim();
      const catType = d.type!;
      const uniqueKey = `${catName.toLowerCase()}-${catType}`;
  
      if (!categories.some(c => c.name.toLowerCase() === catName.toLowerCase() && c.type === catType) && !processedCategories.has(uniqueKey)) {
        await addCategory(catName, catType);
        processedCategories.add(uniqueKey);
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `Создал новую категорию: ${catName}.`, timestamp: new Date() }]);
      }
  
      const baseData = {
        type: d.type!,
        amount: Number(d.amount),
        category: catName,
        status: d.status!,
        recurrence: d.recurrence || Recurrence.NONE,
        includeInBalance: d.includeInBalance ?? true,
        description: d.description || ''
      };
  
      if (mode === 'EDIT' && d.id) {
        const updatedTx = { ...baseData, id: d.id, date: d.date! } as Transaction;
        updateTransaction(updatedTx);
        createdOrUpdatedTransactions.push(updatedTx);
      } else if (baseData.recurrence === Recurrence.NONE) {
        const newTx = await addTransaction({ ...baseData, date: d.date! });
        createdOrUpdatedTransactions.push(newTx);
      } else {
        const dates = generatePeriodicDates(d.date!, d.recurrenceEndDate!, baseData.recurrence);
        const batch = dates.map(date => ({ ...baseData, date }));
        const newTxs = await addTransactions(batch);
        createdOrUpdatedTransactions.push(...newTxs);
      }
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
      if (mode === 'EDIT' && activeDraft.id) {
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

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-fin-bg flex flex-col animate-in slide-in-from-bottom-full duration-300">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 shrink-0 border-b border-fin-border">
          <button onClick={closeTransactionModal} className="p-2 text-fin-textSec"><X size={24} /></button>
          <h3 className="text-base font-bold text-fin-text">{mode === 'EDIT' ? 'Редактирование' : 'Новая операция'}</h3>
          <button onClick={handleSaveAll} disabled={!isValid} className={`p-2 transition-colors ${isValid ? 'text-fin-accent' : 'text-fin-textTert'}`}><Check size={24} /></button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-5 pb-8 relative">
        <div className="flex flex-col items-center justify-center pt-8 pb-10">
          <div className="relative">
            <input 
              type="number" 
              value={activeDraft.amount === undefined ? '' : activeDraft.amount} 
              onChange={(e) => updateActiveDraft('amount', e.target.value ? parseFloat(e.target.value) : undefined)} 
              placeholder="0" 
              className={`bg-transparent text-center text-7xl font-bold w-full outline-none pr-10 ${activeDraft.type === 'INCOME' ? 'text-fin-success' : 'text-fin-text'}`}
              autoFocus
            />
            <span className="text-fin-textTert text-4xl font-medium absolute right-0 top-1/2 -translate-y-1/2 select-none">₽</span>
          </div>
          <div className="flex p-1 bg-fin-bgSec rounded-btn border border-fin-border mt-6 w-full max-w-[240px]">
              <button onClick={() => updateActiveDraft('type', 'EXPENSE')} className={`flex-1 py-2 rounded-input text-xs font-bold transition-all ${activeDraft.type === 'EXPENSE' ? 'bg-fin-card text-fin-error shadow-sm' : 'text-fin-textSec'}`}>Расход</button>
              <button onClick={() => updateActiveDraft('type', 'INCOME')} className={`flex-1 py-2 rounded-input text-xs font-bold transition-all ${activeDraft.type === 'INCOME' ? 'bg-fin-card text-fin-success shadow-sm' : 'text-fin-textSec'}`}>Доход</button>
          </div>
        </div>

        <div className="space-y-4">
            <div className="bg-fin-card rounded-card border border-fin-border divide-y divide-fin-border">
               <div onClick={() => setIsCategorySheetOpen(true)} className="p-4 flex justify-between items-center cursor-pointer">
                   <span className="text-sm font-medium text-fin-text">Категория</span>
                   <div className="flex items-center gap-2 text-sm">
                       <span className={activeDraft.category ? 'text-fin-text' : 'text-fin-textTert'}>{activeDraft.category || 'Выбрать'}</span>
                       <ChevronDown size={16} className="text-fin-textTert"/>
                   </div>
               </div>
               <div className="p-4 flex justify-between items-center">
                   <label htmlFor="date-input" className="text-sm font-medium text-fin-text">Дата</label>
                   <input id="date-input" type="date" value={activeDraft.date || ''} onChange={(e) => updateActiveDraft('date', e.target.value)} className="bg-transparent text-sm font-medium text-fin-text outline-none text-right" />
               </div>
               <div className="p-4 flex justify-between items-center">
                   <label htmlFor="desc-input" className="text-sm font-medium text-fin-text">Описание</label>
                   <input id="desc-input" type="text" placeholder='Заметка...' value={activeDraft.description || ''} onChange={(e) => updateActiveDraft('description', e.target.value)} className="bg-transparent text-sm font-medium text-fin-text outline-none text-right placeholder:text-fin-textTert w-1/2" />
               </div>
            </div>

             <div className="bg-fin-card rounded-card border border-fin-border divide-y divide-fin-border">
               <div className="p-4 flex justify-between items-center">
                   <span className="text-sm font-medium text-fin-text">Повторение</span>
                    <select value={activeDraft.recurrence} onChange={(e) => updateActiveDraft('recurrence', e.target.value as Recurrence)} className="bg-transparent text-sm font-medium text-fin-text outline-none appearance-none text-right">
                        <option value={Recurrence.NONE}>Разово</option>
                        <option value={Recurrence.DAILY}>Каждый день</option>
                        <option value={Recurrence.WEEKLY}>Каждую неделю</option>
                        <option value={Recurrence.MONTHLY}>Каждый месяц</option>
                        <option value={Recurrence.YEARLY}>Каждый год</option>
                    </select>
               </div>
               {isPeriodic && (
                  <div className="p-4 flex justify-between items-center animate-in fade-in">
                     <label htmlFor="recur-end-date" className="text-sm font-medium text-fin-text">Завершить</label>
                     <input id="recur-end-date" type="date" value={activeDraft.recurrenceEndDate || ''} onChange={(e) => updateActiveDraft('recurrenceEndDate', e.target.value)} className="bg-transparent text-sm font-medium text-fin-text outline-none text-right" />
                  </div>
               )}
            </div>
            
            <div className="bg-fin-card rounded-card border border-fin-border divide-y divide-fin-border">
                <div className="p-4 flex justify-between items-center">
                    <span className="text-sm font-medium text-fin-text">Статус</span>
                    <div className="flex p-0.5 bg-fin-bgSec rounded-btn border border-fin-border/50 text-xs font-bold">
                       <button onClick={() => updateActiveDraft('status', 'ACTUAL')} className={`px-3 py-1 rounded-input ${activeDraft.status === 'ACTUAL' ? 'bg-fin-card shadow-sm text-fin-text' : 'text-fin-textTert'}`}>Факт</button>
                       <button onClick={() => updateActiveDraft('status', 'PLANNED')} className={`px-3 py-1 rounded-input ${activeDraft.status === 'PLANNED' ? 'bg-fin-card shadow-sm text-fin-text' : 'text-fin-textTert'}`}>План</button>
                    </div>
                </div>
                <div className="p-4 flex justify-between items-center">
                    <span className="text-sm font-medium text-fin-text">Учет в балансе</span>
                     <button
                        onClick={() => updateActiveDraft('includeInBalance', !activeDraft.includeInBalance)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${activeDraft.includeInBalance ? 'bg-fin-accent' : 'bg-fin-border'}`}
                    >
                        <span aria-hidden="true" className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${activeDraft.includeInBalance ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>

            {mode === 'EDIT' && (
                <div className="pt-4">
                  <button 
                      onClick={() => setShowDeleteConfirm(true)} 
                      className="w-full flex items-center justify-center gap-2 py-3 bg-fin-error/10 text-fin-error rounded-btn border border-fin-error/20 font-bold text-sm hover:bg-fin-error/20 transition-colors"
                  >
                      <Trash2 size={16} />
                      Удалить операцию
                  </button>
                </div>
            )}
        </div>

        {/* Delete Confirmation Overlay */}
        {showDeleteConfirm && (
            <div className="absolute inset-0 bg-fin-bg/95 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200 z-50">
                <div className="w-16 h-16 bg-fin-error/10 text-fin-error rounded-full flex items-center justify-center mb-4">
                    <AlertTriangle size={32} />
                </div>
                <h4 className="text-xl font-bold text-fin-text mb-2">Удалить операцию?</h4>
                <p className="text-fin-textSec text-sm mb-8">Это действие нельзя отменить.</p>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button onClick={confirmDelete} className="w-full py-4 bg-fin-error text-white rounded-btn font-bold text-base active:scale-95 transition-all">Удалить</button>
                    <button onClick={() => setShowDeleteConfirm(false)} className="w-full py-4 bg-fin-bgSec border border-fin-border text-fin-text rounded-btn font-bold text-base active:scale-95 transition-all">Отмена</button>
                </div>
            </div>
        )}
      </div>

      <CategorySelectionSheet 
        isOpen={isCategorySheetOpen}
        onClose={() => setIsCategorySheetOpen(false)}
        onSelect={(catName) => {
            updateActiveDraft('category', catName);
            setIsCategorySheetOpen(false);
        }}
        activeType={activeDraft.type!}
      />

    </div>,
    document.body
  );
};

// --- Category Selection Bottom Sheet ---
interface CategorySheetProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (categoryName: string) => void;
    activeType: TransactionType;
}

const CategorySelectionSheet: React.FC<CategorySheetProps> = ({ isOpen, onClose, onSelect, activeType }) => {
    const { categories, addCategory } = useFinance();
    const [newCategoryName, setNewCategoryName] = useState('');
    const filteredCategories = useMemo(() => categories.filter(c => c.type === activeType), [categories, activeType]);

    const handleAddCategory = async () => {
        if (newCategoryName.trim()) {
            await addCategory(newCategoryName.trim(), activeType);
            onSelect(newCategoryName.trim());
            setNewCategoryName('');
        }
    };
    
    return (
        <BottomSheet isOpen={isOpen} onClose={onClose}>
            <div className="p-4 pb-6">
                <h4 className="text-lg font-bold text-fin-text text-center mb-4">Выберите категорию</h4>
                <div className="flex flex-wrap gap-2 justify-center max-h-48 overflow-y-auto no-scrollbar">
                    {filteredCategories.map(cat => (
                        <button key={cat.id} onClick={() => onSelect(cat.name)} className="px-4 py-2 bg-fin-bgSec border border-fin-border rounded-btn text-sm font-medium text-fin-text hover:border-fin-accent transition-colors">
                            {cat.name}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 mt-6 pt-4 border-t border-fin-border">
                    <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Или создайте новую..." className="flex-1 bg-fin-bgSec border border-fin-border rounded-input px-4 py-3 text-sm text-fin-text outline-none focus:border-fin-accent transition-colors" />
                    <button onClick={handleAddCategory} disabled={!newCategoryName.trim()} className="p-3 bg-fin-accent text-white rounded-btn disabled:opacity-50 transition-opacity"><Plus size={20}/></button>
                </div>
            </div>
        </BottomSheet>
    );
};

export default TransactionModal;