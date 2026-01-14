import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Transaction, TransactionType, Recurrence, Category, SummaryData, TransactionStatus, CashGap } from '../types';
import { format, addMonths, isBefore, parseISO, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, addDays, differenceInCalendarDays, isSameMonth } from 'date-fns';

interface ModalState {
  isOpen: boolean;
  mode: 'ADD' | 'EDIT' | 'CONFIRM'; 
  drafts: Partial<Transaction>[]; 
}

interface FinanceContextType {
  transactions: Transaction[];
  categories: Category[];
  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  addTransactions: (ts: Omit<Transaction, 'id'>[]) => void;
  updateTransaction: (t: Transaction) => void;
  deleteTransaction: (id: string) => void;
  deleteTransactions: (ids: string[]) => void;
  addCategory: (name: string, type: TransactionType) => void;
  updateCategory: (id: string, newName: string) => void;
  getSummary: (monthDate: Date) => SummaryData;
  pendingConfirmations: Transaction[];
  
  // Modal Control
  modalState: ModalState;
  openTransactionModal: (mode: 'ADD' | 'EDIT' | 'CONFIRM', data?: Partial<Transaction> | Partial<Transaction>[]) => void;
  closeTransactionModal: () => void;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('fin_transactions');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const saved = localStorage.getItem('fin_categories');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [pendingConfirmations, setPendingConfirmations] = useState<Transaction[]>([]);
  
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    mode: 'ADD',
    drafts: []
  });

  useEffect(() => {
    localStorage.setItem('fin_transactions', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem('fin_categories', JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    const today = new Date();
    const pending = transactions.filter(t => {
      if (t.status !== 'PLANNED') return false;
      const txDate = parseISO(t.date);
      return differenceInCalendarDays(today, txDate) >= 0;
    });
    setPendingConfirmations(pending);
  }, [transactions]);

  const addTransaction = (t: Omit<Transaction, 'id'>) => {
    const newTx: Transaction = { ...t, id: Math.random().toString(36).substr(2, 9) };
    setTransactions(prev => [...prev, newTx]);
  };

  const addTransactions = (ts: Omit<Transaction, 'id'>[]) => {
    const newTxs: Transaction[] = ts.map(t => ({ 
      ...t, 
      id: Math.random().toString(36).substr(2, 9) 
    }));
    setTransactions(prev => [...prev, ...newTxs]);
  };

  const updateTransaction = (t: Transaction) => {
    setTransactions(prev => prev.map(tx => tx.id === t.id ? t : tx));
  };

  const deleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(tx => tx.id !== id));
  };

  const deleteTransactions = (ids: string[]) => {
    setTransactions(prev => prev.filter(tx => !ids.includes(tx.id)));
  };

  const addCategory = (name: string, type: TransactionType) => {
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const newCat: Category = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      type,
      color: randomColor 
    };
    setCategories(prev => [...prev, newCat]);
  };

  const updateCategory = (id: string, newName: string) => {
    const oldCat = categories.find(c => c.id === id);
    if (!oldCat || !newName.trim()) return;
    const cleanName = newName.trim();
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name: cleanName } : c));
    setTransactions(prev => prev.map(t => 
        t.category === oldCat.name ? { ...t, category: cleanName } : t
    ));
  };

  const getSummary = (monthDate: Date): SummaryData => {
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    const today = new Date();
    
    let income = 0;
    let expense = 0;
    
    transactions.forEach(t => {
       if (!t.includeInBalance) return;
       if (t.date >= format(start, 'yyyy-MM-dd') && t.date <= format(end, 'yyyy-MM-dd')) {
           if (t.type === 'INCOME') income += t.amount;
           else expense += t.amount;
       }
    });

    const sortedTxs = [...transactions]
        .filter(t => t.includeInBalance)
        .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

    let runningBalance = 0;
    let cashGap: CashGap | null = null;
    let balanceEndOfMonth = 0;
    const endOfMonthStr = format(end, 'yyyy-MM-dd');

    sortedTxs.forEach(t => {
        if (t.type === 'INCOME') runningBalance += t.amount;
        else runningBalance -= t.amount;
        const tDate = parseISO(t.date);
        if (runningBalance < 0 && !cashGap && differenceInCalendarDays(tDate, today) >= 0) {
            cashGap = { date: t.date, amount: runningBalance };
        }
        if (t.date <= endOfMonthStr) {
            balanceEndOfMonth = runningBalance;
        }
    });

    const daysInMonth = end.getDate();
    return {
      income,
      expense,
      balance: runningBalance,
      projectedBalance: balanceEndOfMonth,
      cashGap,
      avgDailyIncome: daysInMonth > 0 ? income / daysInMonth : 0,
      avgDailyExpense: daysInMonth > 0 ? expense / daysInMonth : 0
    };
  };

  const openTransactionModal = (mode: 'ADD' | 'EDIT' | 'CONFIRM', data?: Partial<Transaction> | Partial<Transaction>[]) => {
    let drafts: Partial<Transaction>[] = [];
    if (Array.isArray(data)) drafts = data;
    else if (data) drafts = [data];
    else drafts = [{}];
    setModalState({ isOpen: true, mode, drafts });
  };

  const closeTransactionModal = () => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  };

  return (
    <FinanceContext.Provider value={{ 
      transactions, categories, addTransaction, addTransactions, updateTransaction, deleteTransaction,
      deleteTransactions, addCategory, updateCategory, getSummary, pendingConfirmations,
      modalState, openTransactionModal, closeTransactionModal
    }}>
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) throw new Error("useFinance must be used within FinanceProvider");
  return context;
};