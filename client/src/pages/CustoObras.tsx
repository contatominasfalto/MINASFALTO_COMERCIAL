import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, Calculator, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import minasfaltoLogo from "@/assets/minasfalto-logo.jpg";

type SortDirection = "asc" | "desc";
type SortColumn =
  | "pedido"
  | "dataPedido"
  | "cliente"
  | "status"
  | "qtde"
  | "qtdeTapFacil"
  | "qtdeGranel"
  | "totalPedido"
  | "saldo";

type ActiveTab = "pedidos" | "tabela";

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
  if (!value) return "Nao disponivel";
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return "Nao disponivel";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  if (column === "dataPedido") return parseDateValue(pedido[column]);
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
  { key: "qtde", label: "Qtde", align: "num" },
  { key: "qtdeTapFacil", label: "Tap Facil", align: "num" },
  { key: "qtdeGranel", label: "A Granel", align: "num" },
  { key: "totalPedido", label: "Total (R$)", align: "num" },
  { key: "saldo", label: "Saldo (R$)", align: "num" },
];

export default function CustoObras() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<ActiveTab>("pedidos");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [selectedPedido, setSelectedPedido] = useState<any>(null);
  const [modalPedido, setModalPedido] = useState<any>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("pedido");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const { data: pedidos = [], error, isLoading, refetch } = trpc.pedidosObras.list.useQuery({
    status: statusFilter,
    search: searchTerm,
  });
  const { data: ultimaAtualizacao } = trpc.crti.ultimaAtualizacaoObras.useQuery();

  const { mutate: sincronizarObras, isPending: isSyncing } = trpc.crti.sincronizarPedidosObras.useMutation({
    onSuccess: (data) => {
      if (!data.sucesso) {
        toast.error(`CRTI Obras: ${data.mensagem}`);
        return;
      }
      toast.success(`CRTI Obras: ${data.pedidosImportados} novos, ${data.pedidosAtualizados} atualizados`);
    },
    onError: (syncError) => toast.error(`Erro ao sincronizar CRTI Obras: ${syncError.message}`),
    onSettled: () => {
      refetch();
      void utils.crti.ultimaAtualizacaoObras.invalidate();
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

  const totals = useMemo(() => {
    return visiblePedidos.reduce(
      (acc, pedido) => {
        acc.qtde += numberValue(pedido.qtde);
        acc.total += numberValue(pedido.totalPedido);
        acc.saldo += numberValue(pedido.saldo);
        return acc;
      },
      { qtde: 0, total: 0, saldo: 0 }
    );
  }, [visiblePedidos]);

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

  return (
    <div className="desktop-shell costs-shell">
      <header className="desktop-titlebar">
        <img src={minasfaltoLogo} alt="Minasfalto" className="desktop-brand-logo" />
        <div className="desktop-heading">
          <h1>CUSTO OBRAS</h1>
          <strong>Pedidos de Material Obras Proprias</strong>
        </div>
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
      </header>

      <nav className="cost-tabs" aria-label="Abas do painel de custos">
        <button
          type="button"
          className={activeTab === "pedidos" ? "active" : ""}
          onClick={() => setActiveTab("pedidos")}
        >
          PEDIDOS OBRAS
        </button>
        <button
          type="button"
          className={activeTab === "tabela" ? "active" : ""}
          onClick={() => setActiveTab("tabela")}
        >
          CUSTO TABELA GERAL
        </button>
      </nav>

      {activeTab === "pedidos" ? (
        <>
          <section className="desktop-filters">
            <label>Status:</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="desktop-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">TODOS</SelectItem>
                <SelectItem value="Aprovado">Aprovado</SelectItem>
                <SelectItem value="Concluido">Concluido</SelectItem>
                <SelectItem value="Concluído">Concluído</SelectItem>
                <SelectItem value="Cancelado">Cancelado</SelectItem>
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

            <button className="desktop-refresh" onClick={() => sincronizarObras()} disabled={isSyncing}>
              <RefreshCw size={13} /> {isSyncing ? "Sincronizando..." : "Atualizar CRTI"}
            </button>
          </section>

          <main className="desktop-grid-frame costs-grid-frame">
            <div className="desktop-table-scroll">
              <table className="desktop-table costs-table">
                <thead onClick={handleHeaderSort}>
                  <tr>
                    <th>Pedido</th>
                    <th>Data Ped.</th>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th>Qtde</th>
                    <th>Tap Facil</th>
                    <th>A Granel</th>
                    <th>Total (R$)</th>
                    <th>Saldo (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="desktop-empty">Carregando pedidos de obras...</td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={9} className="desktop-empty">
                        Erro ao carregar pedidos de obras: {error.message}
                      </td>
                    </tr>
                  ) : visiblePedidos.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="desktop-empty">Nenhum pedido de obras encontrado</td>
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
                            setModalPedido(pedido);
                          }}
                        >
                          <td>{pedido.pedido}</td>
                          <td>{pedido.dataPedido}</td>
                          <td className="desktop-client" title={pedido.materiais || ""}>{pedido.cliente}</td>
                          <td className="desktop-status">{pedido.status}</td>
                          <td className="num">{formatDecimal(pedido.qtde)}</td>
                          <td className="num">{formatDecimal(pedido.qtdeTapFacil)}</td>
                          <td className="num">{formatDecimal(pedido.qtdeGranel, 3)}</td>
                          <td className="num">{formatCurrency(pedido.totalPedido)}</td>
                          <td className="num">{formatCurrency(pedido.saldo)}</td>
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
              <span>Qtde: <b>{formatDecimal(totals.qtde, 3)}</b></span>
              <span>Total: <b>{formatCurrency(totals.total)}</b></span>
              <span>Saldo: <b>{formatCurrency(totals.saldo)}</b></span>
            </div>
            <div className="desktop-statusbar">
              <span>
                {visiblePedidos.length} pedido(s) exibido(s) | Ultima atualizacao: {formatDateTime(ultimaAtualizacao)}
              </span>
              <strong>Usuario: {user?.name ?? "admfull"}</strong>
            </div>
          </footer>
        </>
      ) : (
        <section className="cost-placeholder">
          <Calculator size={42} />
          <h2>CUSTO TABELA GERAL</h2>
          <p>Modulo criado para integracao posterior.</p>
        </section>
      )}

      <Dialog open={Boolean(modalPedido)} onOpenChange={(open) => !open && setModalPedido(null)}>
        <DialogContent className="cost-detail-dialog">
          <DialogHeader>
            <DialogTitle>Pedido {modalPedido?.pedido}</DialogTitle>
            <DialogDescription>{modalPedido?.cliente}</DialogDescription>
          </DialogHeader>
          <section className="cost-detail-empty" aria-label="Area de trabalho do pedido" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
