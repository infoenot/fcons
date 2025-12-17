import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Transaction, TransactionType, Recurrence, Category, SummaryData, TransactionStatus, CashGap } from '../types';
import { format, addMonths, isBefore, parseISO, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, addDays, differenceInCalendarDays, isSameMonth } from 'date-fns';

interface ModalState {
  isOpen: boolean;
  mode: 'ADD' | 'EDIT' | 'CONFIRM'; // CONFIRM acts like ADD but with pre-filled AI data
  drafts: Partial<Transaction>[]; // Changed from single initialData to array of drafts
}

interface FinanceContextType {
  transactions: Transaction[];
  categories: Category[];
  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  updateTransaction: (t: Transaction) => void;
  deleteTransaction: (id: string) => void;
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
  // Initialize state from localStorage if available
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('fin_transactions');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load transactions", e);
      return [];
    }
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const saved = localStorage.getItem('fin_categories');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load categories", e);
      return [];
    }
  });

  const [pendingConfirmations, setPendingConfirmations] = useState<Transaction[]>([]);
  
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    mode: 'ADD',
    drafts: []
  });

  // Save to localStorage whenever transactions change
  useEffect(() => {
    localStorage.setItem('fin_transactions', JSON.stringify(transactions));
  }, [transactions]);

  // Save to localStorage whenever categories change
  useEffect(() => {
    localStorage.setItem('fin_categories', JSON.stringify(categories));
  }, [categories]);

  // Check for past due planned transactions (Past + Today only)
  useEffect(() => {
    const today = new Date();
    const pending = transactions.filter(t => {
      // Must be planned
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

  const updateTransaction = (t: Transaction) => {
    setTransactions(prev => prev.map(tx => tx.id === t.id ? t : tx));
  };

  const deleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(tx => tx.id !== id));
  };

  const addCategory = (name: string, type: TransactionType) => {
    // Basic color generation or rotation could be added here
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

    // 1. Update the category itself
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name: cleanName } : c));

    // 2. Update all transactions linked to this category name
    // (Since we store category as string in Transaction)
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
    
    // 1. Calculate stats for the specific month (Actual + Planned if included)
    transactions.forEach(t => {
       if (!t.includeInBalance) return;
       
       const tDate = t.date; // string YYYY-MM-DD
       if (tDate >= format(start, 'yyyy-MM-dd') && tDate <= format(end, 'yyyy-MM-dd')) {
           if (t.type === 'INCOME') income += t.amount;
           else expense += t.amount;
       }
    });

    // 2. Calculate Total Balance (All time) & Cash Gap
    // To do this accurately for Cash Gap, we need to sort ALL transactions by date.
    const sortedTxs = [...transactions]
        .filter(t => t.includeInBalance)
        .sort((a, b) => {
            const dateA = parseISO(a.date).getTime();
            const dateB = parseISO(b.date).getTime();
            return dateA - dateB;
        });

    let runningBalance = 0;
    let cashGap: CashGap | null = null;
    let balanceEndOfMonth = 0;

    const endOfMonthStr = format(end, 'yyyy-MM-dd');

    sortedTxs.forEach(t => {
        if (t.type === 'INCOME') runningBalance += t.amount;
        else runningBalance -= t.amount;

        // Check for Cash Gap (only for future dates or today)
        // If running balance drops below zero, record it
        const tDate = parseISO(t.date);
        if (runningBalance < 0 && !cashGap && differenceInCalendarDays(tDate, today) >= 0) {
            cashGap = { date: t.date, amount: runningBalance };
        }

        // Capture balance at end of requested month
        if (t.date <= endOfMonthStr) {
            balanceEndOfMonth = runningBalance;
        }
    });

    const totalBalance = runningBalance; // Final state after all transactions

    // Average Calculation: Total (Plan + Actual) / Total Days in Month
    const daysInMonth = end.getDate();
    
    const avgDailyExpense = daysInMonth > 0 ? expense / daysInMonth : 0;
    const avgDailyIncome = daysInMonth > 0 ? income / daysInMonth : 0;

    return {
      income,
      expense,
      balance: totalBalance,
      projectedBalance: balanceEndOfMonth,
      cashGap,
      avgDailyIncome,
      avgDailyExpense
    };
  };

  const openTransactionModal = (mode: 'ADD' | 'EDIT' | 'CONFIRM', data?: Partial<Transaction> | Partial<Transaction>[]) => {
    let drafts: Partial<Transaction>[] = [];
    if (Array.isArray(data)) {
      drafts = data;
    } else if (data) {
      drafts = [data];
    } else {
      // Default empty draft
      drafts = [{}];
    }
    setModalState({ isOpen: true, mode, drafts });
  };

  const closeTransactionModal = () => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  };

  return (
    <FinanceContext.Provider value={{ 
      transactions, 
      categories, 
      addTransaction, 
      updateTransaction, 
      deleteTransaction,
      addCategory,
      updateCategory,
      getSummary,
      pendingConfirmations,
      modalState,
      openTransactionModal,
      closeTransactionModal
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