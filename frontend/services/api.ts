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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  // Auth
  auth: () => request("/api/auth/telegram", { method: "POST" }),

  // Spaces
  getMySpace: () => request("/api/spaces/my"),
  clearAllData: () => request("/api/spaces/my/clear", { method: "DELETE" }),

  // Transactions
  getTransactions: (spaceId: number) =>
    request(`/api/transactions?spaceId=${spaceId}`),
  addTransaction: (data: any) =>
    request("/api/transactions", { method: "POST", body: JSON.stringify(data) }),
  updateTransaction: (id: string, data: any) =>
    request(`/api/transactions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTransaction: (id: string) =>
    request(`/api/transactions/${id}`, { method: "DELETE" }),

  // Categories
  getCategories: (spaceId: number) =>
    request(`/api/categories?spaceId=${spaceId}`),
  addCategory: (data: any) =>
    request("/api/categories", { method: "POST", body: JSON.stringify(data) }),
  updateCategory: (id: string, data: any) =>
    request(`/api/categories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCategory: (id: string) =>
    request(`/api/categories/${id}`, { method: "DELETE" }),
};
