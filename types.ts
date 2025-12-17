export type TransactionType = 'INCOME' | 'EXPENSE';

export enum Recurrence {
  NONE = 'NONE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY'
}

export type TransactionStatus = 'ACTUAL' | 'PLANNED';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  date: string; // ISO Date string YYYY-MM-DD
  category: string;
  status: TransactionStatus;
  recurrence: Recurrence;
  recurrenceEndDate?: string; // ISO Date string YYYY-MM-DD (Required if recurrence != NONE)
  includeInBalance: boolean;
  description?: string;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
}

export interface CashGap {
  date: string;
  amount: number;
}

export interface SummaryData {
  income: number;
  expense: number;
  balance: number;
  projectedBalance: number;
  cashGap: CashGap | null;
  avgDailyIncome: number;
  avgDailyExpense: number;
}