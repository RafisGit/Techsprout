import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { roles, users, userRoles } from '../schema';
import * as schema from '../schema';
import { SEED_ROLES, SEED_USERS } from './fixtures';
import { CryptoUtil } from '../../common/auth/crypto.util';
import { seedCatalog } from './catalog.seeder';
import { seedQuizzes } from './quiz.seeder';
import * as dotenv from 'dotenv';
dotenv.config();

async function runSeed() {
  console.log('--- Running TechSprout Database Seeder ---');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/techsprout',
  });
  const db = drizzle(pool, { schema });

  try {
    // 1. Seed Roles
    console.log('Seeding baseline roles...');
    for (const roleData of SEED_ROLES) {
      const existing = await db.select().from(roles).where(eq(roles.name, roleData.name)).limit(1);
      if (existing.length === 0) {
        await db.insert(roles).values(roleData);
        console.log(`- Created role: ${roleData.name}`);
      } else {
        console.log(`- Role already exists: ${roleData.name}`);
      }
    }

    // 2. Fetch created roles
    const allRoles = await db.select().from(roles);
    const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));

    // 3. Seed Users
    console.log('Seeding initial test users...');
    for (const userData of SEED_USERS) {
      const existing = await db.select().from(users).where(eq(users.email, userData.email)).limit(1);
      if (existing.length === 0) {
        const passwordHash = await CryptoUtil.hashPassword(userData.password);
        const [newUser] = await db
          .insert(users)
          .values({
            name: userData.name,
            username: userData.username,
            email: userData.email,
            phone: userData.phone,
            passwordHash,
            isVerified: userData.isVerified,
          })
          .returning();

        const roleId = roleMap.get(userData.role);
        if (roleId && newUser) {
          await db.insert(userRoles).values({
            userId: newUser.id,
            roleId,
          });
        }
        console.log(`- Created user: ${userData.email} (${userData.role})`);
      } else {
        console.log(`- User already exists: ${userData.email}`);
      }
    }

    // 4. Seed Catalog (Categories, Courses, Modules, Lessons)
    await seedCatalog(db);

    // 5. Seed Quizzes & Questions
    await seedQuizzes(db);

    console.log('Seeding completed successfully.');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runSeed();
}

export { runSeed };
