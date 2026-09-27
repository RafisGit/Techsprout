import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env.config';
import * as schema from './schema';

export const DRIZZLE_DB = 'DRIZZLE_DB';

export type DrizzleDB = NodePgDatabase<typeof schema>;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  public pool: Pool;
  public db: DrizzleDB;

  constructor() {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
    });
    this.db = drizzle(this.pool, { schema });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
