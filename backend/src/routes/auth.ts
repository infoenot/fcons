import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { validateTelegramAuth } from '../middleware/telegramAuth';

const router = Router();
const prisma = new PrismaClient();

router.post('/auth/telegram', validateTelegramAuth, async (req, res) => {
  try {
    const tgUser = (req as any).telegramUser;
    
    let user = await prisma.user.findUnique({
      where: { telegramId: String(tgUser.id) }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: String(tgUser.id),
          name: `${tgUser.first_name} ${tgUser.last_name || ''}`.trim(),
          avatar: tgUser.photo_url || null,
        }
      });
    }

    res.json({ user });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
