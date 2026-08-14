import { and, asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { permissionAuditLog, profilePermissions, userPermissions, users, type User } from "../drizzle/schema";
import { getDb } from "./db";
import { ACCESS_CATALOG, effectAllows, isMasterIdentity, legacyProfileEffect, resolvePermissionEffect, type PermissionEffect, type PermissionAction } from "../shared/access-control";

type ManagedUserInput = {
  username: string;
  name: string;
  email?: string | null;
  profile: "admfull" | "comercial" | "subcomercial" | "gerencia" | "diretoria";
  status: "active" | "inactive" | "archived";
};

async function database() {
  const connection = await getDb();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
  return connection;
}

export async function listManagedUsers() {
  const db = await database();
  const rows = await db.select().from(users).orderBy(asc(users.name), asc(users.username));
  return Promise.all(rows.map(async (user: User) => ({
    ...user,
    permissionCount: Number((await db.select().from(userPermissions).where(eq(userPermissions.userId, user.id))).length),
    protected: isMasterIdentity(user),
  })));
}

export async function getManagedUser(id: number) {
  const db = await database();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  return { ...user, protected: isMasterIdentity(user) };
}

async function ensureUniqueIdentity(username: string, email: string | null | undefined, exceptId?: number) {
  const all = await listManagedUsers();
  const normalized = username.trim().toLowerCase();
  if (all.some((item) => item.id !== exceptId && String(item.username || "").toLowerCase() === normalized)) {
    throw new TRPCError({ code: "CONFLICT", message: "Já existe um usuário com este login." });
  }
  if (email && all.some((item) => item.id !== exceptId && String(item.email || "").toLowerCase() === email.toLowerCase())) {
    throw new TRPCError({ code: "CONFLICT", message: "Já existe um usuário com este e-mail." });
  }
}

async function audit(actorUserId: number, targetUserId: number, action: string, previousValue: unknown, newValue: unknown, reason?: string) {
  const db = await database();
  await db.insert(permissionAuditLog).values({
    actorUserId, targetUserId, action,
    previousValue: previousValue == null ? null : JSON.stringify(previousValue),
    newValue: newValue == null ? null : JSON.stringify(newValue),
    reason: reason || null,
  });
}

export async function createManagedUser(input: ManagedUserInput, actorUserId: number) {
  await ensureUniqueIdentity(input.username, input.email);
  if (input.profile === "admfull" || input.username.toLowerCase() === "admfull") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Não é permitido criar outro usuário master." });
  }
  const db = await database();
  const result = await db.insert(users).values({
    openId: `managed:${input.username.toLowerCase()}`,
    username: input.username.toLowerCase(), name: input.name, email: input.email || null,
    loginMethod: "managed", role: "user", profile: input.profile, status: input.status,
    isProtected: false, updatedByUserId: actorUserId,
  });
  const id = Number(result[0]?.insertId);
  await audit(actorUserId, id, "user.create", null, input);
  return getManagedUser(id);
}

export async function updateManagedUser(id: number, input: ManagedUserInput, actorUserId: number) {
  const current = await getManagedUser(id);
  if (current.protected) throw new TRPCError({ code: "FORBIDDEN", message: "O usuário master é protegido e não pode ser alterado." });
  if (input.profile === "admfull" || input.username.toLowerCase() === "admfull") {
    throw new TRPCError({ code: "FORBIDDEN", message: "O perfil master não pode ser atribuído." });
  }
  await ensureUniqueIdentity(input.username, input.email, id);
  const db = await database();
  await db.update(users).set({
    username: input.username.toLowerCase(), name: input.name, email: input.email || null,
    profile: input.profile, status: input.status, role: "user", updatedByUserId: actorUserId,
    archivedAt: input.status === "archived" ? new Date() : null,
  }).where(eq(users.id, id));
  await audit(actorUserId, id, "user.update", current, input);
  return getManagedUser(id);
}

