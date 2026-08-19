export const ACCESS_EFFECTS = ["allow", "deny", "view"] as const;
export type PermissionEffect = (typeof ACCESS_EFFECTS)[number];

export const USER_STATUSES = ["active", "inactive", "archived"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export type PermissionAction =
  | "access" | "read" | "create" | "update" | "delete"
  | "export" | "import" | "sync" | "manage" | "alerts" | "documents";

export type AccessResource = {
  key: string;
  label: string;
  route?: string;
  actions: Array<{ key: PermissionAction; label: string; write: boolean }>;
};

const read = { key: "read" as const, label: "Consultar", write: false };
const access = { key: "access" as const, label: "Acessar módulo", write: false };
const crud = [
  access, read,
  { key: "create" as const, label: "Criar", write: true },
  { key: "update" as const, label: "Editar", write: true },
  { key: "delete" as const, label: "Excluir/arquivar", write: true },
];

export const ACCESS_CATALOG: AccessResource[] = [
  { key: "inicio", label: "Dashboard / Início", route: "/", actions: [access, read] },
  { key: "comercial", label: "Comercial", route: "/comercial", actions: [...crud, { key: "import", label: "Importar", write: true }, { key: "sync", label: "Sincronizar CRTI", write: true }] },
  { key: "estoque", label: "Estoque", route: "/estoque", actions: crud },
  { key: "custo_obras", label: "Custo Obras", route: "/custo-obras", actions: [...crud, { key: "export", label: "Exportar", write: false }, { key: "sync", label: "Sincronizar CRTI", write: true }] },
  { key: "licitacoes", label: "Licitações", route: "/licitacoes", actions: [...crud, { key: "export", label: "Exportar relatórios", write: false }, { key: "manage", label: "Gerenciar atas, adesões e cadastros", write: true }, { key: "documents", label: "Documentação da licitação", write: true }, { key: "alerts", label: "Receber alertas de pregão?", write: false }] },
  { key: "alimentacao", label: "Controle de Alimentação", route: "/alimentacao", actions: [...crud, { key: "export", label: "Exportar relatórios", write: false }, { key: "manage", label: "Gerenciar cadastros", write: true }] },
  { key: "usuarios", label: "Controle de Usuários", route: "/controle-usuarios", actions: [...crud, { key: "manage", label: "Alterar permissões", write: true }] },
];

export const MASTER_USERNAME = "admfull";
export const LEGACY_PROFILES = ["admfull", "comercial", "subcomercial", "gerencia", "diretoria"] as const;

export function normalizeIdentity(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

export function isMasterIdentity(user: { username?: unknown; profile?: unknown; name?: unknown; openId?: unknown; isProtected?: unknown } | null | undefined) {
  if (!user) return false;
  const identities = [user.username, user.profile, user.name, user.openId]
    .map(normalizeIdentity);
  return identities.some((value) => value === MASTER_USERNAME || value === `local_login:${MASTER_USERNAME}`);
}

export function isReadAction(action: string) {
  return action === "access" || action === "read" || action === "export" || action === "documents";
}

export function effectAllows(effect: PermissionEffect | null | undefined, action: string) {
  if (effect === "allow") return true;
  if (effect === "view") return isReadAction(action);
  return false;
}

export function resolvePermissionEffect(options: {
  master: boolean;
  active?: boolean;
  explicit?: PermissionEffect | null;
  profile?: PermissionEffect | null;
}): PermissionEffect {
  if (options.master) return "allow";
  if (options.active === false) return "deny";
  return options.explicit || options.profile || "deny";
}

export function permissionTargetForProcedure(path: string, type: "query" | "mutation" | "subscription") {
  const root = path.split(".")[0];
  const resource = root === "pedidos" || root === "contatos" || root === "historico" || root === "indicadores" ? "comercial"
    : root === "pedidosObras" || root === "despesasTabelaGeral" ? "custo_obras"
    : root === "crti" ? (path.toLowerCase().includes("obras") || path.toLowerCase().includes("custos") ? "custo_obras" : "comercial")
    : root === "licitacoes" ? "licitacoes"
    : root === "alimentacao" ? "alimentacao"
    : root === "estoque" ? "estoque"
    : root === "userManagement" ? "usuarios"
    : "inicio";

  if (path.startsWith("licitacoes.documentos.")) return { resource: "licitacoes", action: "documents" as PermissionAction };
  if (type === "query") return { resource, action: "read" as PermissionAction };
  const leaf = path.split(".").at(-1)?.toLowerCase() ?? "";
  const action: PermissionAction = leaf.includes("delete") || leaf.includes("excluir") ? "delete"
    : leaf.includes("create") || leaf.includes("criar") || leaf.includes("salvar") ? "create"
    : leaf.includes("update") || leaf.includes("atualizar") || leaf.includes("status") || leaf.includes("save") || leaf.includes("vincular") || leaf.includes("clear") || leaf.includes("reset") ? "update"
    : leaf.includes("export") ? "export"
    : leaf.includes("import") ? "import"
    : leaf.includes("sincron") ? "sync"
    : "manage";
  return { resource, action };
}

export function legacyProfileEffect(profile: unknown, resource: string, action: string): PermissionEffect {
  const key = normalizeIdentity(profile);
  if (key === MASTER_USERNAME) return "allow";
  // Mantém o comportamento anterior para usuários ativos. A preferência
  // individual "Não" passa a ter precedência quando for configurada.
  if (resource === "licitacoes" && action === "alerts") return "allow";
  if (resource === "licitacoes" && action === "documents") return "allow";
  if (["comercial", "subcomercial"].includes(key)) {
    return ["inicio", "comercial", "estoque"].includes(resource) ? "allow" : "deny";
  }
  if (["gerencia", "diretoria"].includes(key)) return resource === "usuarios" ? "deny" : "allow";
  return action === "access" && resource === "inicio" ? "allow" : "deny";
}
