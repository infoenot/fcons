import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateTelegramAuth } from "../middleware/telegramAuth";

const router = Router();
const prisma = new PrismaClient();

router.get("/spaces/my", validateTelegramAuth, async (req, res) => {
  try {
    const tgUser = (req as any).telegramUser;
    let user = await prisma.user.findUnique({ where: { telegramId: String(tgUser.id) }, include: { spaces: { include: { space: true } } } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.spaces.length === 0) {
      const space = await prisma.space.create({ data: { name: tgUser.first_name + " space" } });
      await prisma.spaceMember.create({ data: { userId: user.id, spaceId: space.id, role: "owner" } });
      return res.json({ space });
    }
    res.json({ space: user.spaces[0].space });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;