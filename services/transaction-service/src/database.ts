import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

export const databaseProvider = {
  provide: PG_POOL,
  useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }),
};