export async function setManagedUserStatus(id: number, status: "active" | "inactive" | "archived", actorUserId: number, reason: string) {
  const current = await getManagedUser(id);
  if (current.protected) throw new TRPCError({ code: "FORBIDDEN", message: "O usuário master não pode ser desativado ou excluído." });
  const db = await database();
  await db.update(users).set({ status, archivedAt: status === "archived" ? new Date() : null, updatedByUserId: actorUserId }).where(eq(users.id, id));
  await audit(actorUserId, id, `user.${status}`, { status: current.status }, { status }, reason);
  return { success: true } as const;
}

export async function getUserPermissionRows(userId: number) {
  const db = await database();
  const user = await getManagedUser(userId);
  const explicit = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
  const profile = await db.select().from(profilePermissions).where(eq(profilePermissions.profileKey, user.profile || "comercial"));
  return ACCESS_CATALOG.flatMap((resource) => resource.actions.map((action) => {
    const custom = explicit.find((row: any) => row.resourceKey === resource.key && row.actionKey === action.key);
    const inherited = profile.find((row: any) => row.resourceKey === resource.key && row.actionKey === action.key);
    const profileEffect = (inherited?.effect || legacyProfileEffect(user.profile, resource.key, action.key)) as PermissionEffect;
    return {
      resourceKey: resource.key, resourceLabel: resource.label,
      actionKey: action.key, actionLabel: action.label, write: action.write,
      effect: (user.protected ? "allow" : custom?.effect || profileEffect) as PermissionEffect,
      source: user.protected ? "protected" : custom ? "custom" : "profile",
      profileEffect,
    };
  }));
}

export async function replaceUserPermissionRows(userId: number, entries: Array<{ resourceKey: string; actionKey: string; effect: PermissionEffect | null }>, actorUserId: number) {
  const target = await getManagedUser(userId);
  if (target.protected || userId === actorUserId) {
    throw new TRPCError({ code: "FORBIDDEN", message: target.protected ? "As permissões do usuário master são imutáveis." : "Não é permitido alterar as próprias permissões." });
  }
  const valid = new Set(ACCESS_CATALOG.flatMap((resource) => resource.actions.map((action) => `${resource.key}:${action.key}`)));
  if (entries.some((entry) => !valid.has(`${entry.resourceKey}:${entry.actionKey}`))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A matriz contém uma permissão desconhecida." });
  }
  const db = await database();
  const previous = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
  await db.transaction(async (tx: any) => {
    await tx.delete(userPermissions).where(eq(userPermissions.userId, userId));
    const custom = entries.filter((entry) => entry.effect !== null);
    if (custom.length) await tx.insert(userPermissions).values(custom.map((entry) => ({ ...entry, effect: entry.effect!, userId, updatedByUserId: actorUserId })));
  });
  await audit(actorUserId, userId, "permissions.replace", previous, entries);
  return getUserPermissionRows(userId);
}

export async function getEffectivePermission(user: User, resourceKey: string, actionKey: PermissionAction): Promise<PermissionEffect> {
  if (isMasterIdentity(user)) return "allow";
  if ((user as any).status && (user as any).status !== "active") return "deny";
  if (!user.id || user.id < 1) return legacyProfileEffect(user.profile || user.name, resourceKey, actionKey);
  const db = await database();
  const [custom] = await db.select().from(userPermissions).where(and(
    eq(userPermissions.userId, user.id), eq(userPermissions.resourceKey, resourceKey), eq(userPermissions.actionKey, actionKey),
  )).limit(1);
  if (custom) return resolvePermissionEffect({ master: false, active: true, explicit: custom.effect as PermissionEffect });
  const [profile] = await db.select().from(profilePermissions).where(and(
    eq(profilePermissions.profileKey, user.profile || "comercial"), eq(profilePermissions.resourceKey, resourceKey), eq(profilePermissions.actionKey, actionKey),
  )).limit(1);
  return resolvePermissionEffect({ master: false, active: true, profile: (profile?.effect || legacyProfileEffect(user.profile || user.name, resourceKey, actionKey)) as PermissionEffect });
}

export async function canAccess(user: User, resourceKey: string, actionKey: PermissionAction) {
  return effectAllows(await getEffectivePermission(user, resourceKey, actionKey), actionKey);
}

export async function assertPermission(user: User, resourceKey: string, actionKey: PermissionAction) {
  if (!(await canAccess(user, resourceKey, actionKey))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não possui permissão para executar esta ação." });
  }
}
