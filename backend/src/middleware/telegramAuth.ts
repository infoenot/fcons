import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
export function validateTelegramAuth(req: Request, res: Response, next: NextFunction) {
  const initData = req.headers["x-telegram-init-data"] as string;
  if (!initData) return res.status(401).json({ error: "No init data" });
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    params.delete("hash");
    const dataCheckString = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => k+"="+v).join("\n");
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(process.env.BOT_TOKEN || "").digest();
    const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    if (expectedHash !== hash) return res.status(401).json({ error: "Invalid hash" });
    const user = JSON.parse(params.get("user") || "{}");
    (req as any).telegramUser = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Auth failed" });
  }
}