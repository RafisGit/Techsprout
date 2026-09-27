import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

async function runMigrations() {
  console.log('--- Applying TechSprout Database Migrations ---');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/techsprout',
  });
  const db = drizzle(pool);

  try {
    const migrationsFolder = path.resolve(__dirname, './migrations');
    console.log(`Reading migrations from: ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    console.log('Migrations applied successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations();
}

export { runMigrations };
