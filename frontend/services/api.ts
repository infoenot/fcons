const API_URL = import.meta.env.VITE_API_URL || "https://infoenot-fcons-6ca6.twc1.net";

function getInitData() {
  return window.Telegram?.WebApp?.initData || "";
}

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(API_URL + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-telegram-init-data": getInitData(),
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  auth: () => request("/api/auth/telegram", { method: "POST" }),
  getMySpace: () => request("/api/spaces/my"),
  getTransactions: (spaceId: number) => request(`/api/transactions?spaceId=${spaceId}`),
  addTransaction: (data: any) => request("/api/transactions", { method: "POST", body: JSON.stringify(data) }),
  deleteTransaction: (id: string) => request(`/api/transactions/${id}`, { method: "DELETE" }),
  getCategories: (spaceId: number) => request(`/api/categories?spaceId=${spaceId}`),
  addCategory: (data: any) => request("/api/categories", { method: "POST", body: JSON.stringify(data) }),
};
