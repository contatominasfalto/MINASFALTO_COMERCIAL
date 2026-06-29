import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import ContatoForm from "@/components/ContatoForm";
import CSVImportForm from "@/components/CSVImportForm";
import HistoricoModal from "@/components/HistoricoModal";
import PedidoForm from "@/components/PedidoForm";
import { Edit2, FileText, LogOut, Phone, RefreshCw, Search, Trash2, Warehouse, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { withAppBase } from "@/lib/app-base";
import minasfaltoLogo from "@/assets/minasfalto-logo.jpg";

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
  const [sortColumn, setSortColumn] = useState<SortColumn>("pedido");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const { data: pedidos = [], error: pedidosError, isLoading, refetch } = trpc.pedidos.list.useQuery({
    status: statusFilter,
    prioridade: prioridadeFilter,
    search: searchTerm,
  });

  const { mutate: deletePedido } = trpc.pedidos.delete.useMutation({
    onSuccess: () => {
      setDeleteTarget(null);
      setSelectedPedido(null);
      refetch();
    },
  });

  const { mutate: logout, isPending: isLoggingOut } = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      window.location.href = withAppBase("/login");
    },
    onError: (error) => toast.error(`Erro ao sair: ${error.message}`),
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

  return (
    <div className="desktop-shell">
      <header className="desktop-titlebar">
        <img
          src={minasfaltoLogo}
          alt="Minasfalto"
          className="desktop-brand-logo"
        />
        <div className="desktop-heading">
          <h1>CONTROLE COMERCIAL — PEDIDOS DE VENDAS</h1>
          <strong>TAP FÁCIL 25KG E A GRANEL</strong>
        </div>
        <button
          type="button"
          className="desktop-logout"
          onClick={() => logout()}
          disabled={isLoggingOut}
          title="Sair"
          aria-label="Sair"
        >
          <LogOut size={16} />
          <span>{isLoggingOut ? "Saindo..." : "Sair"}</span>
        </button>
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
        <div className="desktop-table-scroll">
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
          <span>{visiblePedidos.length} pedido(s) exibido(s) | Última atualização: 22/05/2026 09:58</span>
          <strong>Usuário: {user?.name ?? "admfull"}</strong>
        </div>
      </footer>

      <Dialog open={isNewPedidoOpen} onOpenChange={setIsNewPedidoOpen}>
        <DialogContent className="desktop-dialog pedido-window">
          <DialogHeader>
            <DialogTitle>▣ CADASTRO DE PEDIDO</DialogTitle>
            <DialogDescription>Novo Pedido</DialogDescription>
          </DialogHeader>
          <PedidoForm onSuccess={() => { setIsNewPedidoOpen(false); refetch(); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={isEditPedidoOpen} onOpenChange={setIsEditPedidoOpen}>
        <DialogContent className="desktop-dialog pedido-window">
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
        <DialogContent className="desktop-dialog contato-window">
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
        <DialogContent className="desktop-dialog contato-window">
          <DialogHeader>
            <DialogTitle>Importar Pedidos via CSV</DialogTitle>
            <DialogDescription>Carregue um arquivo CSV com os pedidos para importar</DialogDescription>
          </DialogHeader>
          <CSVImportForm onSuccess={() => { setIsCSVImportOpen(false); refetch(); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
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
    </div>
  );
}
