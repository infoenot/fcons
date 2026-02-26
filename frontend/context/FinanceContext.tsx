import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Transaction, TransactionType, Category, SummaryData, CashGap } from "../types";
import { api } from "../services/api";
import { format, startOfMonth, endOfMonth, parseISO, differenceInCalendarDays } from "date-fns";

interface ModalState {
  isOpen: boolean;
  mode: "ADD" | "EDIT" | "CONFIRM";
  drafts: Partial<Transaction>[];
}

interface FinanceContextType {
  transactions: Transaction[];
  categories: Category[];
  spaceId: number | null;
  loading: boolean;
  addTransaction: (t: Omit<Transaction, "id">) => Promise<void>;
  addTransactions: (ts: Omit<Transaction, "id">[]) => Promise<void>;
  updateTransaction: (t: Transaction) => void;
  deleteTransaction: (id: string) => Promise<void>;
  deleteTransactions: (ids: string[]) => Promise<void>;
  addCategory: (name: string, type: TransactionType) => Promise<void>;
  updateCategory: (id: string, newName: string) => void;
  getSummary: (monthDate: Date) => SummaryData;
  pendingConfirmations: Transaction[];
  modalState: ModalState;
  openTransactionModal: (mode: "ADD" | "EDIT" | "CONFIRM", data?: Partial<Transaction> | Partial<Transaction>[]) => void;
  closeTransactionModal: () => void;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [spaceId, setSpaceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingConfirmations, setPendingConfirmations] = useState<Transaction[]>([]);
  const [modalState, setModalState] = useState<ModalState>({ isOpen: false, mode: "ADD", drafts: [] });

  useEffect(() => {
    async function init() {
      try {
        await api.auth();
        const { space } = await api.getMySpace();
        setSpaceId(space.id);
        const [txRes, catRes] = await Promise.all([
          api.getTransactions(space.id),
          api.getCategories(space.id)
        ]);
        setTransactions(txRes.transactions || []);
        setCategories(catRes.categories || []);
      } catch (e) {
        console.error("Init error:", e);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  useEffect(() => {
    const today = new Date();
    const pending = transactions.filter(t => {
      if (t.status !== "PLANNED") return false;
      const txDate = parseISO(t.date);
      return differenceInCalendarDays(today, txDate) >= 0;
    });
    setPendingConfirmations(pending);
  }, [transactions]);

  const addTransaction = async (t: Omit<Transaction, "id">) => {
    if (!spaceId) return;
    const { transaction } = await api.addTransaction({ ...t, spaceId });
    setTransactions(prev => [...prev, { ...transaction, id: String(transaction.id) }]);
  };

  const addTransactions = async (ts: Omit<Transaction, "id">[]) => {
    for (const t of ts) await addTransaction(t);
  };

  const updateTransaction = (t: Transaction) => {
    setTransactions(prev => prev.map(tx => tx.id === t.id ? t : tx));
  };

  const deleteTransaction = async (id: string) => {
    await api.deleteTransaction(id);
    setTransactions(prev => prev.filter(tx => tx.id !== id));
  };

  const deleteTransactions = async (ids: string[]) => {
    for (const id of ids) await deleteTransaction(id);
  };

  const addCategory = async (name: string, type: TransactionType) => {
    if (!spaceId) return;
    const colors = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const { category } = await api.addCategory({ name, type, color, spaceId });
    setCategories(prev => [...prev, { ...category, id: String(category.id) }]);
  };

  const updateCategory = (id: string, newName: string) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name: newName } : c));
  };

  const getSummary = (monthDate: Date): SummaryData => {
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    let income = 0, expense = 0;
    transactions.forEach(t => {
      if (!t.includeInBalance) return;
      if (t.date >= format(start, "yyyy-MM-dd") && t.date <= format(end, "yyyy-MM-dd")) {
        if (t.type === "INCOME") income += t.amount;
        else expense += t.amount;
      }
    });
    const daysInMonth = end.getDate();
    let runningBalance = 0;
    let cashGap: CashGap | null = null;
    const today = new Date();
    [...transactions].sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime()).forEach(t => {
      if (!t.includeInBalance) return;
      if (t.type === "INCOME") runningBalance += t.amount;
      else runningBalance -= t.amount;
      if (runningBalance < 0 && !cashGap && differenceInCalendarDays(parseISO(t.date), today) >= 0) {
        cashGap = { date: t.date, amount: runningBalance };
      }
    });
    return { income, expense, balance: runningBalance, projectedBalance: runningBalance, cashGap, avgDailyIncome: income / daysInMonth, avgDailyExpense: expense / daysInMonth };
  };

  const openTransactionModal = (mode: "ADD" | "EDIT" | "CONFIRM", data?: Partial<Transaction> | Partial<Transaction>[]) => {
    let drafts: Partial<Transaction>[] = [];
    if (Array.isArray(data)) drafts = data;
    else if (data) drafts = [data];
    else drafts = [{}];
    setModalState({ isOpen: true, mode, drafts });
  };

  const closeTransactionModal = () => setModalState(prev => ({ ...prev, isOpen: false }));

  return (
    <FinanceContext.Provider value={{ transactions, categories, spaceId, loading, addTransaction, addTransactions, updateTransaction, deleteTransaction, deleteTransactions, addCategory, updateCategory, getSummary, pendingConfirmations, modalState, openTransactionModal, closeTransactionModal }}>
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) throw new Error("useFinance must be used within FinanceProvider");
  return context;
};
