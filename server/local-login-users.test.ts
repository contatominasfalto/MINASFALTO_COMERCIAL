import { describe, expect, it } from "vitest";
import { isLegacyEnvironmentUser } from "./local-login-users";

describe("origem das credenciais locais", () => {
  it("reconhece as identidades legadas ligadas ao .env", () => {
    expect(isLegacyEnvironmentUser({ username: "subcomercial", openId: "local_login:subcomercial", loginMethod: "local" })).toBe(true);
    expect(isLegacyEnvironmentUser({ username: "admfull", openId: "local_login:admfull", loginMethod: "local" })).toBe(true);
  });

  it("não confunde novo usuário gerenciado com perfil ou nome legado", () => {
    expect(isLegacyEnvironmentUser({ username: "novo", openId: "managed:novo", loginMethod: "managed" })).toBe(false);
    expect(isLegacyEnvironmentUser({ username: "comercial", openId: "managed:comercial", loginMethod: "managed" })).toBe(false);
  });

  it("exige correspondência íntegra entre login e openId", () => {
    expect(isLegacyEnvironmentUser({ username: "subcomercial", openId: "local_login:comercial", loginMethod: "local" })).toBe(false);
  });
});
