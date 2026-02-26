import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateTelegramAuth } from "../middleware/telegramAuth";

const router = Router();
const prisma = new PrismaClient();

// GET /api/categories?spaceId=1
router.get("/categories", validateTelegramAuth, async (req, res) => {
  try {
    const spaceId = Number(req.query.spaceId);
    if (!spaceId) return res.status(400).json({ error: "spaceId required" });

    const categories = await prisma.category.findMany({ where: { spaceId } });
    const result = categories.map((c) => ({ ...c, id: String(c.id) }));
    res.json({ categories: result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/categories
router.post("/categories", validateTelegramAuth, async (req, res) => {
  try {
    const { name, type = "EXPENSE", color = "#3B82F6", icon, spaceId } = req.body;

    if (!name || !spaceId) {
      return res.status(400).json({ error: "Missing required fields: name, spaceId" });
    }

    const category = await prisma.category.create({
      data: {
        name,
        type,
        color,
        icon: icon || null,
        spaceId: Number(spaceId),
      },
    });

    res.json({ category: { ...category, id: String(category.id) } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/categories/:id
router.put("/categories/:id", validateTelegramAuth, async (req, res) => {
  try {
    const { name, color } = req.body;
    const category = await prisma.category.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(name !== undefined && { name }),
        ...(color !== undefined && { color }),
      },
    });
    res.json({ category: { ...category, id: String(category.id) } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/categories/:id
router.delete("/categories/:id", validateTelegramAuth, async (req, res) => {
  try {
    await prisma.category.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
