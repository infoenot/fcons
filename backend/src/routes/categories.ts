import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateTelegramAuth } from "../middleware/telegramAuth";

const router = Router();
const prisma = new PrismaClient();

router.get("/categories", validateTelegramAuth, async (req, res) => {
  const tgUser = (req as any).telegramUser;
  const user = await prisma.user.findUnique({ where: { telegramId: String(tgUser.id) } });
  if (!user) return res.status(404).json({ error: "User not found" });
  const categories = await prisma.category.findMany({ where: { userId: user.id } });
  res.json({ categories });
});

router.post("/categories", validateTelegramAuth, async (req, res) => {
  const tgUser = (req as any).telegramUser;
  const user = await prisma.user.findUnique({ where: { telegramId: String(tgUser.id) } });
  if (!user) return res.status(404).json({ error: "User not found" });
  const { name, icon, color, type } = req.body;
  const category = await prisma.category.create({ data: { name, icon, color, type, userId: user.id } });
  res.json({ category });
});

export default router;