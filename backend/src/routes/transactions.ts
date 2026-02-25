import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateTelegramAuth } from "../middleware/telegramAuth";

const router = Router();
const prisma = new PrismaClient();

router.get("/transactions", validateTelegramAuth, async (req, res) => {
  const tgUser = (req as any).telegramUser;
  const user = await prisma.user.findUnique({ where: { telegramId: String(tgUser.id) } });
  if (!user) return res.status(404).json({ error: "User not found" });
  const transactions = await prisma.transaction.findMany({ where: { userId: user.id }, orderBy: { date: "desc" }, include: { category: true } });
  res.json({ transactions });
});

router.post("/transactions", validateTelegramAuth, async (req, res) => {
  const tgUser = (req as any).telegramUser;
  const user = await prisma.user.findUnique({ where: { telegramId: String(tgUser.id) } });
  if (!user) return res.status(404).json({ error: "User not found" });
  const { amount, type, categoryId, description, date } = req.body;
  const transaction = await prisma.transaction.create({ data: { amount, type, categoryId, description, date: date ? new Date(date) : new Date(), userId: user.id } });
  res.json({ transaction });
});

router.delete("/transactions/:id", validateTelegramAuth, async (req, res) => {
  await prisma.transaction.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;