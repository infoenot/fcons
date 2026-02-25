import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateTelegramAuth } from "../middleware/telegramAuth";

const router = Router();
const prisma = new PrismaClient();

router.get("/transactions", validateTelegramAuth, async (req, res) => {
  try {
    const tgUser = (req as any).telegramUser;
    const user = await prisma.user.findUnique({ where: { telegramId: String(tgUser.id) } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const spaceId = Number(req.query.spaceId);
    const transactions = await prisma.transaction.findMany({ where: { spaceId }, orderBy: { createdAt: "desc" } });
    res.json({ transactions });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/transactions", validateTelegramAuth, async (req, res) => {
  try {
    const tgUser = (req as any).telegramUser;
    const user = await prisma.user.findUnique({ where: { telegramId: String(tgUser.id) } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const { amount, type, category, description, date, spaceId } = req.body;
    const transaction = await prisma.transaction.create({ data: { amount: Number(amount), type, category, description, date: date || new Date().toISOString(), addedById: user.id, spaceId: Number(spaceId) } });
    res.json({ transaction });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/transactions/:id", validateTelegramAuth, async (req, res) => {
  try {
    await prisma.transaction.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;