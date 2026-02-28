import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateTelegramAuth } from "../middleware/telegramAuth";

const router = Router();
const prisma = new PrismaClient();

// Хелпер — получить пользователя и его membership в space
async function getUserAndMember(tgId: string, spaceId: number) {
  const user = await prisma.user.findUnique({ where: { telegramId: tgId } });
  if (!user) return { user: null, member: null };
  const member = await prisma.spaceMember.findUnique({
    where: { userId_spaceId: { userId: user.id, spaceId } },
  });
  return { user, member };
}

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
      return res.json({ space, role: "owner" });
    }

    // Приоритет: если есть space где пользователь НЕ owner (т.е. вступил по инвайту) —
    // возвращаем его первым. Это решает проблему когда у пользователя есть и свой space и совместный.
    const joinedSpace = user.spaces.find(m => m.role !== "owner");
    const membership = joinedSpace || user.spaces[0];
    res.json({ space: membership.space, role: membership.role });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/spaces/:spaceId/members
router.get("/spaces/:spaceId/members", validateTelegramAuth, async (req, res) => {
  try {
    const tgUser = (req as any).telegramUser;
    const spaceId = Number(req.params.spaceId);

    const { member } = await getUserAndMember(String(tgUser.id), spaceId);
    if (!member) return res.status(403).json({ error: "Access denied" });

    const members = await prisma.spaceMember.findMany({
      where: { spaceId },
      include: { user: { select: { id: true, name: true, avatar: true, telegramId: true } } },
    });

    res.json({ members: members.map((m) => ({ ...m.user, role: m.role })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/spaces/:spaceId/members/:userId/role
router.put("/spaces/:spaceId/members/:userId/role", validateTelegramAuth, async (req, res) => {
  try {
    const tgUser = (req as any).telegramUser;
    const spaceId = Number(req.params.spaceId);
    const targetUserId = Number(req.params.userId);
    const { role } = req.body;

    if (!["member_full", "member_own"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const { member } = await getUserAndMember(String(tgUser.id), spaceId);
    if (!member || member.role !== "owner") {
      return res.status(403).json({ error: "Only owner can change roles" });
    }

    const updated = await prisma.spaceMember.update({
      where: { userId_spaceId: { userId: targetUserId, spaceId } },
      data: { role },
    });

    res.json({ success: true, member: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/spaces/:spaceId/members/:userId
router.delete("/spaces/:spaceId/members/:userId", validateTelegramAuth, async (req, res) => {
  try {
    const tgUser = (req as any).telegramUser;
    const spaceId = Number(req.params.spaceId);
    const targetUserId = Number(req.params.userId);

    const { user, member } = await getUserAndMember(String(tgUser.id), spaceId);
    if (!user || !member) return res.status(403).json({ error: "Access denied" });

    const isSelf = user.id === targetUserId;
    if (!isSelf && member.role !== "owner") {
      return res.status(403).json({ error: "Only owner can remove members" });
    }

    if (isSelf && member.role === "owner") {
      const count = await prisma.spaceMember.count({ where: { spaceId } });
      if (count > 1) return res.status(400).json({ error: "Transfer ownership before leaving" });
    }

    await prisma.spaceMember.delete({
      where: { userId_spaceId: { userId: targetUserId, spaceId } },
    });

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/spaces/join/:token — вступить по инвайт-ссылке
router.get("/spaces/join/:token", validateTelegramAuth, async (req, res) => {
  try {
    const tgUser = (req as any).telegramUser;
    const token = req.params.token;

    const space = await prisma.space.findUnique({ where: { inviteToken: token } });
    if (!space) return res.status(404).json({ error: "Invite link invalid" });

    let user = await prisma.user.findUnique({ where: { telegramId: String(tgUser.id) } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const existing = await prisma.spaceMember.findUnique({
      where: { userId_spaceId: { userId: user.id, spaceId: space.id } },
    });
    if (existing) {
      return res.json({ space, role: existing.role, alreadyMember: true });
    }

    await prisma.spaceMember.create({
      data: { userId: user.id, spaceId: space.id, role: "member_full" },
    });

    res.json({ space, role: "member_full", alreadyMember: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/spaces/my/clear — только owner
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

    const membership = user.spaces[0];
    if (membership.role !== "owner") {
      return res.status(403).json({ error: "Only owner can clear data" });
    }

    const spaceId = membership.spaceId;
    await prisma.transaction.deleteMany({ where: { spaceId } });
    await prisma.category.deleteMany({ where: { spaceId } });

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
