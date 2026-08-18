import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Eye, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function formatDate(value: unknown) {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function prettyJson(value: unknown) {
  if (!value) return "Nenhum dado adicional registrado.";
  try { return JSON.stringify(JSON.parse(String(value)), null, 2); } catch { return String(value); }
}

export default function Rastreabilidade() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("");
  const [result, setResult] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any | null>(null);
  const query = trpc.rastreabilidade.list.useQuery({ search: search || undefined, module: module || undefined, result: result as "success" | "error" || undefined, start: start || undefined, end: end || undefined, page, pageSize: 50 }, { retry: false });
  const totalPages = Math.max(1, Math.ceil((query.data?.total || 0) / 50));

  return <main className="trace-page">
    <header className="trace-header">
      <div><ShieldCheck size={30}/><div><h1>RASTREABILIDADE</h1><p>Trilha central de auditoria e monitoramento do sistema</p></div></div>
      <button onClick={() => navigate("/")}><ArrowLeft size={16}/> Voltar</button>
    </header>

    <section className="trace-filters">
      <label className="trace-search"><span>Buscar</span><div><Search size={15}/><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Usuário, ação, registro ou descrição"/></div></label>
      <label><span>Módulo</span><select value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }}><option value="">Todos</option>{query.data?.modules.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>Resultado</span><select value={result} onChange={(e) => { setResult(e.target.value); setPage(1); }}><option value="">Todos</option><option value="success">Sucesso</option><option value="error">Erro</option></select></label>
      <label><span>Data inicial</span><input type="date" value={start} onChange={(e) => { setStart(e.target.value); setPage(1); }}/></label>
      <label><span>Data final</span><input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPage(1); }}/></label>
      <button className="trace-refresh" onClick={() => query.refetch()} title="Atualizar"><RefreshCw size={16}/></button>
    </section>

    <section className="trace-summary"><strong>{query.data?.total || 0}</strong> evento(s) encontrado(s)<span>Dados mais recentes primeiro</span></section>
    <section className="trace-table-frame"><table className="trace-table"><thead><tr><th>Data e hora</th><th>Usuário</th><th>Módulo</th><th>Ação</th><th>Registro</th><th>Descrição</th><th>Resultado</th><th>Detalhes</th></tr></thead><tbody>
      {query.isLoading && <tr><td colSpan={8} className="trace-empty">Carregando trilha de auditoria...</td></tr>}
      {query.error && <tr><td colSpan={8} className="trace-empty trace-error">Não foi possível carregar: {query.error.message}</td></tr>}
      {!query.isLoading && !query.error && !query.data?.items.length && <tr><td colSpan={8} className="trace-empty">Nenhum evento encontrado para os filtros informados.</td></tr>}
      {query.data?.items.map((item: any) => <tr key={item.id}><td>{formatDate(item.occurredAt)}</td><td><strong>{item.userName || item.username || "Sistema"}</strong>{item.username && <small>@{item.username}</small>}</td><td>{item.module}</td><td>{item.action}</td><td>{item.entityType || "—"}{item.entityId && <small>#{item.entityId}</small>}</td><td>{item.description}</td><td><span className={`trace-status ${item.result}`}>{item.result === "success" ? "Sucesso" : "Erro"}</span></td><td><button className="trace-icon" onClick={() => setSelected(item)} title="Visualizar detalhes"><Eye size={15}/></button></td></tr>)}
    </tbody></table></section>
    <footer className="trace-pagination"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button><span>Página {page} de {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</button></footer>

    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="trace-dialog"><DialogHeader><DialogTitle>Detalhes do evento #{selected?.id}</DialogTitle></DialogHeader>{selected && <div className="trace-detail">
      <div className="trace-detail-grid"><div><span>Data e hora</span><strong>{formatDate(selected.occurredAt)}</strong></div><div><span>Usuário</span><strong>{selected.userName || selected.username || "Sistema"}</strong></div><div><span>Módulo</span><strong>{selected.module}</strong></div><div><span>Resultado</span><strong>{selected.result === "success" ? "Sucesso" : "Erro"}</strong></div><div><span>Procedimento</span><strong>{selected.procedurePath}</strong></div><div><span>IP</span><strong>{selected.ipAddress || "Não informado"}</strong></div></div>
      <label>Dados da operação</label><pre>{prettyJson(selected.inputData)}</pre>{selected.errorMessage && <><label>Mensagem de erro</label><pre className="trace-error-box">{selected.errorMessage}</pre></>}
    </div>}</DialogContent></Dialog>
  </main>;
}
