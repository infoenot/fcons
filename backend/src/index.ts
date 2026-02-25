import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import authRouter from "./routes/auth";
import transactionsRouter from "./routes/transactions";
import categoriesRouter from "./routes/categories";

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", authRouter);
app.use("/api", transactionsRouter);
app.use("/api", categoriesRouter);

async function main() {
  try {
    execSync("npx prisma db push --skip-generate", { stdio: "inherit", cwd: "/app/backend" });
    console.log("Database schema pushed");
  } catch (e) {
    console.error("DB push error:", e);
  }
  await prisma.$connect();
  console.log("Database connected");
  app.listen(port, "0.0.0.0", () => {
    console.log("Server running on port " + port);
  });
}

main().catch(console.error);