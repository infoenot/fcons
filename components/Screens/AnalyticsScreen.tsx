import React, { useState, useMemo } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  addMonths, subMonths, parseISO, differenceInCalendarDays, startOfWeek, endOfWeek
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Transaction, SummaryData, CashGap } from '../../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const AnalyticsScreen: React.FC = () => {
  const { transactions } = useFinance();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [includePlanned, setIncludePlanned] = useState(true);

  const filteredTransactions = useMemo(() => {
    if (includePlanned) {
      return transactions;
    }
    return transactions.filter(t => t.status === 'ACTUAL');
  }, [transactions, includePlanned]);

  const summary: SummaryData = useMemo(() => {
    const monthDate = currentMonth;
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    const today = new Date();
    
    let income = 0;
    let expense = 0;
    
    filteredTransactions.forEach(t => {
       if (!t.includeInBalance) return;
       const tDate = parseISO(t.date);
       if (tDate >= start && tDate <= end) {
           if (t.type === 'INCOME') income += t.amount;
           else expense += t.amount;
       }
    });

    const sortedTxs = [...filteredTransactions]
        .filter(t => t.includeInBalance)
        .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

    let runningBalance = 0;
    let cashGap: CashGap | null = null;
    let balanceEndOfMonth = 0;

    sortedTxs.forEach(t => {
        if (t.type === 'INCOME') runningBalance += t.amount;
        else runningBalance -= t.amount;
        const tDate = parseISO(t.date);
        if (runningBalance < 0 && !cashGap && differenceInCalendarDays(tDate, today) >= 0) {
            cashGap = { date: t.date, amount: runningBalance };
        }
        if (tDate <= end) {
            balanceEndOfMonth = runningBalance;
        }
    });

    // We must find the balance at the START of the current month to show total balance correctly.
    let startOfMonthBalance = 0;
    sortedTxs.forEach(t => {
        if (parseISO(t.date) < start) {
            if (t.type === 'INCOME') startOfMonthBalance += t.amount;
            else startOfMonthBalance -= t.amount;
        }
    });

    const daysInMonth = differenceInCalendarDays(end, start) + 1;
    return {
      income,
      expense,
      balance: startOfMonthBalance + income - expense, // Corrected balance logic
      projectedBalance: balanceEndOfMonth,
      cashGap,
      avgDailyIncome: daysInMonth > 0 ? income / daysInMonth : 0,
      avgDailyExpense: daysInMonth > 0 ? expense / daysInMonth : 0
    };
  }, [currentMonth, filteredTransactions]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const formatCurrency = (val: number, isExpense: boolean = false) => {
    const prefix = isExpense && val > 0 ? '-' : '';
    return prefix + val.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
  };

  const getCashGapDisplay = () => {
    if (!summary.cashGap) return 'Нет';
    const days = differenceInCalendarDays(parseISO(summary.cashGap.date), new Date());
    if (days < 0) return 'Просрочен';
    if (days === 0) return 'Сегодня';
    return `${days} д.`;
  };

  const stats = [
    { label: 'Поступления', value: formatCurrency(summary.income) },
    { label: 'Все расходы', value: formatCurrency(summary.expense, true) },
    { label: 'Доход в день', value: formatCurrency(summary.avgDailyIncome) },
    { label: 'Расход в день', value: formatCurrency(summary.avgDailyExpense, true) },
    { label: 'На конец мес.', value: formatCurrency(summary.projectedBalance) },
    { label: 'Кассовый разрыв', value: getCashGapDisplay() },
  ];
  
  const dailyBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    let running = 0;
    const sorted = [...filteredTransactions]
      .filter(t => t.includeInBalance)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    for (const t of sorted) {
      if (parseISO(t.date) < startDate) {
        running += (t.type === 'INCOME' ? t.amount : -t.amount);
      } else { break; }
    }
    
    const txMap = new Map<string, Transaction[]>();
    sorted.filter(t => parseISO(t.date) >= startDate).forEach(t => {
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
  }, [filteredTransactions, startDate, endDate]);

  const chartData = useMemo(() => {
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    return daysInMonth.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      return {
        day: format(day, 'd'), 
        balance: dailyBalances[dateStr] || 0
      };
    });
  }, [monthStart, monthEnd, dailyBalances]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-fin-card border border-fin-border p-2 rounded-lg text-xs shadow-none">
          <p className="text-fin-textTert mb-1">{label} {format(currentMonth, 'MMM', { locale: ru })}</p>
          <p className="text-fin-text font-bold">
            {payload[0].value.toLocaleString('ru-RU')} ₽
          </p>
        </div>
      );
    }
    return null;
  };
  
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="flex flex-col h-full bg-fin-bg overflow-y-auto no-scrollbar mt-2.5 transition-colors px-4 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between py-4 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-fin-text tracking-wide">{capitalize(format(currentMonth, 'LLLL yyyy', { locale: ru }))}</h2>
            <div className="flex gap-1">
                <button onClick={prevMonth} className="p-2 text-fin-textSec hover:text-fin-text hover:bg-fin-bgSec rounded-btn border border-transparent hover:border-fin-border transition-all"><ChevronLeft size={20} /></button>
                <button onClick={nextMonth} className="p-2 text-fin-textSec hover:text-fin-text hover:bg-fin-bgSec rounded-btn border border-transparent hover:border-fin-border transition-all"><ChevronRight size={20} /></button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-fin-textSec select-none w-8 text-right">{includePlanned ? 'Все' : 'Факт'}</span>
            <button
                onClick={() => setIncludePlanned(!includePlanned)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    includePlanned ? 'bg-fin-accent' : 'bg-fin-border'
                }`}
                role="switch"
                aria-checked={includePlanned}
            >
                <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        includePlanned ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
            </button>
          </div>
      </div>
        
      {/* Stats Dashboard */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-fin-card border border-fin-border rounded-card p-4 flex flex-col justify-between h-24 shadow-sm transition-colors">
            <span className="text-fin-textTert text-xs font-medium">{stat.label}</span>
            <span className="text-fin-text text-xl font-medium tracking-tight">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* BALANCE CHART BLOCK */}
      <div className="px-1">
           <h3 className="text-lg font-semibold text-fin-text mb-4 tracking-wide px-1">Динамика баланса</h3>
           <div className="bg-fin-card rounded-3xl border border-fin-border p-5 relative shadow-sm overflow-hidden h-[240px] [&_svg]:outline-none [&_:focus]:outline-none [&_.recharts-surface]:outline-none">
               <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.4} />
                     <XAxis 
                        dataKey="day" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'var(--color-text-tert)', fontSize: 10, fontWeight: 500 }}
                        dy={10}
                        interval="preserveStartEnd"
                     />
                     <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'var(--color-text-tert)', fontSize: 10, fontWeight: 500 }}
                        tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                     />
                     <Tooltip 
                        content={<CustomTooltip />} 
                        cursor={false}
                     />
                     <Line 
                        type="monotone" 
                        dataKey="balance" 
                        stroke="var(--color-accent)" 
                        strokeWidth={2} 
                        dot={false}
                        activeDot={{ r: 5, fill: 'var(--color-accent)', stroke: 'var(--color-bg)', strokeWidth: 2 }}
                        animationDuration={1500}
                     />
                  </LineChart>
               </ResponsiveContainer>
           </div>
      </div>
    </div>
  );
};

export default AnalyticsScreen;