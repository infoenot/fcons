import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Transaction, TransactionType, Category, SummaryData, CashGap, Recurrence, SpaceMember } from "../types";
import { api } from "../services/api";
import { format, startOfMonth, endOfMonth, parseISO, differenceInCalendarDays } from "date-fns";

interface TelegramUser {
  id: number;
  telegramId: string;
  name: string;
  avatar: string | null;
  plan: string;
}

interface ModalState {
  isOpen: boolean;
  mode: "ADD" | "EDIT" | "CONFIRM";
  drafts: Partial<Transaction>[];
}

interface FinanceContextType {
  transactions: Transaction[];
  categories: Category[];
  spaceId: number | null;
  spaceRole: string | null;
  spaceMembers: SpaceMember[];
  inviteLink: string | null;
  loading: boolean;
  currentUser: TelegramUser | null;
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
  refreshMembers: () => Promise<void>;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [spaceId, setSpaceId] = useState<number | null>(null);
  const [spaceRole, setSpaceRole] = useState<string | null>(null);
  const [spaceMembers, setSpaceMembers] = useState<SpaceMember[]>([]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<TelegramUser | null>(null);
  const [pendingConfirmations, setPendingConfirmations] = useState<Transaction[]>([]);
  const [modalState, setModalState] = useState<ModalState>({ isOpen: false, mode: "ADD", drafts: [] });

  useEffect(() => {
    async function init() {
      try {
        // Проверяем инвайт-токен в URL (startapp параметр Telegram)
        const tg = window.Telegram?.WebApp;
        const startParam = tg?.initDataUnsafe?.start_param || "";
        
        const { user } = await api.auth();
        setCurrentUser(user);

        let space, role;

        if (startParam.startsWith("invite_")) {
          const token = startParam.replace("invite_", "");
          try {
            const joinRes = await api.joinSpace(token);
            space = joinRes.space;
            role = joinRes.role;
          } catch (e) {
            // Если токен невалидный — грузим свой space
            const spaceRes = await api.getMySpace();
            space = spaceRes.space;
            role = spaceRes.role;
          }
        } else {
          const spaceRes = await api.getMySpace();
          space = spaceRes.space;
          role = spaceRes.role;
        }

        setSpaceId(space.id);
        setSpaceRole(role);

        // Генерируем инвайт-ссылку
        const BOT_NAME = "famcons_bot";
        const APP_NAME = "finapp";
        setInviteLink(`https://t.me/${BOT_NAME}/${APP_NAME}?startapp=invite_${space.inviteToken}`);

        const [txRes, catRes, membersRes] = await Promise.all([
          api.getTransactions(space.id),
          api.getCategories(space.id),
          api.getSpaceMembers(space.id),
        ]);

        setTransactions(txRes.transactions || []);
        setCategories(catRes.categories || []);
        setSpaceMembers(membersRes.members || []);
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
    const pending = transactions.filter((t) => {
      if (t.status !== "PLANNED") return false;
      const txDate = parseISO(t.date);
      return differenceInCalendarDays(today, txDate) >= 0;
    });
    setPendingConfirmations(pending);
  }, [transactions]);

  const refreshMembers = async () => {
    if (!spaceId) return;
    try {
      const res = await api.getSpaceMembers(spaceId);
      setSpaceMembers(res.members || []);
    } catch (e) {
      console.error("refreshMembers error:", e);
    }
  };

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
      setTransactions((prev) =>
        prev.map((t) => (t.category === oldCat.name ? { ...t, category: cleanName } : t))
      );
    } catch (e) {
      console.error("updateCategory error:", e);
    }
  };

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
        spaceRole,
        spaceMembers,
        inviteLink,
        loading,
        currentUser,
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
        refreshMembers,
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
