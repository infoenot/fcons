import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useFinance } from '../../context/FinanceContext';
import { useChat } from '../../context/ChatContext';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, 
  addMonths, subMonths, parseISO, isToday, startOfWeek, endOfWeek, 
  isBefore, isSameDay, getDate, getDay, differenceInCalendarDays
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Transaction, Category, TransactionType } from '../../types';
import TransactionListModal from '../Modals/TransactionListModal';

// Remove isStatsOpen from props
const CalendarScreen: React.FC = () => {
  const { transactions, categories, addCategory, openTransactionModal, updateCategory } = useFinance();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const [listModalConfig, setListModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    subtitle: string;
    filterType: 'DATE' | 'CATEGORY';
    filterValue: any;
  }>({
    isOpen: false,
    title: '',
    subtitle: '',
    filterType: 'DATE',
    filterValue: null
  });
  
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);

  // --- Calendar Logic ---
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const dailyBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    const startStr = format(startDate, 'yyyy-MM-dd');
    let running = 0;
    const sorted = [...transactions]
      .filter(t => t.includeInBalance)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    for (const t of sorted) {
      if (t.date < startStr) {
        running += (t.type === 'INCOME' ? t.amount : -t.amount);
      } else {
        break; 
      }
    }
    
    const txMap = new Map<string, Transaction[]>();
    sorted.filter(t => t.date >= startStr).forEach(t => {
      if(!txMap.has(t.date)) txMap.set(t.date, []);
      txMap.get(t.date)!.push(t);
    });
    
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    days.forEach(day => {
      const dStr = format(day, 'yyyy-MM-dd');
      const dayTxs = txMap.get(dStr) || [];
      dayTxs.forEach(t => {
        running += (t.type === 'INCOME' ? t.amount : -t.amount);
      });
      balances[dStr] = running;
    });
    
    return balances;
  }, [transactions, startDate, endDate]);
  
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      if (a.type === 'INCOME' && b.type === 'EXPENSE') return -1;
      if (a.type === 'EXPENSE' && b.type === 'INCOME') return 1;
      return 0;
    });
  }, [categories]);

  const incomeCategories = sortedCategories.filter(c => c.type === 'INCOME');
  const expenseCategories = sortedCategories.filter(c => c.type === 'EXPENSE');


  const isTransactionOnDate = (t: Transaction, date: Date) => {
    const tDate = parseISO(t.date);
    if (isSameDay(tDate, date)) return true;
    if (t.recurrence === 'NONE') return false;
    if (isBefore(date, tDate)) return false;
    if (t.recurrence === 'DAILY') return true;
    if (t.recurrence === 'WEEKLY') return getDay(tDate) === getDay(date);
    if (t.recurrence === 'MONTHLY') return getDate(tDate) === getDate(date);
    if (t.recurrence === 'YEARLY') return getDate(tDate) === getDate(date) && tDate.getMonth() === date.getMonth();
    return false;
  };

  const getTransactionsForDate = (date: Date) => {
      return transactions.filter(t => isTransactionOnDate(t, date));
  };

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const getCategoryTotal = (catName: string) => {
    let total = 0;
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    daysInMonth.forEach(day => {
      getTransactionsForDate(day).forEach(t => {
        if (t.category.trim().toLowerCase() === catName.trim().toLowerCase() && t.includeInBalance) {
          total += t.amount;
        }
      });
    });
    return total;
  };

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const openDayDetails = (date: Date) => {
    setListModalConfig({
      isOpen: true,
      title: format(date, 'd MMMM', { locale: ru }),
      subtitle: format(date, 'eeee', { locale: ru }),
      filterType: 'DATE',
      filterValue: date
    });
  };

  const openCategoryDetails = (cat: Category) => {
    const dateFormatted = capitalize(format(currentMonth, 'MMM yy', { locale: ru })) + ' г.';
    setListModalConfig({
      isOpen: true,
      title: cat.name,
      subtitle: dateFormatted,
      filterType: 'CATEGORY',
      filterValue: cat
    });
  };

  const closeListModal = () => {
    setListModalConfig(prev => ({ ...prev, isOpen: false }));
  };

  const getModalTransactions = () => {
    if (!listModalConfig.isOpen) return [];
    if (listModalConfig.filterType === 'DATE') {
       return getTransactionsForDate(listModalConfig.filterValue as Date);
    } else {
       const cat = listModalConfig.filterValue as Category;
       const results: Transaction[] = [];
       const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
       daysInMonth.forEach(day => {
          getTransactionsForDate(day).forEach(t => {
            if (t.category.trim().toLowerCase() === cat.name.trim().toLowerCase()) {
              results.push(t);
            }
          });
       });
       return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
  };

  const handleAddFromList = () => {
     if (listModalConfig.filterType === 'DATE') {
        const dateStr = format(listModalConfig.filterValue as Date, 'yyyy-MM-dd');
        openTransactionModal('ADD', { date: dateStr });
     } else {
        const cat = listModalConfig.filterValue as Category;
        openTransactionModal('ADD', { category: cat.name, type: cat.type, date: format(new Date(), 'yyyy-MM-dd') });
     }
     closeListModal();
  };

  const handleCategoryRename = (newName: string) => {
      if (listModalConfig.filterType === 'CATEGORY' && listModalConfig.filterValue) {
          const cat = listModalConfig.filterValue as Category;
          updateCategory(cat.id, newName);
          setListModalConfig(prev => ({
              ...prev,
              title: newName
          }));
      }
  };

  return (
    <div className="flex flex-col h-full bg-fin-bg overflow-hidden mt-2.5 transition-colors">
      
      {/* Stats Dashboard REMOVED */}

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-4 pb-4">
        
        {/* Calendar Card */}
        <div className="bg-fin-card rounded-3xl border border-fin-border relative overflow-hidden shadow-sm mb-6 transition-colors">
            
            {/* Calendar Header */}
            <div className="flex items-center justify-between px-6 py-5 pt-6 shrink-0">
                <h2 className="text-lg font-semibold text-fin-text tracking-wide">{capitalize(format(currentMonth, 'LLLL yyyy', { locale: ru }))}</h2>
                <div className="flex gap-2">
                    <button onClick={prevMonth} className="p-2 text-fin-textSec hover:text-fin-text hover:bg-fin-bgSec rounded-btn border border-transparent hover:border-fin-border transition-all"><ChevronLeft size={20} /></button>
                    <button onClick={nextMonth} className="p-2 text-fin-textSec hover:text-fin-text hover:bg-fin-bgSec rounded-btn border border-transparent hover:border-fin-border transition-all"><ChevronRight size={20} /></button>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="px-5 pb-6">
                <div className="grid grid-cols-7 gap-1 mb-2">
                {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((d,i) => (
                    <div key={i} className="text-center text-xs text-fin-textTert">{d}</div>
                ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((day) => {
                    const txs = getTransactionsForDate(day);
                    const hasTx = txs.length > 0;
                    const today = isToday(day);
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const dateKey = format(day, 'yyyy-MM-dd');
                    const absoluteBalance = dailyBalances[dateKey] ?? 0;
                    const isCashGap = absoluteBalance < 0;

                    return (
                    <div 
                        key={day.toString()} 
                        onClick={() => openDayDetails(day)}
                        className={`
                        aspect-square rounded-btn flex items-center justify-center text-sm font-medium cursor-pointer transition-all relative overflow-hidden border
                        ${!isCurrentMonth ? 'opacity-30' : ''}
                        ${today 
                            ? 'bg-fin-accent/10 text-fin-accent border-fin-accent/50 dark:bg-[#6b9b85] dark:border-[#7fac98] dark:text-white' 
                            : isCashGap
                            ? 'bg-fin-error/10 text-fin-error border-fin-error/20 hover:brightness-110 dark:bg-[#191919] dark:border-[#313131] dark:text-fin-text'
                            : hasTx 
                                ? 'bg-fin-bgSec text-fin-text border-fin-border hover:brightness-105 dark:bg-[#333131] dark:border-[#3c3c3c]' 
                                : 'bg-transparent text-fin-textSec hover:bg-fin-bgSec border-transparent hover:border-fin-border transition-all'}
                        `}
                    >
                        <div className="relative z-10 flex flex-col items-center">
                        {format(day, 'd')}
                        </div>
                    </div>
                    );
                })}
                </div>
            </div>
        </div>

        {/* CATEGORY BLOCKS */}
        <div className="px-1 mb-6">
            <h3 className="text-lg font-semibold text-fin-text mb-4 tracking-wide px-1">Доходы</h3>
            <div className="grid grid-cols-2 gap-3">
                {incomeCategories.map(cat => {
                    const total = getCategoryTotal(cat.name);
                    return (
                        <div 
                            key={cat.id} 
                            onClick={() => openCategoryDetails(cat)}
                            className="bg-[#2E3432] rounded-card p-4 flex flex-col justify-between h-24 shadow-sm transition-all cursor-pointer active:scale-95 border border-[#40514A] hover:border-fin-borderFocus"
                        >
                            <span className="text-fin-textTert text-xs font-medium truncate">{cat.name}</span>
                            <span className={`text-xl font-medium tracking-tight truncate ${total > 0 ? 'text-fin-text' : 'text-fin-textTert'}`}>
                                {total.toLocaleString('ru-RU')} ₽
                            </span>
                        </div>
                    );
                })}
            </div>

            <h3 className="text-lg font-semibold text-fin-text mt-6 mb-4 tracking-wide px-1">Расходы</h3>
            <div className="grid grid-cols-2 gap-3">
                 {expenseCategories.map(cat => {
                    const total = getCategoryTotal(cat.name);
                    return (
                        <div 
                            key={cat.id} 
                            onClick={() => openCategoryDetails(cat)}
                            className="bg-fin-card border-fin-border rounded-card p-4 flex flex-col justify-between h-24 shadow-sm transition-all cursor-pointer active:scale-95 hover:border-fin-borderFocus border"
                        >
                            <span className="text-fin-textTert text-xs font-medium truncate">{cat.name}</span>
                            <span className={`text-xl font-medium tracking-tight truncate ${total > 0 ? 'text-fin-text' : 'text-fin-textTert'}`}>
                                {total > 0 ? '-' : ''}{total.toLocaleString('ru-RU')} ₽
                            </span>
                        </div>
                    );
                })}
                 <button 
                    onClick={() => setIsAddCategoryOpen(true)}
                    className="bg-transparent border-2 border-dashed border-fin-border/50 hover:border-fin-accent/50 dark:bg-[#252525] dark:border-[#353535] dark:border-solid dark:border rounded-card p-4 flex flex-col items-center justify-center gap-2 text-fin-textTert hover:text-fin-accent transition-all h-24 group"
                    >
                        <div className="flex items-center justify-center group-hover:scale-110 transition-transform text-fin-text">
                            <Plus size={24} />
                        </div>
                </button>
            </div>
        </div>
      </div>

      <TransactionListModal 
          isOpen={listModalConfig.isOpen}
          onClose={closeListModal}
          title={listModalConfig.title}
          subtitle={listModalConfig.subtitle}
          transactions={getModalTransactions()}
          mode="DEFAULT"
          onAdd={handleAddFromList}
          onTitleChange={listModalConfig.filterType === 'CATEGORY' ? handleCategoryRename : undefined}
      />

      {isAddCategoryOpen && (
          <AddCategoryModal 
            onClose={() => setIsAddCategoryOpen(false)} 
            onAdd={addCategory} 
          />
      )}
    </div>
  );
};

interface AddCategoryModalProps {
    onClose: () => void;
    onAdd: (name: string, type: TransactionType) => void;
}

const AddCategoryModal: React.FC<AddCategoryModalProps> = ({ onClose, onAdd }) => {
    const [name, setName] = useState('');
    const [type, setType] = useState<TransactionType>('EXPENSE');
    const { setMessages } = useChat();

    const handleSave = () => {
        if (name.trim()) {
            onAdd(name.trim(), type);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: `Создал новую категорию: ${name.trim()}.`,
                timestamp: new Date()
            }]);
            onClose();
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div onClick={onClose} className="absolute inset-0" />
            <div className="bg-fin-card w-full max-w-sm rounded-[32px] p-6 border border-fin-border shadow-2xl relative animate-in zoom-in-95 duration-200 transition-colors">
                <h3 className="text-lg font-bold text-fin-text mb-4">Новая категория</h3>
                <div className="space-y-4">
                    <input 
                        autoFocus
                        type="text" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Название (например: Спорт)"
                        className="w-full bg-fin-bgSec border border-fin-border rounded-input px-4 py-3 text-fin-text outline-none focus:border-fin-accent transition-colors"
                    />
                    <div className="flex bg-fin-bgSec p-1 rounded-btn">
                        <button 
                            onClick={() => setType('EXPENSE')}
                            className={`flex-1 py-2 rounded-input text-xs font-bold flex items-center justify-center gap-2 transition-all ${type === 'EXPENSE' ? 'bg-fin-card text-fin-error shadow-sm' : 'text-fin-textSec hover:text-fin-text'}`}
                        >
                            Расход
                        </button>
                        <button 
                            onClick={() => setType('INCOME')}
                            className={`flex-1 py-2 rounded-input text-xs font-bold flex items-center justify-center gap-2 transition-all ${type === 'INCOME' ? 'bg-fin-card text-fin-success shadow-sm' : 'text-fin-textSec hover:text-fin-text'}`}
                        >
                            Доход
                        </button>
                    </div>
                    <button 
                        onClick={handleSave}
                        disabled={!name.trim()}
                        className={`w-full py-3 rounded-btn font-bold text-fin-bg mt-2 transition-all ${!name.trim() ? 'bg-fin-textTert cursor-not-allowed' : 'bg-fin-text hover:bg-white'}`}
                    >
                        Создать
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default CalendarScreen;