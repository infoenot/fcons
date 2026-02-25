import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

// Run migrations on startup
try {
  execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: '/app/backend' });
  console.log('Migrations applied');
} catch (e) {
  console.error('Migration error:', e);
}

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
