import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "~/lib/db/schema";

export function createAuth(d1: D1Database, env: Env) {
  const db = drizzle(d1);
  // `ENVIRONMENT` is generated as a literal type ("production"), so widen it
  // before comparing to allow a development deployment at runtime.
  const environment: string = env.ENVIRONMENT;
  const isDev = environment === "development";

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      usePlural: false,
      schema: authSchema,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: isDev ? "http://localhost:5173" : "https://skillx.sh",
    trustedOrigins: isDev ? ["http://localhost:5173"] : ["https://skillx.sh"],
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
  });
}
