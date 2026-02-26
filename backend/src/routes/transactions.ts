import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateTelegramAuth } from "../middleware/telegramAuth";

const router = Router();
const prisma = new PrismaClient();

// GET /api/transactions?spaceId=1
router.get("/transactions", validateTelegramAuth, async (req, res) => {
  try {
    const spaceId = Number(req.query.spaceId);
    if (!spaceId) return res.status(400).json({ error: "spaceId required" });

    const transactions = await prisma.transaction.findMany({
      where: { spaceId },
      orderBy: { date: "asc" },
    });

    // Приводим id к строке — фронт ожидает string
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
    const user = await prisma.user.findUnique({
      where: { telegramId: String(tgUser.id) },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    const {
      amount,
      type,
      category,
      description,
      date,
      spaceId,
      status = "ACTUAL",
      recurrence = "NONE",
      recurrenceEndDate,
      includeInBalance = true,
    } = req.body;

    if (!amount || !type || !category || !date || !spaceId) {
      return res.status(400).json({ error: "Missing required fields: amount, type, category, date, spaceId" });
    }

    const transaction = await prisma.transaction.create({
      data: {
        amount: Number(amount),
        type,
        category,
        description: description || null,
        date,
        status,
        recurrence,
        recurrenceEndDate: recurrenceEndDate || null,
        includeInBalance,
        addedById: user.id,
        spaceId: Number(spaceId),
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
    const {
      amount,
      type,
      category,
      description,
      date,
      status,
      recurrence,
      recurrenceEndDate,
      includeInBalance,
    } = req.body;

    const transaction = await prisma.transaction.update({
      where: { id: Number(req.params.id) },
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
    await prisma.transaction.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
