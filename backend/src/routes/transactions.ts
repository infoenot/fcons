import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateTelegramAuth } from "../middleware/telegramAuth";

const router = Router();
const prisma = new PrismaClient();

// Хелпер — получить пользователя и его роль в space
async function getUserRole(tgId: string, spaceId: number) {
  const user = await prisma.user.findUnique({ where: { telegramId: tgId } });
  if (!user) return { user: null, role: null };
  const member = await prisma.spaceMember.findUnique({
    where: { userId_spaceId: { userId: user.id, spaceId } },
  });
  return { user, role: member?.role || null };
}

// GET /api/transactions?spaceId=1
router.get("/transactions", validateTelegramAuth, async (req, res) => {
  try {
    const spaceId = Number(req.query.spaceId);
    if (!spaceId) return res.status(400).json({ error: "spaceId required" });

    const tgUser = (req as any).telegramUser;
    const { role } = await getUserRole(String(tgUser.id), spaceId);
    if (!role) return res.status(403).json({ error: "Access denied" });

    const transactions = await prisma.transaction.findMany({
      where: { spaceId },
      orderBy: { date: "asc" },
      include: {
        addedBy: { select: { id: true, name: true, avatar: true, telegramId: true } },
      },
    });

    const result = transactions.map((t) => ({ ...t, id: String(t.id) }));
    res.json({ transactions: result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/transactions
router.post("/transactions", validateTelegramAuth, async (req, res) => {
  try {
    const tgUser = (req as any).telegramUser;
    const { spaceId } = req.body;

    const { user, role } = await getUserRole(String(tgUser.id), Number(spaceId));
    if (!user || !role) return res.status(403).json({ error: "Access denied" });

    const {
      amount, type, category, description, date,
      status = "ACTUAL", recurrence = "NONE",
      recurrenceEndDate, includeInBalance = true,
    } = req.body;

    if (!amount || !type || !category || !date || !spaceId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const transaction = await prisma.transaction.create({
      data: {
        amount: Number(amount), type, category,
        description: description || null, date, status, recurrence,
        recurrenceEndDate: recurrenceEndDate || null,
        includeInBalance, addedById: user.id, spaceId: Number(spaceId),
      },
      include: {
        addedBy: { select: { id: true, name: true, avatar: true, telegramId: true } },
      },
    });

    res.json({ transaction: { ...transaction, id: String(transaction.id) } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/transactions/:id
router.put("/transactions/:id", validateTelegramAuth, async (req, res) => {
  try {
    const tgUser = (req as any).telegramUser;
    const txId = Number(req.params.id);

    // Загружаем транзакцию чтобы узнать spaceId и addedById
    const existing = await prisma.transaction.findUnique({ where: { id: txId } });
    if (!existing) return res.status(404).json({ error: "Transaction not found" });

    const { user, role } = await getUserRole(String(tgUser.id), existing.spaceId);
    if (!user || !role) return res.status(403).json({ error: "Access denied" });

    // member_own может редактировать только свои транзакции
    if (role === "member_own" && existing.addedById !== user.id) {
      return res.status(403).json({ error: "You can only edit your own transactions" });
    }

    const {
      amount, type, category, description, date,
      status, recurrence, recurrenceEndDate, includeInBalance,
    } = req.body;

    const transaction = await prisma.transaction.update({
      where: { id: txId },
      data: {
        ...(amount !== undefined && { amount: Number(amount) }),
        ...(type !== undefined && { type }),
        ...(category !== undefined && { category }),
        ...(description !== undefined && { description }),
        ...(date !== undefined && { date }),
        ...(status !== undefined && { status }),
        ...(recurrence !== undefined && { recurrence }),
        ...(recurrenceEndDate !== undefined && { recurrenceEndDate }),
        ...(includeInBalance !== undefined && { includeInBalance }),
      },
      include: {
        addedBy: { select: { id: true, name: true, avatar: true, telegramId: true } },
      },
    });

    res.json({ transaction: { ...transaction, id: String(transaction.id) } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/transactions/:id
router.delete("/transactions/:id", validateTelegramAuth, async (req, res) => {
  try {
    const tgUser = (req as any).telegramUser;
    const txId = Number(req.params.id);

    const existing = await prisma.transaction.findUnique({ where: { id: txId } });
    if (!existing) return res.status(404).json({ error: "Transaction not found" });

    const { user, role } = await getUserRole(String(tgUser.id), existing.spaceId);
    if (!user || !role) return res.status(403).json({ error: "Access denied" });

    // member_own может удалять только свои транзакции
    if (role === "member_own" && existing.addedById !== user.id) {
      return res.status(403).json({ error: "You can only delete your own transactions" });
    }

    await prisma.transaction.delete({ where: { id: txId } });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
