import { describe, expect, it } from "vitest";
import { appRouter, licitacaoSchema } from "./routers";
import { effectAllows, isMasterIdentity, legacyProfileEffect, permissionTargetForProcedure, resolvePermissionEffect } from "../shared/access-control";

const now = new Date();
const commonUser = { id: 20, openId: "local_login:comercial", username: "comercial", passwordHash: null, name: "comercial", email: null, loginMethod: "local", role: "user" as const, profile: "comercial" as const, status: "active" as const, isProtected: false, updatedByUserId: null, archivedAt: null, createdAt: now, updatedAt: now, lastSignedIn: now };

describe("controle de acesso", () => {
  it("normaliza o flag legado do alerta de pregão sem perder booleanos", () => {
    const base = { orgao: "PREFEITURA" };
    expect(licitacaoSchema.parse({ ...base, alertaPregao: 1 }).alertaPregao).toBe(true);
    expect(licitacaoSchema.parse({ ...base, alertaPregao: 0 }).alertaPregao).toBe(false);
    expect(licitacaoSchema.parse({ ...base, alertaPregao: true }).alertaPregao).toBe(true);
    expect(licitacaoSchema.safeParse({ ...base, alertaPregao: 2 }).success).toBe(false);
  });
  it("admfull sempre recebe acesso total", () => {
    expect(isMasterIdentity({ username: "admfull" })).toBe(true);
    expect(resolvePermissionEffect({ master: true, active: false, explicit: "deny", profile: "deny" })).toBe("allow");
  });

  it("deny bloqueia leitura e escrita", () => {
    expect(effectAllows("deny", "read")).toBe(false);
    expect(effectAllows("deny", "update")).toBe(false);
  });

  it("view permite leitura e bloqueia mutações", () => {
    expect(effectAllows("view", "read")).toBe(true);
    expect(effectAllows("view", "export")).toBe(true);
    expect(effectAllows("view", "create")).toBe(false);
    expect(effectAllows("view", "delete")).toBe(false);
  });

  it("permissão explícita vence o padrão do perfil", () => {
    expect(resolvePermissionEffect({ master: false, explicit: "deny", profile: "allow" })).toBe("deny");
    expect(resolvePermissionEffect({ master: false, explicit: "allow", profile: "deny" })).toBe("allow");
  });

  it("usuário inativo é bloqueado", () => {
    expect(resolvePermissionEffect({ master: false, active: false, explicit: "allow", profile: "allow" })).toBe("deny");
  });

  it("mantém o acesso legado equivalente", () => {
    expect(legacyProfileEffect("comercial", "comercial", "read")).toBe("allow");
    expect(legacyProfileEffect("comercial", "custo_obras", "read")).toBe("deny");
    expect(legacyProfileEffect("gerencia", "licitacoes", "update")).toBe("allow");
    expect(legacyProfileEffect("diretoria", "usuarios", "manage")).toBe("deny");
  });

  it("mapeia procedures para recursos e ações estáveis", () => {
    expect(permissionTargetForProcedure("licitacoes.adesoes.create", "mutation")).toEqual({ resource: "licitacoes", action: "create" });
    expect(permissionTargetForProcedure("crti.sincronizacaoCustosObras", "mutation")).toEqual({ resource: "custo_obras", action: "sync" });
  });

  it("mapeia o controle de usuários para a matriz granular", () => {
    expect(permissionTargetForProcedure("userManagement.list", "query")).toEqual({ resource: "usuarios", action: "read" });
    expect(permissionTargetForProcedure("userManagement.create", "mutation")).toEqual({ resource: "usuarios", action: "create" });
    expect(permissionTargetForProcedure("userManagement.update", "mutation")).toEqual({ resource: "usuarios", action: "update" });
    expect(permissionTargetForProcedure("userManagement.deleteOrArchive", "mutation")).toEqual({ resource: "usuarios", action: "delete" });
    expect(permissionTargetForProcedure("userManagement.replaceUserPermissions", "mutation")).toEqual({ resource: "usuarios", action: "manage" });
  });

  it("payload administrativo inválido é rejeitado por Zod", async () => {
    const master = { ...commonUser, id: 1, openId: "local_login:admfull", username: "admfull", name: "admfull", role: "admin" as const, profile: "admfull" as const, isProtected: true };
    const caller = appRouter.createCaller({ req: {} as any, res: {} as any, user: master });
    await expect(caller.userManagement.create({ username: "x", name: "", email: "inválido", profile: "comercial", status: "active", password: "12345678" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
