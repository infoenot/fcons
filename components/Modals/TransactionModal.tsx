import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useFinance } from '../../context/FinanceContext';
import { useChat } from '../../context/ChatContext';
import { X, Plus, Check, Trash2, Repeat, AlignLeft, Calendar } from 'lucide-react';
import { Recurrence, Transaction } from '../../types';
import { format } from 'date-fns';

// Helper type for the draft state
interface TransactionDraft extends Partial<Transaction> {
  tempId: string; // Internal ID for the list
}

const TransactionModal: React.FC = () => {
  const { modalState, closeTransactionModal, addTransaction, updateTransaction, addCategory, categories } = useFinance();
  const { isOpen, mode, drafts: initialDrafts } = modalState;
  const { setMessages } = useChat();

  const [drafts, setDrafts] = useState<TransactionDraft[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Category Creation State
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Initialization
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

  const addNewDraft = () => {
    setDrafts(prev => [...prev, {
      tempId: `draft-${prev.length}-${Date.now()}`,
      type: 'EXPENSE',
      amount: 0,
      date: format(new Date(), 'yyyy-MM-dd'),
      status: 'ACTUAL',
      recurrence: Recurrence.NONE,
      includeInBalance: true,
      description: '',
      category: ''
    }]);
    setActiveIndex(drafts.length);
  };

  const removeActiveDraft = () => {
    if (drafts.length <= 1) {
      closeTransactionModal();
      return;
    }
    const newDrafts = drafts.filter((_, i) => i !== activeIndex);
    setDrafts(newDrafts);
    setActiveIndex(Math.max(0, activeIndex - 1));
  };

  const handleCreateCategory = () => {
      if (newCategoryName.trim()) {
          const cleanName = newCategoryName.trim();
          const type = activeDraft?.type || 'EXPENSE';
          
          const exists = categories.some(c => c.name.toLowerCase() === cleanName.toLowerCase() && c.type === type);
          if (!exists) {
            addCategory(cleanName, type);
            // Report new category creation to chat
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: `Создал новую категорию: ${cleanName}.`,
                timestamp: new Date()
            }]);
          }
          
          updateActiveDraft('category', cleanName);
          setIsCreatingCategory(false);
          setNewCategoryName('');
      }
  };

  const handleSaveAll = () => {
    const allValid = drafts.every(d => d.amount && d.amount > 0 && d.category && d.date);
    if (!allValid) return;

    const processedCategories = new Set<string>();

    drafts.forEach(d => {
       const rawCatName = d.category!;
       const catName = rawCatName.trim(); 
       const catType = d.type!;
       const uniqueKey = `${catName.toLowerCase()}-${catType}`;

       const existsInState = categories.some(c => c.name.toLowerCase() === catName.toLowerCase() && c.type === catType);
       
       if (!existsInState && !processedCategories.has(uniqueKey)) {
           addCategory(catName, catType);
           processedCategories.add(uniqueKey);
           // Report implicitly created category
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: `Создал новую категорию: ${catName}.`,
                timestamp: new Date()
            }]);
       }

       const txData = {
         type: d.type!,
         amount: Number(d.amount),
         date: d.date!,
         category: catName,
         status: d.status!,
         recurrence: d.recurrence!,
         recurrenceEndDate: d.recurrenceEndDate,
         includeInBalance: d.status === 'ACTUAL' ? true : (d.includeInBalance ?? true),
         description: d.description || '' 
       };

       if (mode === 'EDIT' && d.id) {
          updateTransaction({ ...d, ...txData } as Transaction);
       } else {
          addTransaction(txData as any);
       }
    });

    // Generate Report Message
    const isMultiple = drafts.length > 1;
    let message = "";

    if (isMultiple) {
        const total = drafts.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        if (mode === 'EDIT') {
             message = `Обновил несколько операций на общую сумму ${total} ₽.`;
        } else {
             message = `Добавил ${drafts.length} операции на общую сумму ${total} ₽.`;
        }
    } else {
        const d = drafts[0];
        const typeStr = d.type === 'INCOME' ? 'доход' : 'расход';
        
        if (mode === 'EDIT') {
            message = `Изменил операцию. Теперь это ${typeStr} в категории ${d.category} на сумму ${d.amount} ₽.`;
        } else if (mode === 'CONFIRM') {
            message = `Подтвердил, что ${typeStr} в категории ${d.category} на сумму ${d.amount} ₽ совершён.`;
        } else {
            message = `Записал ${typeStr} в категорию ${d.category} на сумму ${d.amount} ₽.`;
        }
    }

    setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: message,
        timestamp: new Date()
    }]);

    closeTransactionModal();
  };

  if (!isOpen || !activeDraft) return null;

  const filteredCategories = categories.filter(c => c.type === activeDraft.type);
  const isIncome = activeDraft.type === 'INCOME';
  const isGhostCategory = activeDraft.category && !filteredCategories.find(c => c.name.toLowerCase() === activeDraft.category?.toLowerCase());

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div onClick={closeTransactionModal} className="absolute inset-0" />
      <div 
        className="bg-fin-card w-full max-w-[380px] rounded-[28px] border border-fin-border flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header & Tabs */}
        <div className="pt-5 px-5 flex items-center justify-between shrink-0">
             <div className="flex items-center gap-2 overflow-hidden">
                {drafts.length > 1 ? (
                    <div className="flex items-center gap-1.5">
                        {drafts.map((d, idx) => (
                             <button 
                                key={d.tempId}
                                onClick={() => setActiveIndex(idx)}
                                className={`w-2 h-2 rounded-full transition-all ${activeIndex === idx ? 'bg-fin-accent scale-125' : 'bg-fin-border'}`}
                             />
                        ))}
                         <button onClick={addNewDraft} className="text-fin-textTert hover:text-fin-accent ml-1"><Plus size={14}/></button>
                    </div>
                ) : (
                    <h3 className="text-base font-bold text-fin-text">
                        {mode === 'EDIT' ? 'Редактирование' : 'Новая запись'}
                    </h3>
                )}
             </div>
             
             {/* Delete draft button if multiple or just close */}
             <div className="flex gap-2">
                 {drafts.length > 1 && (
                     <button onClick={removeActiveDraft} className="text-fin-error opacity-70 hover:opacity-100 transition-colors p-1">
                         <Trash2 size={18} />
                     </button>
                 )}
                 <button onClick={closeTransactionModal} className="text-fin-textSec hover:text-fin-text transition-colors p-1 bg-fin-bgSec rounded-full">
                     <X size={16} />
                 </button>
             </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
            
            {/* 1. Amount & Type Switcher Combined */}
            <div className="flex flex-col items-center gap-3">
                 {/* Compact Toggle */}
                 <div className="flex p-0.5 bg-fin-bgSec rounded-lg border border-fin-border/50 w-full max-w-[200px]">
                    <button 
                        onClick={() => { updateActiveDraft('type', 'EXPENSE'); updateActiveDraft('category', ''); }}
                        className={`flex-1 py-1.5 rounded-md text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${!isIncome ? 'bg-fin-card text-fin-error shadow-sm' : 'text-fin-textSec opacity-50 hover:opacity-100'}`}
                    >
                        Расход
                    </button>
                    <button 
                        onClick={() => { updateActiveDraft('type', 'INCOME'); updateActiveDraft('category', ''); }}
                        className={`flex-1 py-1.5 rounded-md text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${isIncome ? 'bg-fin-card text-fin-success shadow-sm' : 'text-fin-textSec opacity-50 hover:opacity-100'}`}
                    >
                        Доход
                    </button>
                </div>

                <div className="relative flex items-baseline justify-center gap-1">
                    <input 
                        type="number" 
                        value={activeDraft.amount || ''} 
                        onChange={(e) => updateActiveDraft('amount', e.target.value)}
                        placeholder="0"
                        className={`w-full bg-transparent text-center text-5xl font-bold outline-none placeholder-fin-border/20 transition-all ${isIncome ? 'text-fin-success' : 'text-fin-text'}`}
                        autoFocus
                    />
                    <span className="text-fin-textTert text-2xl font-medium absolute -right-6 top-1/2 -translate-y-1/2">₽</span>
                </div>
            </div>

            {/* 2. Category Chips (Horizontal Scroll) */}
            <div>
                 {isCreatingCategory ? (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                         <input 
                            type="text" 
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder="Название..."
                            className="flex-1 bg-fin-bgSec border border-fin-border rounded-xl px-3 py-2 text-sm text-fin-text outline-none focus:border-fin-accent"
                            autoFocus
                        />
                        <button onClick={handleCreateCategory} className="p-2 bg-fin-accent rounded-xl text-white"><Check size={16}/></button>
                        <button onClick={() => setIsCreatingCategory(false)} className="p-2 bg-fin-bgSec rounded-xl text-fin-textTert"><X size={16}/></button>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2 justify-center max-h-[92px] overflow-y-auto no-scrollbar mask-gradient-bottom">
                         {filteredCategories.map(cat => (
                             <button
                                key={cat.id}
                                onClick={() => updateActiveDraft('category', cat.name)}
                                className={`
                                    px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5
                                    ${activeDraft.category === cat.name 
                                        ? `bg-fin-text text-fin-bg border-fin-text shadow-sm` 
                                        : 'bg-fin-bgSec border-fin-border/50 text-fin-textSec hover:border-fin-textTert'}
                                `}
                             >
                                <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: cat.color}}></div>
                                {cat.name}
                             </button>
                         ))}

                         {isGhostCategory && (
                             <button
                                className={`px-3 py-1.5 rounded-full text-xs font-medium border border-fin-accent text-fin-accent shadow-sm flex items-center gap-1.5`}
                             >
                                {activeDraft.category} 
                             </button>
                         )}

                         <button 
                            onClick={() => setIsCreatingCategory(true)}
                            className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-fin-border text-fin-textTert hover:text-fin-accent hover:border-fin-accent transition-all flex items-center gap-1"
                         >
                             <Plus size={12} />
                         </button>
                    </div>
                )}
                {!activeDraft.category && !isCreatingCategory && (
                    <p className="text-center text-[10px] text-fin-textTert mt-1">Выберите категорию</p>
                )}
            </div>

            {/* 3. Compact Controls Row */}
            <div className="grid grid-cols-[1.2fr_0.8fr_1fr] gap-2">
                 {/* Date */}
                 <div className="bg-fin-bgSec rounded-xl px-2 py-1.5 border border-fin-border/50 flex items-center gap-2 overflow-hidden">
                      <Calendar size={14} className="text-fin-textTert shrink-0"/>
                      <input 
                            type="date"
                            value={activeDraft.date || ''}
                            onChange={(e) => updateActiveDraft('date', e.target.value)}
                            className="bg-transparent text-xs font-bold text-fin-text outline-none [color-scheme:dark] w-full p-0" 
                        />
                 </div>

                 {/* Status */}
                 <button 
                    onClick={() => updateActiveDraft('status', activeDraft.status === 'ACTUAL' ? 'PLANNED' : 'ACTUAL')}
                    className={`rounded-xl px-1 py-1.5 border flex items-center justify-center gap-1 transition-all ${
                        activeDraft.status === 'PLANNED' 
                        ? 'bg-fin-accent/10 border-fin-accent/30 text-fin-accent' 
                        : 'bg-fin-bgSec border-fin-border/50 text-fin-textTert hover:text-fin-text'
                    }`}
                 >
                    <span className="text-[10px] font-bold uppercase">{activeDraft.status === 'ACTUAL' ? 'Факт' : 'План'}</span>
                 </button>

                 {/* Recurrence */}
                 <div className="relative">
                    <select
                        value={activeDraft.recurrence}
                        onChange={(e) => updateActiveDraft('recurrence', e.target.value)}
                        className="appearance-none w-full bg-fin-bgSec border border-fin-border/50 rounded-xl px-2 pl-7 py-1.5 text-[10px] font-bold text-fin-text outline-none focus:border-fin-textTert"
                    >
                        <option value={Recurrence.NONE}>Разово</option>
                        <option value={Recurrence.DAILY}>Ежедневно</option>
                        <option value={Recurrence.WEEKLY}>Еженедельно</option>
                        <option value={Recurrence.MONTHLY}>Ежемесячно</option>
                        <option value={Recurrence.YEARLY}>Ежегодно</option>
                    </select>
                    <Repeat size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-fin-textTert pointer-events-none" />
                 </div>
            </div>

            {/* 4. Description */}
            <div className="bg-fin-bgSec rounded-xl px-3 py-2 border border-fin-border/50 flex items-center gap-2">
                <AlignLeft size={14} className="text-fin-textTert shrink-0" />
                <input 
                    type="text" 
                    value={activeDraft.description || ''}
                    onChange={(e) => updateActiveDraft('description', e.target.value)}
                    placeholder="Комментарий..."
                    className="w-full bg-transparent text-xs text-fin-text outline-none placeholder-fin-textTert"
                />
            </div>

            {/* Save Button */}
            <button 
                onClick={handleSaveAll}
                disabled={!activeDraft.amount || activeDraft.amount <= 0 || !activeDraft.category}
                className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg mt-2 ${
                    !activeDraft.amount || activeDraft.amount <= 0 || !activeDraft.category
                    ? 'bg-fin-bgSec text-fin-textTert cursor-not-allowed border border-fin-border' 
                    : 'bg-fin-accent hover:bg-fin-accentSec text-white hover:scale-[1.02] active:scale-[0.98]'
                }`}
            >
                <Check size={18} strokeWidth={3} />
                <span>{mode === 'EDIT' ? 'Сохранить изменения' : 'Добавить операцию'}</span>
            </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TransactionModal;