import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { assertPermission } from "../access-control-db";
import { isMasterIdentity, permissionTargetForProcedure } from "../../shared/access-control";
import { recordAudit } from "../system-audit";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

const auditMutation = t.middleware(async (opts) => {
  if (opts.type !== "mutation") return opts.next();
  const input = await opts.getRawInput();
  const context = opts.ctx as TrpcContext;
  const request = context.req;
  const loginIdentity = opts.path === "auth.localLogin" && input && typeof input === "object"
    ? { username: String((input as { username?: unknown }).username || "").trim().toLowerCase(), name: "Tentativa de login" }
    : null;
  const details = { path: opts.path, input, user: context.user || loginIdentity, ipAddress: request?.ip || request?.socket?.remoteAddress, userAgent: request?.headers?.["user-agent"] };
  try {
    const result = await opts.next();
    await recordAudit({ ...details, result: "success" });
    return result;
  } catch (error) {
    await recordAudit({ ...details, result: "error", error });
    throw error;
  }
});

export const publicProcedure = t.procedure.use(auditMutation);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

const requireEffectivePermission = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  const target = permissionTargetForProcedure(opts.path, opts.type);
  await assertPermission(ctx.user, target.resource, target.action);
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser).use(requireEffectivePermission).use(auditMutation);

export const masterProcedure = t.procedure.use(requireUser).use(
  t.middleware(async ({ ctx, next }) => {
    if (!isMasterIdentity(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Acesso exclusivo do usuário master admfull." });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
).use(auditMutation);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || !isMasterIdentity(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
).use(auditMutation);
