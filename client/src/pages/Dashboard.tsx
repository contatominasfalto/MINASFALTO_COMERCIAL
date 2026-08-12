import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import ContatoForm from "@/components/ContatoForm";
import CSVImportForm from "@/components/CSVImportForm";
import HistoricoModal from "@/components/HistoricoModal";
import PedidoForm from "@/components/PedidoForm";
import SapDoubleConfirmDialog from "@/components/SapDoubleConfirmDialog";
import { ArrowLeft, Edit2, FileText, ListTodo, Phone, Plus, RefreshCw, Save, Search, Trash2, Warehouse, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import minasfaltoLogo from "@/assets/minasfalto-logo.jpg";
import assinaturaMaxwell from "@/assets/assinatura-maxwell.png";

type SortDirection = "asc" | "desc";
type SortColumn =
  | "pedido"
  | "dataPedido"
  | "cliente"
  | "status"
  | "prioridade"
  | "qtde"
  | "qtdeTapFacil"
  | "qtdeGranel"
  | "totalPedido"
  | "saldo"
  | "dataEntrega";

const numberValue = (value: unknown) => Number(value) || 0;

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numberValue(value));

const formatDecimal = (value: unknown, digits = 0) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(numberValue(value));

const formatDateTime = (value: unknown) => {
  if (!value) return "Não disponível";
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return "Não disponível";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatActivityDate = (value: unknown) => {
  if (!value) return "-";
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const formatPrioridade = (value: unknown) => value === "PRIORIDADE" ? "PRIORIDADE" : "NORMAL";
const STATUS_SAIDA_OK = "SA\u00cdDA OK";
const formatStatus = (value: unknown) => {
  const text = String(value || "").toUpperCase();
  if (text === "CANCELADO") return "CANCELADO";
  if (text.includes("SA") && text.includes("OK")) return STATUS_SAIDA_OK;
  return "PENDENTE";
};

const parseDateValue = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) return 0;
  const brDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brDate) {
    const [, day, month, year] = brDate;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }
  const timestamp = new Date(text).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const compareText = (left: unknown, right: unknown) =>
  String(left || "").localeCompare(String(right || ""), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });

const sortValue = (pedido: any, column: SortColumn) => {
  if (column === "status") return formatStatus(pedido.status);
  if (column === "prioridade") return formatPrioridade(pedido.prioridade);
  if (column === "dataPedido" || column === "dataEntrega") return parseDateValue(pedido[column]);
  if (["qtde", "qtdeTapFacil", "qtdeGranel", "totalPedido", "saldo"].includes(column)) {
    return numberValue(pedido[column]);
  }
  return pedido[column];
};

