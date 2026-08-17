const LEGACY_ENV_USERNAMES = new Set(["admfull", "comercial", "subcomercial", "gerencia", "diretoria"]);

type LocalIdentity = {
  openId?: string | null;
  username?: string | null;
  loginMethod?: string | null;
};

export function isLegacyEnvironmentUser(user: LocalIdentity | null | undefined) {
  if (!user) return false;
  const username = String(user.username || "").trim().toLowerCase();
  return user.loginMethod === "local"
    && user.openId === `local_login:${username}`
    && LEGACY_ENV_USERNAMES.has(username);
}
