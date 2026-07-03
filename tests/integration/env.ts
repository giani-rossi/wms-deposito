import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.test.local") });

export const integrationEnabled = Boolean(
  process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.SUPABASE_ANON_KEY &&
    process.env.TEST_STAFF_EMAIL &&
    process.env.TEST_STAFF_PASSWORD
);