const tableColumns: { key: SortColumn; label: string; align?: "num" }[] = [
  { key: "pedido", label: "Pedido" },
  { key: "dataPedido", label: "Data Ped." },
  { key: "cliente", label: "Cliente" },
  { key: "status", label: "Status" },
  { key: "prioridade", label: "Prioridade" },
  { key: "qtde", label: "Qtde", align: "num" },
  { key: "qtdeTapFacil", label: "Tap Fácil", align: "num" },
  { key: "qtdeGranel", label: "A Granel", align: "num" },
  { key: "totalPedido", label: "Total (R$)", align: "num" },
  { key: "saldo", label: "Saldo (R$)", align: "num" },
  { key: "dataEntrega", label: "Data Entrega" },
];

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [prioridadeFilter, setPrioridadeFilter] = useState("TODOS");
  const [selectedPedido, setSelectedPedido] = useState<any>(null);
  const [isNewPedidoOpen, setIsNewPedidoOpen] = useState(false);
  const [isEditPedidoOpen, setIsEditPedidoOpen] = useState(false);
  const [isContatoOpen, setIsContatoOpen] = useState(false);
  const [isHistoricoOpen, setIsHistoricoOpen] = useState(false);
  const [isCSVImportOpen, setIsCSVImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [isActivitiesOpen, setIsActivitiesOpen] = useState(false);
  const [activityDraft, setActivityDraft] = useState({ id: null as number | null, descricao: "" });
  const [deleteActivityTarget, setDeleteActivityTarget] = useState<any>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("pedido");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const pedidosTableRef = useRef<HTMLDivElement | null>(null);

  const { data: pedidos = [], error: pedidosError, isLoading, refetch } = trpc.pedidos.list.useQuery({
    status: statusFilter,
    prioridade: prioridadeFilter,
    search: searchTerm,
  });
  const { data: ultimaAtualizacao } = trpc.crti.ultimaAtualizacao.useQuery();

  const { mutate: deletePedido, isPending: isDeletingPedido } = trpc.pedidos.delete.useMutation({
    onSuccess: () => {
      setDeleteTarget(null);
      setSelectedPedido(null);
      refetch();
    },
  });

  const { mutate: sincronizarCrti, isPending: isSyncingCrti } = trpc.crti.sincronizacaoCompleta.useMutation({
    onSuccess: (data) => {
      const aprovados = data.aprovados;
      const concluidos = data.concluidos;
      const hasFailure = !aprovados.sucesso || !concluidos.sucesso;

      if (hasFailure) {
        const mensagem = !aprovados.sucesso
          ? aprovados.mensagem || "falha nos aprovados"
          : concluidos.mensagem || "falha nos concluidos";
        toast.error(`CRTI: ${mensagem}`);
        return;
      }

      toast.success(
        `CRTI: ${aprovados.pedidosImportados} aprovados importados, ${concluidos.pedidosAtualizados} concluídos atualizados`
      );
    },
    onError: (error) => toast.error(`Erro ao sincronizar CRTI: ${error.message}`),
    onSettled: () => {
      refetch();
      void utils.crti.ultimaAtualizacao.invalidate();
    },
  });

  const visiblePedidos = useMemo(() => {
    const multiplier = sortDirection === "asc" ? 1 : -1;
    return [...(pedidos as any[])].sort((left, right) => {
      const leftValue = sortValue(left, sortColumn);
      const rightValue = sortValue(right, sortColumn);

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * multiplier;
      }

      return compareText(leftValue, rightValue) * multiplier;
    });
  }, [pedidos, sortColumn, sortDirection]);
  const currentPedido = selectedPedido ?? visiblePedidos[0] ?? null;
  const activities = trpc.pedidos.atividades.list.useQuery(
    { pedidoId: Number(currentPedido?.id || 0) },
    { enabled: isActivitiesOpen && Boolean(currentPedido?.id) },
  );
  const createActivity = trpc.pedidos.atividades.create.useMutation({
    onSuccess: () => {
      toast.success("Atividade registrada.");
      setActivityDraft({ id: null, descricao: "" });
      void activities.refetch();
    },
    onError: (error) => toast.error(`Erro ao salvar atividade: ${error.message}`),
  });
  const updateActivity = trpc.pedidos.atividades.update.useMutation({
    onSuccess: () => {
      toast.success("Atividade atualizada.");
      setActivityDraft({ id: null, descricao: "" });
      void activities.refetch();
    },
    onError: (error) => toast.error(`Erro ao atualizar atividade: ${error.message}`),
  });
  const deleteActivity = trpc.pedidos.atividades.delete.useMutation({
    onSuccess: () => {
      toast.success("Atividade excluída.");
      setDeleteActivityTarget(null);
      void activities.refetch();
    },
    onError: (error) => toast.error(`Erro ao excluir atividade: ${error.message}`),
  });

  const toggleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }

    setSortColumn(column);
    setSortDirection("asc");
  };

  const handleHeaderSort = (event: React.MouseEvent<HTMLTableSectionElement>) => {
    const header = (event.target as HTMLElement).closest("th");
    if (!header?.parentElement) return;

    const index = Array.from(header.parentElement.children).indexOf(header);
    const column = tableColumns[index]?.key;
    if (column) toggleSort(column);
  };

  const totals = useMemo(() => {
    const subtotal = visiblePedidos.reduce(
      (acc, pedido) => {
        acc.tapFacil += numberValue(pedido.qtde);
        return acc;
      },
      { tapFacil: 0, granel: 0 }
    );
    subtotal.granel = (subtotal.tapFacil * 25) / 1000;
    return subtotal;
  }, [visiblePedidos]);

  const openEdit = () => {
    if (!currentPedido) return;
    setSelectedPedido(currentPedido);
    setIsEditPedidoOpen(true);
  };

  const openContato = () => {
    if (!currentPedido) return;
    setSelectedPedido(currentPedido);
    setIsContatoOpen(true);
  };

  const openHistorico = () => {
    if (!currentPedido) return;
    setSelectedPedido(currentPedido);
    setIsHistoricoOpen(true);
  };

  const openDelete = () => {
    if (!currentPedido) return;
    setDeleteTarget(currentPedido);
  };

  const openActivities = () => {
    if (!currentPedido) return toast.error("Selecione um pedido.");
    setActivityDraft({ id: null, descricao: "" });
    setIsActivitiesOpen(true);
  };

  const saveActivity = () => {
    const descricao = activityDraft.descricao.trim();
    if (!currentPedido?.id) return toast.error("Selecione um pedido.");
    if (!descricao) return toast.error("Informe a atividade.");
    if (activityDraft.id) {
      updateActivity.mutate({ id: activityDraft.id, pedidoId: currentPedido.id, descricao });
      return;
    }
    createActivity.mutate({ pedidoId: currentPedido.id, descricao });
  };

  const scrollSelectedRowIntoView = () => {
    window.requestAnimationFrame(() => {
      const row = pedidosTableRef.current?.querySelector("tbody tr.selected") as HTMLElement | null;
      row?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  };

  const handlePedidosTableKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Enter"].includes(event.key)) return;
    event.preventDefault();
    if (!visiblePedidos.length) return;

    if (event.key === "Enter") {
      if (currentPedido) {
        setSelectedPedido(currentPedido);
        setIsEditPedidoOpen(true);
      }
      return;
    }

    const currentIndex = visiblePedidos.findIndex((pedido) => pedido.id === currentPedido?.id);
    const startIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = event.key === "ArrowDown" || event.key === "ArrowRight"
      ? Math.min(startIndex + 1, visiblePedidos.length - 1)
      : Math.max(startIndex - 1, 0);
    setSelectedPedido(visiblePedidos[nextIndex]);
    scrollSelectedRowIntoView();
  };

  return (
    <div className="desktop-shell">
      <header className="desktop-titlebar">
        <img
          src={minasfaltoLogo}
          alt="Minasfalto"
          className="desktop-brand-logo"
        />
        <div className="desktop-heading">
          <h1>TAP FACIL 25 KG E A GRANEL</h1>
        </div>
        <div className="desktop-titlebar-actions">
          <button type="button" className="desktop-activities-button" onClick={openActivities} disabled={!currentPedido}>
            <ListTodo size={14} /> Lista de Atividades
          </button>
          <button
            type="button"
            className="desktop-logout"
            onClick={() => navigate("/")}
            title="Voltar"
            aria-label="Voltar"
          >
            <ArrowLeft size={16} />
            <span>Voltar</span>
          </button>
        </div>
      </header>

      <nav className="desktop-toolbar">
        <button className="desk-action action-new" onClick={() => setIsNewPedidoOpen(true)}>
          <X size={14} /> Novo Pedido
        </button>
        <button className="desk-action action-edit" onClick={openEdit} disabled={!currentPedido}>
          <Edit2 size={13} /> Editar
        </button>
        <button className="desk-action action-contact" onClick={openContato} disabled={!currentPedido}>
          <Phone size={13} /> Registrar Contato
        </button>
        <button className="desk-action action-history" onClick={openHistorico} disabled={!currentPedido}>
          <FileText size={13} /> Histórico
        </button>
        <button className="desk-action action-delete" onClick={openDelete} disabled={!currentPedido}>
          <Trash2 size={13} /> Excluir
        </button>
        <button className="desk-action action-stock" onClick={() => navigate("/estoque")}>
          <Warehouse size={13} /> Estoque
        </button>
      </nav>

      <section className="desktop-filters">
        <label>Status:</label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="desktop-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">TODOS</SelectItem>
            <SelectItem value="PENDENTE">PENDENTE</SelectItem>
            <SelectItem value={STATUS_SAIDA_OK}>{STATUS_SAIDA_OK}</SelectItem>
            <SelectItem value="CANCELADO">CANCELADO</SelectItem>
          </SelectContent>
        </Select>

        <label>Prioridade:</label>
        <Select value={prioridadeFilter} onValueChange={setPrioridadeFilter}>
          <SelectTrigger className="desktop-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">TODOS</SelectItem>
            <SelectItem value="NORMAL">NORMAL</SelectItem>
            <SelectItem value="PRIORIDADE">PRIORIDADE</SelectItem>
          </SelectContent>
        </Select>

        <label className="desktop-search-label">
          <Search size={13} /> Buscar:
        </label>
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="desktop-search"
        />

        <button className="desktop-refresh" onClick={() => sincronizarCrti({ dias: 120 })} disabled={isSyncingCrti}>
          <RefreshCw size={13} /> {isSyncingCrti ? "Sincronizando..." : "Atualizar"}
        </button>
      </section>

      <main className="desktop-grid-frame">
        <div
          className="desktop-table-scroll keyboard-table-scroll"
          ref={pedidosTableRef}
          tabIndex={0}
          role="grid"
          aria-label="Pedidos do painel comercial"
          onKeyDown={handlePedidosTableKeyDown}
        >
          <table className="desktop-table">
            <thead onClick={handleHeaderSort}>
              <tr>
                <th>Pedido</th>
                <th>Data Ped.</th>
                <th>Cliente</th>
                <th>Status</th>
                <th>Prioridade</th>
                <th>Qtde</th>
                <th>Tap Fácil</th>
                <th>A Granel</th>
                <th>Total (R$)</th>
                <th>Saldo (R$)</th>
                <th>Data Entrega</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="desktop-empty">Carregando pedidos...</td>
                </tr>
              ) : pedidosError ? (
                <tr>
                  <td colSpan={11} className="desktop-empty">
                    Erro ao carregar pedidos: {pedidosError.message}
                  </td>
                </tr>
              ) : visiblePedidos.length === 0 ? (
                <tr>
                  <td colSpan={11} className="desktop-empty">Nenhum pedido encontrado</td>
                </tr>
              ) : (
                visiblePedidos.map((pedido) => {
                  const selected = currentPedido?.id === pedido.id;
                  return (
                    <tr
                      key={pedido.id}
                      className={selected ? "selected" : ""}
                      onClick={() => setSelectedPedido(pedido)}
                      onDoubleClick={() => {
                        setSelectedPedido(pedido);
                        setIsEditPedidoOpen(true);
                      }}
                    >
                      <td>{pedido.pedido}</td>
                      <td>{pedido.dataPedido}</td>
                      <td className="desktop-client">{pedido.cliente}</td>
                      <td className="desktop-status">
                        {formatStatus(pedido.status) === "PENDENTE" ? <span className="status-dot" /> : null}
                        {formatStatus(pedido.status)}
                      </td>
                      <td>{formatPrioridade(pedido.prioridade)}</td>
                      <td className="num">{formatDecimal(pedido.qtde)}</td>
                      <td className="num">{formatDecimal(pedido.qtdeTapFacil)}</td>
                      <td className="num">{formatDecimal(pedido.qtdeGranel, 3)}</td>
                      <td className="num">{formatCurrency(pedido.totalPedido)}</td>
                      <td className="num">{formatCurrency(pedido.saldo)}</td>
                      <td>{pedido.dataEntrega}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      <footer className="desktop-footer">
        <div className="desktop-subtotals">
          <strong>SUBTOTAL DOS PEDIDOS EXIBIDOS:</strong>
          <span>Tap Fácil (sacos): <b>{formatDecimal(totals.tapFacil)}</b></span>
          <span>A Granel Total (ton): <b>{formatDecimal(totals.granel, 3)}</b></span>
        </div>
        <div className="desktop-statusbar">
          <span>
            {visiblePedidos.length} pedido(s) exibido(s) | Última atualização: {formatDateTime(ultimaAtualizacao)}
          </span>
          <img
            src={assinaturaMaxwell}
            alt="Assinatura digital"
            className="desktop-signature"
          />
          <strong>Usuário: {user?.name ?? "admfull"}</strong>
        </div>
      </footer>

      <Dialog open={isNewPedidoOpen} onOpenChange={setIsNewPedidoOpen}>
        <DialogContent
          className="desktop-dialog pedido-window"
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>▣ CADASTRO DE PEDIDO</DialogTitle>
            <DialogDescription>Novo Pedido</DialogDescription>
          </DialogHeader>
          <PedidoForm onSuccess={() => { setIsNewPedidoOpen(false); refetch(); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={isEditPedidoOpen} onOpenChange={setIsEditPedidoOpen}>
        <DialogContent
          className="desktop-dialog pedido-window"
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>▣ CADASTRO DE PEDIDO</DialogTitle>
            <DialogDescription>Editar Pedido</DialogDescription>
          </DialogHeader>
          {selectedPedido && (
            <PedidoForm pedido={selectedPedido} onSuccess={() => { setIsEditPedidoOpen(false); refetch(); }} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isContatoOpen} onOpenChange={setIsContatoOpen}>
        <DialogContent
          className="desktop-dialog contato-window"
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>☎ Registrar Contato — {selectedPedido?.cliente}</DialogTitle>
            <DialogDescription>Registrar Contato — Pedido {selectedPedido?.pedido}</DialogDescription>
          </DialogHeader>
          {selectedPedido && <ContatoForm pedido={selectedPedido} onSuccess={() => setIsContatoOpen(false)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={isHistoricoOpen} onOpenChange={setIsHistoricoOpen}>
        <DialogContent className="desktop-dialog historico-window">
          <DialogHeader>
            <DialogTitle>▣ Histórico de Alterações e Contatos — Pedido {selectedPedido?.pedido}</DialogTitle>
            <DialogDescription>{selectedPedido?.cliente}</DialogDescription>
          </DialogHeader>
          {selectedPedido && <HistoricoModal pedido={selectedPedido} />}
        </DialogContent>
      </Dialog>

      <Dialog open={isCSVImportOpen} onOpenChange={setIsCSVImportOpen}>
        <DialogContent
          className="desktop-dialog contato-window"
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Importar Pedidos via CSV</DialogTitle>
            <DialogDescription>Carregue um arquivo CSV com os pedidos para importar</DialogDescription>
          </DialogHeader>
          <CSVImportForm onSuccess={() => { setIsCSVImportOpen(false); refetch(); }} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={isActivitiesOpen}
        onOpenChange={(open) => {
          setIsActivitiesOpen(open);
          if (!open) setActivityDraft({ id: null, descricao: "" });
        }}
      >
        <DialogContent className="desktop-dialog activities-window">
          <DialogHeader>
            <DialogTitle><ListTodo size={18} /> Lista de Atividades</DialogTitle>
            <DialogDescription>
              Pedido {currentPedido?.pedido ?? "-"} — {currentPedido?.cliente ?? "-"}
            </DialogDescription>
          </DialogHeader>

          <section className="activities-editor">
            <label>
              <span>Atividade</span>
              <textarea
                value={activityDraft.descricao}
                onChange={(event) => setActivityDraft((current) => ({ ...current, descricao: event.target.value }))}
                maxLength={2000}
                placeholder="Descreva a atividade do pedido"
              />
            </label>
            <div className="activities-editor-actions">
              <button type="button" className="mini-sap-button" onClick={() => setActivityDraft({ id: null, descricao: "" })}>
                <Plus size={13} /> Inserir
              </button>
              <button
                type="button"
                className="mini-sap-button primary"
                onClick={saveActivity}
                disabled={createActivity.isPending || updateActivity.isPending}
              >
                <Save size={13} /> {activityDraft.id ? "Salvar edição" : "Salvar"}
              </button>
            </div>
          </section>

          <div className="activities-table-wrap">
            <table className="activities-table">
              <thead><tr><th>Data</th><th>Atividade</th><th>Registrado por</th><th>Ações</th></tr></thead>
              <tbody>
                {activities.isLoading ? (
                  <tr><td colSpan={4} className="desktop-empty">Carregando atividades...</td></tr>
                ) : (activities.data || []).length === 0 ? (
                  <tr><td colSpan={4} className="desktop-empty">Nenhuma atividade registrada para este pedido.</td></tr>
                ) : (activities.data || []).map((atividade: any) => (
                  <tr key={atividade.id} className={activityDraft.id === atividade.id ? "is-editing" : ""}>
                    <td>{formatActivityDate(atividade.criadoEm)}</td>
                    <td>{atividade.descricao}</td>
                    <td>{atividade.criadoPor || "Sistema"}</td>
                    <td className="actions">
                      <button type="button" className="mini-icon-button" title="Editar atividade" onClick={() => setActivityDraft({ id: atividade.id, descricao: atividade.descricao || "" })}>
                        <Edit2 size={13} />
                      </button>
                      <button type="button" className="mini-icon-button danger" title="Excluir atividade" onClick={() => setDeleteActivityTarget(atividade)}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={false && Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="desktop-dialog confirm-window">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <div className="desktop-confirm">
            <div className="warning-icon">!</div>
            <p>
              Deseja excluir o pedido {deleteTarget?.pedido} — {deleteTarget?.cliente}?
            </p>
          </div>
          <div className="desktop-confirm-actions">
            <button onClick={() => deletePedido(deleteTarget.id)}>Sim</button>
            <button onClick={() => setDeleteTarget(null)}>Não</button>
          </div>
        </DialogContent>
      </Dialog>

      <SapDoubleConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Confirmar exclusão de pedido"
        description="Esta ação vai excluir o pedido selecionado do painel comercial."
        finalDescription="Confirmação final: depois de continuar, o pedido será excluído."
        details={[
          { label: "Pedido", value: deleteTarget?.pedido ?? "-" },
          { label: "Cliente", value: deleteTarget?.cliente ?? "-" },
          { label: "Total", value: formatCurrency(deleteTarget?.totalPedido) },
        ]}
        isPending={isDeletingPedido}
        onConfirm={() => {
          if (deleteTarget?.id) deletePedido(deleteTarget.id);
        }}
      />

      <SapDoubleConfirmDialog
        open={Boolean(deleteActivityTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteActivityTarget(null);
        }}
        title="Confirmar exclusão de atividade"
        description="Esta ação vai excluir a atividade selecionada do pedido."
        finalDescription="Confirmação final: depois de continuar, a atividade será excluída."
        details={[
          { label: "Pedido", value: currentPedido?.pedido ?? "-" },
          { label: "Data", value: formatActivityDate(deleteActivityTarget?.criadoEm) },
          { label: "Atividade", value: deleteActivityTarget?.descricao ?? "-" },
        ]}
        isPending={deleteActivity.isPending}
        onConfirm={() => {
          if (deleteActivityTarget?.id && currentPedido?.id) {
            deleteActivity.mutate({ id: deleteActivityTarget.id, pedidoId: currentPedido.id });
          }
        }}
      />
    </div>
  );
}
