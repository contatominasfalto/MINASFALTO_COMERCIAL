import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Edit3, KeyRound, LockKeyhole, Plus, Search, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isMasterIdentity, type PermissionEffect } from "@shared/access-control";
import { useAuth } from "@/_core/hooks/useAuth";

type UserForm = {
  username: string; name: string; email: string;
  profile: "comercial" | "subcomercial" | "gerencia" | "diretoria";
  status: "active" | "inactive" | "archived";
  password: string; passwordConfirmation: string;
};
const emptyForm: UserForm = { username: "", name: "", email: "", profile: "comercial", status: "active", password: "", passwordConfirmation: "" };
const EFFECT_LABELS: Record<PermissionEffect, string> = { allow: "Acesso Permitido", deny: "Acesso Negado", view: "Somente visualização" };
const PROFILE_LABELS: Record<string, string> = { admfull: "Master", comercial: "Comercial", subcomercial: "Subcomercial", gerencia: "Gerência", diretoria: "Diretoria" };
const STATUS_LABELS: Record<string, string> = { active: "Ativo", inactive: "Inativo", archived: "Arquivado" };

export default function ControleUsuarios() {
  const [, navigate] = useLocation();
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();
  const master = isMasterIdentity(currentUser as any);
  const [search, setSearch] = useState("");
  const [profileFilter, setProfileFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [permissionsUser, setPermissionsUser] = useState<any | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<Record<string, PermissionEffect | "inherit">>({});
  const [archiveUser, setArchiveUser] = useState<any | null>(null);
  const [archiveReason, setArchiveReason] = useState("");

  const users = trpc.userManagement.list.useQuery(undefined, { enabled: master, retry: false });
  const permissions = trpc.userManagement.getUserPermissions.useQuery(permissionsUser?.id || 1, { enabled: Boolean(permissionsUser) });
  const createUser = trpc.userManagement.create.useMutation({ onSuccess: async () => { toast.success("Usuário criado com sucesso."); setEditing(null); setForm(emptyForm); await users.refetch(); }, onError: (error) => toast.error(`Não foi possível criar o usuário: ${error.message}`) });
  const updateUser = trpc.userManagement.update.useMutation({
    onSuccess: async (updated, variables) => {
      await users.refetch();
      if (variables.data.password && updated.hasPassword !== true) {
        toast.error("A alteração cadastral foi recebida, mas o banco não confirmou a senha. Tente novamente após reiniciar o servidor.");
        setEditing(updated);
        return;
      }
      toast.success(variables.data.password ? `Senha do login @${updated.username} cadastrada e confirmada no banco.` : "Usuário atualizado com sucesso.");
      setEditing(null);
    },
    onError: (error) => toast.error(`Não foi possível atualizar o usuário: ${error.message}`),
  });
  const archive = trpc.userManagement.deleteOrArchive.useMutation({ onSuccess: async () => { toast.success("Usuário excluído definitivamente do banco de dados."); setArchiveUser(null); setArchiveReason(""); await users.refetch(); }, onError: (error) => toast.error(`Não foi possível excluir o usuário: ${error.message}`) });
  const replacePermissions = trpc.userManagement.replaceUserPermissions.useMutation({ onSuccess: async () => { toast.success("Permissões salvas com sucesso."); setPermissionsUser(null); await utils.auth.permissions.invalidate(); } });

  const filtered = useMemo(() => (users.data || []).filter((item: any) => {
    const haystack = `${item.name || ""} ${item.username || ""} ${item.email || ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (profileFilter === "all" || item.profile === profileFilter) && (statusFilter === "all" || item.status === statusFilter);
  }), [users.data, search, profileFilter, statusFilter]);

  const openEdit = (item?: any) => {
    createUser.reset();
    updateUser.reset();
    setEditing(item || { id: null });
    setForm(item ? { username: item.username || "", name: item.name || "", email: item.email || "", profile: item.profile === "admfull" ? "diretoria" : item.profile, status: item.status, password: "", passwordConfirmation: "" } : emptyForm);
  };
  const submit = () => {
    if (form.username.trim().length < 3 || form.name.trim().length < 2) return toast.error("Preencha login e nome corretamente.");
    if (!editing?.id && form.password.length < 8) return toast.error("Informe uma senha inicial com pelo menos 8 caracteres.");
    if (form.password && form.password.length < 8) return toast.error("A senha deve ter pelo menos 8 caracteres.");
    if (form.password !== form.passwordConfirmation) return toast.error("A confirmação da senha não confere.");
    const data = { username: form.username.trim().toLowerCase(), name: form.name.trim(), email: form.email.trim() || null, profile: form.profile, status: form.status, ...(form.password ? { password: form.password } : {}) };
    if (editing?.id) updateUser.mutate({ id: editing.id, data }); else createUser.mutate({ ...data, password: form.password });
  };
  const openPermissions = async (item: any) => {
    setPermissionsUser(item);
    setPermissionDraft({});
  };
  const permissionValue = (row: any) => permissionDraft[`${row.resourceKey}:${row.actionKey}`] ?? (row.source === "custom" ? row.effect : "inherit");
  const setModuleEffect = (resourceKey: string, effect: PermissionEffect | "inherit") => {
    const next = { ...permissionDraft };
    permissions.data?.filter((row: any) => row.resourceKey === resourceKey).forEach((row: any) => { next[`${row.resourceKey}:${row.actionKey}`] = effect; });
    setPermissionDraft(next);
  };
  const savePermissions = () => {
    if (!permissionsUser) return;
    const entries = (permissions.data || []).map((row: any) => {
      const selected = permissionValue(row);
      return { resourceKey: row.resourceKey, actionKey: row.actionKey, effect: selected === "inherit" ? null : selected };
    });
    replacePermissions.mutate({ userId: permissionsUser.id, permissions: entries });
  };

  if (!master) return <main className="users-denied"><ShieldCheck size={44} /><h1>Acesso negado</h1><p>Esta área é exclusiva do usuário master admfull.</p><button onClick={() => navigate("/")}>Voltar ao início</button></main>;

  return (
    <main className="users-page">
      <header className="users-header"><div><UserCog size={30} /><div><h1>CONTROLE DE USUÁRIOS</h1><span>Perfis e permissões granulares do sistema</span></div></div><button onClick={() => navigate("/")}><ArrowLeft size={16} /> Voltar</button></header>
      <section className="users-toolbar">
        <label><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, login ou e-mail" /></label>
        <select value={profileFilter} onChange={(e) => setProfileFilter(e.target.value)}><option value="all">Todos os perfis</option>{Object.entries(PROFILE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Todos os status</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <button className="users-primary" onClick={() => openEdit()}><Plus size={16} /> Novo usuário</button>
      </section>
      <section className="users-table-wrap">
        {users.isLoading ? <p className="users-state">Carregando usuários...</p> : users.error ? <p className="users-state users-error">{users.error.message}</p> : (
          <table className="users-table"><thead><tr><th>Nome / login</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Senha</th><th>Último acesso</th><th>Permissões</th><th>Ações</th></tr></thead><tbody>
            {filtered.map((item: any) => <tr key={item.id} className={item.protected ? "users-protected-row" : ""}>
              <td><b>{item.name || item.username}</b><span>@{item.username || "não definido"}</span>{item.protected && <em><LockKeyhole size={12} /> Usuário master protegido</em>}</td>
              <td>{item.email || "—"}</td><td>{PROFILE_LABELS[item.profile] || item.profile}</td><td><span className={`users-status users-status-${item.status}`}>{STATUS_LABELS[item.status] || item.status}</span></td><td><span className={`users-status users-status-${item.passwordConfigured ? "active" : "inactive"}`}>{item.passwordSource === "database" ? "Banco" : item.passwordSource === "environment" ? "Legada" : "Não configurada"}</span></td>
              <td>{item.lastSignedIn ? new Date(item.lastSignedIn).toLocaleString("pt-BR") : "Nunca"}</td><td>{item.protected ? "Acesso total" : `${item.permissionCount} personalizada(s)`}</td>
              <td><button title="Editar usuário" disabled={item.protected} onClick={() => openEdit(item)}><Edit3 size={15} /></button><button title="Editar permissões" disabled={item.protected} onClick={() => openPermissions(item)}><KeyRound size={15} /></button><button title="Excluir usuário definitivamente" disabled={item.protected} onClick={() => setArchiveUser(item)}><Trash2 size={15} /></button></td>
            </tr>)}
            {!filtered.length && <tr><td colSpan={8} className="users-state">Nenhum usuário encontrado.</td></tr>}
          </tbody></table>
        )}
      </section>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}><DialogContent className="users-dialog"><DialogHeader><DialogTitle>{editing?.id ? `Editar usuário — @${editing.username}` : "Novo usuário"}</DialogTitle></DialogHeader>
        <div className="users-form"><label>Login<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} maxLength={64} /></label><label>Nome completo<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={180} /></label><label>E-mail<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>Perfil<select value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value as UserForm["profile"] })}>{Object.entries(PROFILE_LABELS).filter(([key]) => key !== "admfull").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as UserForm["status"] })}>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><span className="users-form-spacer" /><label>{editing?.id ? "Nova senha (opcional)" : "Senha inicial"}<input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} maxLength={128} placeholder={editing?.id ? "Deixe em branco para manter" : "Mínimo de 8 caracteres"} /></label><label>Confirmar senha<input type="password" autoComplete="new-password" value={form.passwordConfirmation} onChange={(e) => setForm({ ...form, passwordConfirmation: e.target.value })} maxLength={128} placeholder="Repita a senha" /></label><p>{editing?.id ? editing.passwordSource === "database" ? "Senha configurada no banco de dados. Preencha os campos somente para alterá-la." : editing.passwordSource === "environment" ? "Senha legada configurada no servidor. Você pode mantê-la ou cadastrar uma nova senha no banco." : "Senha não configurada. Preencha os dois campos para permitir o login." : "Defina a senha inicial de acesso. Ela será armazenada somente como hash seguro e não poderá ser consultada depois."}</p>{(createUser.error || updateUser.error) && <p className="users-form-error">Falha ao salvar: {(createUser.error || updateUser.error)?.message}</p>}</div>
        <footer className="users-dialog-footer"><button onClick={() => setEditing(null)}>Cancelar</button><button className="users-primary" onClick={submit} disabled={createUser.isPending || updateUser.isPending}>Salvar</button></footer>
      </DialogContent></Dialog>

      <Dialog open={Boolean(permissionsUser)} onOpenChange={(open) => !open && setPermissionsUser(null)}><DialogContent className="users-dialog users-permissions-dialog"><DialogHeader><DialogTitle>Permissões — {permissionsUser?.name}</DialogTitle></DialogHeader>
        <p className="users-help">“Herdar do perfil” mantém a regra do perfil funcional. Uma escolha explícita passa a ter precedência.</p><div className="users-permissions-scroll">
          {permissions.isLoading ? <p>Carregando matriz...</p> : Array.from(new Set((permissions.data || []).map((row: any) => row.resourceKey))).map((resourceKey: any) => { const rows = (permissions.data || []).filter((row: any) => row.resourceKey === resourceKey); return <section className="users-permission-module" key={resourceKey}><header><b>{rows[0]?.resourceLabel}</b><select defaultValue="" onChange={(e) => setModuleEffect(resourceKey, e.target.value as any)}><option value="" disabled>Aplicar ao módulo...</option><option value="inherit">Herdar do perfil</option><option value="allow">Acesso Permitido</option><option value="view">Somente visualização</option><option value="deny">Acesso Negado</option></select></header>{rows.map((row: any) => <div key={row.actionKey}><span>{row.actionLabel}<small>{row.source === "custom" ? "Personalizada" : `Herdada: ${EFFECT_LABELS[row.profileEffect as PermissionEffect]}`}</small></span><select value={permissionValue(row)} onChange={(e) => setPermissionDraft({ ...permissionDraft, [`${row.resourceKey}:${row.actionKey}`]: e.target.value as any })}><option value="inherit">Herdar do perfil</option><option value="allow">Acesso Permitido</option><option value="view">Somente visualização</option><option value="deny">Acesso Negado</option></select></div>)}</section>; })}
        </div><footer className="users-dialog-footer"><span>{Object.keys(permissionDraft).length} alteração(ões) pendente(s)</span><button onClick={() => setPermissionsUser(null)}>Cancelar</button><button className="users-primary" onClick={savePermissions} disabled={replacePermissions.isPending}>Salvar permissões</button></footer>
      </DialogContent></Dialog>

      <Dialog open={Boolean(archiveUser)} onOpenChange={(open) => !open && setArchiveUser(null)}><DialogContent className="users-dialog users-confirm-dialog"><DialogHeader><DialogTitle>Confirmar exclusão definitiva</DialogTitle></DialogHeader><p>O usuário <b>{archiveUser?.name}</b> (@{archiveUser?.username}) e suas permissões serão removidos definitivamente do banco de dados. Esta ação não pode ser desfeita.</p><label>Digite um motivo para confirmar<textarea value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} maxLength={500} /></label><footer className="users-dialog-footer"><button onClick={() => setArchiveUser(null)}>Cancelar</button><button className="users-danger" disabled={archiveReason.trim().length < 3 || archive.isPending} onClick={() => archive.mutate({ id: archiveUser.id, reason: archiveReason })}>Excluir definitivamente</button></footer></DialogContent></Dialog>
    </main>
  );
}
