import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password-security";

describe("segurança de senhas locais", () => {
  it("armazena hash com salt e valida somente a senha correta", async () => {
    const password = "SenhaSegura@2026";
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword("senha-incorreta", hash)).toBe(false);
  });

  it("gera hashes diferentes para a mesma senha", async () => {
    expect(await hashPassword("SenhaSegura@2026")).not.toBe(await hashPassword("SenhaSegura@2026"));
  });
});
