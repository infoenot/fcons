import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Transaction, TransactionType, Category, SummaryData, CashGap, Recurrence } from "../types";
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
  addTransaction: (t: Omit<Transaction, "id">) => Promise<Transaction | null>;
  addTransactions: (ts: Omit<Transaction, "id">[]) => Promise<void>;
  updateTransaction: (t: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  deleteTransactions: (ids: string[]) => Promise<void>;
  addCategory: (name: string, type: TransactionType) => Promise<void>;
  updateCategory: (id: string, newName: string) => Promise<void>;
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

  // Инициализация: auth → space → данные
  useEffect(() => {
    async function init() {
      try {
        await api.auth();
        const { space } = await api.getMySpace();
        setSpaceId(space.id);

        const [txRes, catRes] = await Promise.all([
          api.getTransactions(space.id),
          api.getCategories(space.id),
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

  // Определяем просроченные плановые транзакции
  useEffect(() => {
    const today = new Date();
    const pending = transactions.filter((t) => {
      if (t.status !== "PLANNED") return false;
      const txDate = parseISO(t.date);
      return differenceInCalendarDays(today, txDate) >= 0;
    });
    setPendingConfirmations(pending);
  }, [transactions]);

  // ── ТРАНЗАКЦИИ ─────────────────────────────────────────────

  const addTransaction = async (t: Omit<Transaction, "id">): Promise<Transaction | null> => {
    if (!spaceId) return null;
    try {
      const { transaction } = await api.addTransaction({ ...t, spaceId });
      const normalized: Transaction = {
        ...transaction,
        id: String(transaction.id),
        status: transaction.status || "ACTUAL",
        recurrence: transaction.recurrence || Recurrence.NONE,
        includeInBalance: transaction.includeInBalance ?? true,
      };
      setTransactions((prev) => [...prev, normalized]);
      return normalized;
    } catch (e) {
      console.error("addTransaction error:", e);
      return null;
    }
  };

  const addTransactions = async (ts: Omit<Transaction, "id">[]): Promise<void> => {
    for (const t of ts) await addTransaction(t);
  };

  const updateTransaction = async (t: Transaction): Promise<void> => {
    try {
      await api.updateTransaction(t.id, t);
      setTransactions((prev) => prev.map((tx) => (tx.id === t.id ? t : tx)));
    } catch (e) {
      console.error("updateTransaction error:", e);
    }
  };

  const deleteTransaction = async (id: string): Promise<void> => {
    try {
      await api.deleteTransaction(id);
      setTransactions((prev) => prev.filter((tx) => tx.id !== id));
    } catch (e) {
      console.error("deleteTransaction error:", e);
    }
  };

  const deleteTransactions = async (ids: string[]): Promise<void> => {
    for (const id of ids) await deleteTransaction(id);
  };

  // ── КАТЕГОРИИ ──────────────────────────────────────────────

  const addCategory = async (name: string, type: TransactionType): Promise<void> => {
    if (!spaceId) return;
    try {
      const colors = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#6366F1"];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const { category } = await api.addCategory({ name, type, color, spaceId });
      setCategories((prev) => [...prev, { ...category, id: String(category.id) }]);
    } catch (e) {
      console.error("addCategory error:", e);
    }
  };

  const updateCategory = async (id: string, newName: string): Promise<void> => {
    const oldCat = categories.find((c) => c.id === id);
    if (!oldCat || !newName.trim()) return;
    try {
      await api.updateCategory(id, { name: newName.trim() });
      const cleanName = newName.trim();
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name: cleanName } : c)));
      // Обновляем название категории в транзакциях локально
      setTransactions((prev) =>
        prev.map((t) => (t.category === oldCat.name ? { ...t, category: cleanName } : t))
      );
    } catch (e) {
      console.error("updateCategory error:", e);
    }
  };

  // ── АНАЛИТИКА ──────────────────────────────────────────────

  const getSummary = (monthDate: Date): SummaryData => {
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    const today = new Date();
    let income = 0;
    let expense = 0;

    transactions.forEach((t) => {
      if (!t.includeInBalance) return;
      if (t.date >= format(start, "yyyy-MM-dd") && t.date <= format(end, "yyyy-MM-dd")) {
        if (t.type === "INCOME") income += t.amount;
        else expense += t.amount;
      }
    });

    const sorted = [...transactions]
      .filter((t) => t.includeInBalance)
      .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

    let runningBalance = 0;
    let balanceEndOfMonth = 0;
    let cashGap: CashGap | null = null;
    const endOfMonthStr = format(end, "yyyy-MM-dd");

    sorted.forEach((t) => {
      if (t.type === "INCOME") runningBalance += t.amount;
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
      avgDailyExpense: daysInMonth > 0 ? expense / daysInMonth : 0,
    };
  };

  // ── МОДАЛКА ────────────────────────────────────────────────

  const openTransactionModal = (
    mode: "ADD" | "EDIT" | "CONFIRM",
    data?: Partial<Transaction> | Partial<Transaction>[]
  ) => {
    let drafts: Partial<Transaction>[] = [];
    if (Array.isArray(data)) drafts = data;
    else if (data) drafts = [data];
    else drafts = [{}];
    setModalState({ isOpen: true, mode, drafts });
  };

  const closeTransactionModal = () => setModalState((prev) => ({ ...prev, isOpen: false }));

  return (
    <FinanceContext.Provider
      value={{
        transactions,
        categories,
        spaceId,
        loading,
        addTransaction,
        addTransactions,
        updateTransaction,
        deleteTransaction,
        deleteTransactions,
        addCategory,
        updateCategory,
        getSummary,
        pendingConfirmations,
        modalState,
        openTransactionModal,
        closeTransactionModal,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) throw new Error("useFinance must be used within FinanceProvider");
  return context;
};
