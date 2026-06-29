import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

function getLocalUser(): User {
  const now = new Date();

  return {
    id: 0,
    openId: "local-dev-user",
    name: "Usuário Local",
    email: "local@minasfalto.test",
    loginMethod: "local",
    role: "admin",
    profile: "admfull",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  if (process.env.LOCAL_AUTH_BYPASS === "true") {
    return {
      req: opts.req,
      res: opts.res,
      user: getLocalUser(),
    };
  }

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
