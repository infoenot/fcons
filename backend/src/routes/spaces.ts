import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateTelegramAuth } from "../middleware/telegramAuth";

const router = Router();
const prisma = new PrismaClient();

// GET /api/spaces/my
router.get("/spaces/my", validateTelegramAuth, async (req, res) => {
  try {
    const tgUser = (req as any).telegramUser;
    let user = await prisma.user.findUnique({
      where: { telegramId: String(tgUser.id) },
      include: { spaces: { include: { space: true } } },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.spaces.length === 0) {
      const space = await prisma.space.create({
        data: { name: tgUser.first_name + " space" },
      });
      await prisma.spaceMember.create({
        data: { userId: user.id, spaceId: space.id, role: "owner" },
      });
      return res.json({ space });
    }

    res.json({ space: user.spaces[0].space });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/spaces/my/clear — удаляет все транзакции и категории space
router.delete("/spaces/my/clear", validateTelegramAuth, async (req, res) => {
  try {
    const tgUser = (req as any).telegramUser;
    const user = await prisma.user.findUnique({
      where: { telegramId: String(tgUser.id) },
      include: { spaces: true },
    });
    if (!user || user.spaces.length === 0) {
      return res.status(404).json({ error: "User or space not found" });
    }

    const spaceId = user.spaces[0].spaceId;

    // Удаляем транзакции и категории
    await prisma.transaction.deleteMany({ where: { spaceId } });
    await prisma.category.deleteMany({ where: { spaceId } });

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
