import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateTelegramAuth } from "../middleware/telegramAuth";

const router = Router();
const prisma = new PrismaClient();

router.get("/categories", validateTelegramAuth, async (req, res) => {
  try {
    const spaceId = Number(req.query.spaceId);
    const categories = await prisma.category.findMany({ where: { spaceId } });
    res.json({ categories });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/categories", validateTelegramAuth, async (req, res) => {
  try {
    const { name, icon, spaceId } = req.body;
    const category = await prisma.category.create({ data: { name, icon, spaceId: Number(spaceId) } });
    res.json({ category });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;