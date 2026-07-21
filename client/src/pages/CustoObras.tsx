import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Link2, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
type CostCategory = "Custo" | "Despesa" | "Outros";

type PaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const numberValue = (value: unknown) => Number(value) || 0;
const parseMoneyInput = (value: unknown) => Number(String(value || "0").replace(/\./g, "").replace(",", ".")) || 0;
const moneyInputValue = (value: unknown) => String(value ?? "0");
const categoryOptions: CostCategory[] = ["Custo", "Despesa", "Outros"];

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

function PaginationControls({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: PaginationState & {
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const firstItem = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const lastItem = Math.min(total, page * pageSize);

  return (
    <div className="cost-pagination" aria-label="Paginacao">
      <span className="cost-page-range">
        {firstItem}-{lastItem} de {total}
      </span>
      <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
        <SelectTrigger className="cost-page-size">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="25">25</SelectItem>
          <SelectItem value="50">50</SelectItem>
          <SelectItem value="100">100</SelectItem>
          <SelectItem value="200">200</SelectItem>
        </SelectContent>
      </Select>
      <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1}>
        <ChevronsLeft size={15} />
      </button>
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        <ChevronLeft size={15} />
      </button>
      <strong className="cost-page-label">Pagina {page} de {totalPages}</strong>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        <ChevronRight size={15} />
      </button>
      <button type="button" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}>
        <ChevronsRight size={15} />
      </button>
    </div>
  );
}

export default function CustoObras() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<ActiveTab>("pedidos");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [despesasSearchTerm, setDespesasSearchTerm] = useState("");
  const [tipoContaFilter, setTipoContaFilter] = useState("TODOS");
  const [selectedPedido, setSelectedPedido] = useState<any>(null);
  const [modalPedido, setModalPedido] = useState<any>(null);
  const [pedidosPage, setPedidosPage] = useState(1);
  const [pedidosPageSize, setPedidosPageSize] = useState(50);
  const [tabelaPage, setTabelaPage] = useState(1);
  const [tabelaPageSize, setTabelaPageSize] = useState(50);
  const [sortColumn, setSortColumn] = useState<SortColumn>("pedido");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [financeForm, setFinanceForm] = useState({
    nfes: "0",
    faturamentoDireto: "0",
    valorTotalImposto: "0",
    porcentagemImposto: "17",
  });
  const [manualExpense, setManualExpense] = useState({
    categoria: "Despesa" as CostCategory,
    justificativaOutros: "",
    valorTotalDocumento: "",
    complemento: "",
    observacoesAprovacao: "",
  });
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkSearchTerm, setLinkSearchTerm] = useState("");
  const [linkTipoContaFilter, setLinkTipoContaFilter] = useState("TODOS");
  const [linkPage, setLinkPage] = useState(1);
  const [linkPageSize, setLinkPageSize] = useState(25);
  const [linkCategory, setLinkCategory] = useState<CostCategory>("Despesa");
  const [linkJustificativa, setLinkJustificativa] = useState("");

  const { data: pedidosResult, error, isLoading, refetch } = trpc.pedidosObras.list.useQuery({
    status: statusFilter,
    search: searchTerm,
    page: pedidosPage,
    pageSize: pedidosPageSize,
  });
  const pedidosPayload = pedidosResult as unknown as
    | { items?: any[]; total?: number; totalPages?: number }
    | any[]
    | undefined;
  const pedidos = Array.isArray(pedidosPayload) ? pedidosPayload : pedidosPayload?.items ?? [];
  const pedidosTotal = Array.isArray(pedidosPayload) ? pedidos.length : pedidosPayload?.total ?? pedidos.length;
  const pedidosTotalPages = Array.isArray(pedidosPayload) ? 1 : pedidosPayload?.totalPages ?? 1;
  const { data: despesasResult, error: despesasError, isLoading: isLoadingDespesas } = trpc.despesasTabelaGeral.list.useQuery({
    tipoConta: tipoContaFilter,
    search: despesasSearchTerm,
    page: tabelaPage,
    pageSize: tabelaPageSize,
  });
  const despesas = despesasResult?.items ?? [];
  const despesasTotal = despesasResult?.total ?? 0;
  const despesasTotalPages = despesasResult?.totalPages ?? 1;
  const { data: ultimaAtualizacao } = trpc.crti.ultimaAtualizacaoObras.useQuery();
  const modalPedidoId = Number(modalPedido?.id || 0);
  const { data: modalData, isLoading: isLoadingModal } = trpc.pedidosObras.modal.useQuery(
    { pedidoObraId: modalPedidoId },
    { enabled: Boolean(modalPedidoId) },
  );
  const modalDespesas = modalData?.despesas ?? [];
  const { data: availableExpensesResult, isLoading: isLoadingAvailableExpenses } = trpc.pedidosObras.despesasDisponiveis.useQuery(
    {
      pedidoObraId: modalPedidoId || 1,
      tipoConta: linkTipoContaFilter,
      search: linkSearchTerm,
      page: linkPage,
      pageSize: linkPageSize,
    },
    { enabled: Boolean(modalPedidoId && linkModalOpen) },
  );
  const availableExpenses = availableExpensesResult?.items ?? [];
  const availableExpensesTotal = availableExpensesResult?.total ?? 0;
  const availableExpensesTotalPages = availableExpensesResult?.totalPages ?? 1;

  const { mutate: sincronizarCustos, isPending: isSyncing } = trpc.crti.sincronizacaoCustosObras.useMutation({
    onSuccess: (data) => {
      if (!data.obras.sucesso || !data.despesas.sucesso) {
        const mensagem = !data.obras.sucesso ? data.obras.mensagem : data.despesas.mensagem;
        toast.error(`CRTI Custos: ${mensagem}`);
        return;
      }
      toast.success(
        `CRTI Custos: obras ${data.obras.pedidosImportados} novos/${data.obras.pedidosAtualizados} atualizados, despesas ${data.despesas.pedidosAtualizados} processadas`
      );
    },
    onError: (syncError) => toast.error(`Erro ao sincronizar CRTI Custos: ${syncError.message}`),
    onSettled: () => {
      refetch();
      void utils.despesasTabelaGeral.list.invalidate();
      void utils.crti.ultimaAtualizacaoObras.invalidate();
    },
  });

  const invalidateModal = () => {
    if (modalPedidoId) {
      void utils.pedidosObras.modal.invalidate({ pedidoObraId: modalPedidoId });
      void utils.pedidosObras.despesasDisponiveis.invalidate();
    }
  };

  const saveFinanceiro = trpc.pedidosObras.saveFinanceiro.useMutation({
    onSuccess: () => {
      toast.success("Dados financeiros salvos");
      invalidateModal();
    },
    onError: (mutationError) => toast.error(`Erro ao salvar dados financeiros: ${mutationError.message}`),
  });

  const clearFinanceiro = trpc.pedidosObras.clearFinanceiro.useMutation({
    onSuccess: () => {
      toast.success("Dados financeiros limpos");
      invalidateModal();
    },
    onError: (mutationError) => toast.error(`Erro ao limpar dados financeiros: ${mutationError.message}`),
  });

  const createDespesaManual = trpc.pedidosObras.createDespesaManual.useMutation({
    onSuccess: () => {
      toast.success("Despesa cadastrada");
      setManualExpense({
        categoria: "Despesa",
        justificativaOutros: "",
        valorTotalDocumento: "",
        complemento: "",
        observacoesAprovacao: "",
      });
      invalidateModal();
    },
    onError: (mutationError) => toast.error(`Erro ao cadastrar despesa: ${mutationError.message}`),
  });

  const deleteDespesa = trpc.pedidosObras.deleteDespesa.useMutation({
    onSuccess: () => {
      toast.success("Despesa removida do pedido");
      invalidateModal();
    },
    onError: (mutationError) => toast.error(`Erro ao remover despesa: ${mutationError.message}`),
  });

  const vincularDespesa = trpc.pedidosObras.vincularDespesa.useMutation({
    onSuccess: () => {
      toast.success("Despesa vinculada ao pedido");
      setLinkModalOpen(false);
      setLinkSearchTerm("");
      setLinkCategory("Despesa");
      setLinkJustificativa("");
      invalidateModal();
    },
    onError: (mutationError) => toast.error(`Erro ao vincular despesa: ${mutationError.message}`),
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

  useEffect(() => {
    setPedidosPage(1);
    setSelectedPedido(null);
  }, [searchTerm, statusFilter, pedidosPageSize]);

  useEffect(() => {
    if (pedidosPage > pedidosTotalPages) {
      setPedidosPage(pedidosTotalPages);
    }
  }, [pedidosPage, pedidosTotalPages]);

  useEffect(() => {
    setTabelaPage(1);
  }, [despesasSearchTerm, tipoContaFilter, tabelaPageSize]);

  useEffect(() => {
    if (tabelaPage > despesasTotalPages) {
      setTabelaPage(despesasTotalPages);
    }
  }, [tabelaPage, despesasTotalPages]);

  useEffect(() => {
    const financeiro = modalData?.financeiro;
    if (!financeiro) {
      setFinanceForm({
        nfes: "0",
        faturamentoDireto: "0",
        valorTotalImposto: "0",
        porcentagemImposto: "17",
      });
      return;
    }

    setFinanceForm({
      nfes: moneyInputValue(financeiro.nfes),
      faturamentoDireto: moneyInputValue(financeiro.faturamentoDireto),
      valorTotalImposto: moneyInputValue(financeiro.valorTotalImposto),
      porcentagemImposto: moneyInputValue(financeiro.porcentagemImposto ?? "17"),
    });
  }, [modalData?.financeiro]);

  useEffect(() => {
    setLinkPage(1);
  }, [linkSearchTerm, linkTipoContaFilter, linkPageSize]);

  useEffect(() => {
    if (linkPage > availableExpensesTotalPages) {
      setLinkPage(availableExpensesTotalPages);
    }
  }, [linkPage, availableExpensesTotalPages]);

  const despesasTotals = useMemo(() => {
    return despesas.reduce(
      (acc: { valor: number }, despesa: any) => {
        acc.valor += numberValue(despesa.valorTotalDocumento);
        return acc;
      },
      { valor: 0 }
    );
  }, [despesas]);

  const modalCalculations = useMemo(() => {
    const nfes = parseMoneyInput(financeForm.nfes);
    const faturamentoDireto = parseMoneyInput(financeForm.faturamentoDireto);
    const receita = nfes + faturamentoDireto;
    const valorTotalImposto = parseMoneyInput(financeForm.valorTotalImposto);
    const porcentagemImposto = parseMoneyInput(financeForm.porcentagemImposto);
    const valorPorcentagemImposto = valorTotalImposto * (porcentagemImposto / 100);
    const totalDespesas = modalDespesas.reduce((total: number, despesa: any) => {
      return total + numberValue(despesa.valorTotalDocumento);
    }, 0);

    return {
      receita,
      valorPorcentagemImposto,
      totalDespesas,
      saldo: receita - valorPorcentagemImposto - totalDespesas,
    };
  }, [financeForm, modalDespesas]);

  const updateFinanceField = (field: keyof typeof financeForm, value: string) => {
    setFinanceForm((current) => ({ ...current, [field]: value }));
  };

  const handleSaveFinanceiro = () => {
    if (!modalPedido) return;
    saveFinanceiro.mutate({
      pedidoObraId: modalPedido.id,
      pedidoNum: String(modalPedido.pedido),
      nfes: parseMoneyInput(financeForm.nfes),
      faturamentoDireto: parseMoneyInput(financeForm.faturamentoDireto),
      valorTotalImposto: parseMoneyInput(financeForm.valorTotalImposto),
      porcentagemImposto: parseMoneyInput(financeForm.porcentagemImposto),
    });
  };

  const handleClearFinanceiro = () => {
    if (!modalPedido) return;
    clearFinanceiro.mutate({
      pedidoObraId: modalPedido.id,
      pedidoNum: String(modalPedido.pedido),
    });
  };

  const handleCreateDespesaManual = () => {
    if (!modalPedido) return;
    createDespesaManual.mutate({
      pedidoObraId: modalPedido.id,
      pedidoNum: String(modalPedido.pedido),
      categoria: manualExpense.categoria,
      justificativaOutros: manualExpense.justificativaOutros,
      valorTotalDocumento: parseMoneyInput(manualExpense.valorTotalDocumento),
      complemento: manualExpense.complemento,
      observacoesAprovacao: manualExpense.observacoesAprovacao,
    });
  };

  const handleVincularDespesa = (despesa: any) => {
    if (!modalPedido) return;
    vincularDespesa.mutate({
      pedidoObraId: modalPedido.id,
      pedidoNum: String(modalPedido.pedido),
      despesaTabelaGeralId: despesa.id,
      categoria: linkCategory,
      justificativaOutros: linkJustificativa,
    });
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
          DESPESAS TABELA GERAL
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

            <button className="desktop-refresh" onClick={() => sincronizarCustos()} disabled={isSyncing}>
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
            <PaginationControls
              page={pedidosPage}
              pageSize={pedidosPageSize}
              total={pedidosTotal}
              totalPages={pedidosTotalPages}
              onPageChange={setPedidosPage}
              onPageSizeChange={setPedidosPageSize}
            />
            <div className="desktop-statusbar">
              <span>
                {visiblePedidos.length} pedido(s) nesta pagina | Ultima atualizacao: {formatDateTime(ultimaAtualizacao)}
              </span>
              <strong>Usuario: {user?.name ?? "admfull"}</strong>
            </div>
          </footer>
        </>
      ) : (
        <>
          <section className="desktop-filters">
            <label>Tipo Conta:</label>
            <Select value={tipoContaFilter} onValueChange={setTipoContaFilter}>
              <SelectTrigger className="desktop-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">TODOS</SelectItem>
                <SelectItem value="Pagar">Pagar</SelectItem>
                <SelectItem value="Receber">Receber</SelectItem>
              </SelectContent>
            </Select>

            <label className="desktop-search-label">
              <Search size={13} /> Buscar:
            </label>
            <Input
              value={despesasSearchTerm}
              onChange={(event) => setDespesasSearchTerm(event.target.value)}
              className="desktop-search"
            />

            <button className="desktop-refresh" onClick={() => sincronizarCustos()} disabled={isSyncing}>
              <RefreshCw size={13} /> {isSyncing ? "Sincronizando..." : "Atualizar CRTI"}
            </button>
          </section>

          <main className="desktop-grid-frame costs-grid-frame">
            <div className="desktop-table-scroll">
              <table className="desktop-table expenses-table">
                <thead>
                  <tr>
                    <th>Codigo Forn./Cliente</th>
                    <th>Fornecedor/Cliente</th>
                    <th>Numero Documento</th>
                    <th>Tipo Conta</th>
                    <th>Tipo Documento</th>
                    <th>Data Emissao</th>
                    <th>Data Vencimento</th>
                    <th>Valor Total</th>
                    <th>Complemento</th>
                    <th>Observacoes (Aprovacao)</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingDespesas ? (
                    <tr>
                      <td colSpan={10} className="desktop-empty">Carregando despesas...</td>
                    </tr>
                  ) : despesasError ? (
                    <tr>
                      <td colSpan={10} className="desktop-empty">
                        Erro ao carregar despesas: {despesasError.message}
                      </td>
                    </tr>
                  ) : despesas.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="desktop-empty">Nenhuma despesa encontrada</td>
                    </tr>
                  ) : (
                    despesas.map((despesa: any) => (
                      <tr key={despesa.id}>
                        <td>{despesa.codigoFornecedorCliente}</td>
                        <td className="desktop-client">{despesa.fornecedorCliente}</td>
                        <td>{despesa.numeroDocumento}</td>
                        <td>{despesa.tipoConta}</td>
                        <td>{despesa.tipoDocumento}</td>
                        <td>{despesa.dataEmissao}</td>
                        <td>{despesa.dataVencimento}</td>
                        <td className="num">{formatCurrency(despesa.valorTotalDocumento)}</td>
                        <td className="expense-complement" title={despesa.complemento || ""}>{despesa.complemento}</td>
                        <td>{despesa.observacoesAprovacao}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </main>
          <footer className="desktop-footer">
            <div className="desktop-subtotals">
              <strong>SUBTOTAL DAS DESPESAS EXIBIDAS:</strong>
              <span>Valor: <b>{formatCurrency(despesasTotals.valor)}</b></span>
            </div>
            <PaginationControls
              page={tabelaPage}
              pageSize={tabelaPageSize}
              total={despesasTotal}
              totalPages={despesasTotalPages}
              onPageChange={setTabelaPage}
              onPageSizeChange={(pageSize) => {
                setTabelaPageSize(pageSize);
                setTabelaPage(1);
              }}
            />
            <div className="desktop-statusbar">
              <span>{despesas.length} registro(s) nesta pagina</span>
              <strong>Usuario: {user?.name ?? "admfull"}</strong>
            </div>
          </footer>
        </>
      )}

      <Dialog open={Boolean(modalPedido)} onOpenChange={(open) => !open && setModalPedido(null)}>
        <DialogContent className="cost-detail-dialog">
          <DialogHeader>
            <DialogTitle>Pedido {modalPedido?.pedido}</DialogTitle>
            <DialogDescription>{modalPedido?.cliente}</DialogDescription>
          </DialogHeader>
          <section className="cost-detail-workspace" aria-label="Area de trabalho do pedido">
            {isLoadingModal ? (
              <div className="cost-detail-loading">Carregando dados do pedido...</div>
            ) : (
              <>
                <div className="cost-modal-cards">
                  <label>
                    <span>NFes</span>
                    <Input
                      value={financeForm.nfes}
                      onChange={(event) => updateFinanceField("nfes", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Faturamento Direto</span>
                    <Input
                      value={financeForm.faturamentoDireto}
                      onChange={(event) => updateFinanceField("faturamentoDireto", event.target.value)}
                    />
                  </label>
                  <label className="readonly">
                    <span>Receita</span>
                    <strong>{formatCurrency(modalCalculations.receita)}</strong>
                  </label>
                  <label>
                    <span>Valor total Imposto</span>
                    <Input
                      value={financeForm.valorTotalImposto}
                      onChange={(event) => updateFinanceField("valorTotalImposto", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Porcentagem %</span>
                    <Input
                      value={financeForm.porcentagemImposto}
                      onChange={(event) => updateFinanceField("porcentagemImposto", event.target.value)}
                    />
                  </label>
                  <label className="readonly">
                    <span>Valor porcentagem do Imposto</span>
                    <strong>{formatCurrency(modalCalculations.valorPorcentagemImposto)}</strong>
                  </label>
                </div>

                <div className="cost-modal-actions">
                  <button type="button" onClick={handleSaveFinanceiro} disabled={saveFinanceiro.isPending}>
                    <Save size={14} />
                    {saveFinanceiro.isPending ? "Salvando..." : "Salvar campos"}
                  </button>
                  <button type="button" onClick={handleClearFinanceiro} disabled={clearFinanceiro.isPending}>
                    <X size={14} />
                    Limpar campos
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (manualExpense.categoria === "Outros" && !manualExpense.justificativaOutros.trim()) {
                        toast.error("Informe a justificativa para Outros.");
                        return;
                      }
                      handleCreateDespesaManual();
                    }}
                    disabled={createDespesaManual.isPending}
                  >
                    <Plus size={14} />
                    Cadastrar despesa
                  </button>
                  <button type="button" onClick={() => setLinkModalOpen(true)}>
                    <Link2 size={14} />
                    Vincular saida
                  </button>
                </div>

                <div className="manual-expense-panel">
                  <label>
                    <span>Tipo</span>
                    <Select
                      value={manualExpense.categoria}
                      onValueChange={(value) => setManualExpense((current) => ({ ...current, categoria: value as CostCategory }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((option) => (
                          <SelectItem key={option} value={option}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label>
                    <span>Valor</span>
                    <Input
                      value={manualExpense.valorTotalDocumento}
                      onChange={(event) => setManualExpense((current) => ({ ...current, valorTotalDocumento: event.target.value }))}
                    />
                  </label>
                  <label className="wide">
                    <span>Complemento</span>
                    <Input
                      value={manualExpense.complemento}
                      onChange={(event) => setManualExpense((current) => ({ ...current, complemento: event.target.value }))}
                    />
                  </label>
                  <label className="wide">
                    <span>Observacoes (Aprovacao)</span>
                    <Input
                      value={manualExpense.observacoesAprovacao}
                      onChange={(event) => setManualExpense((current) => ({ ...current, observacoesAprovacao: event.target.value }))}
                    />
                  </label>
                  {manualExpense.categoria === "Outros" && (
                    <label className="wide">
                      <span>Justificativa Outros</span>
                      <Input
                        value={manualExpense.justificativaOutros}
                        onChange={(event) => setManualExpense((current) => ({ ...current, justificativaOutros: event.target.value }))}
                      />
                    </label>
                  )}
                </div>

                <div className="modal-table-frame">
                  <table className="desktop-table modal-expenses-table">
                    <thead>
                      <tr>
                        <th>Codigo Forn./Cliente</th>
                        <th>Fornecedor/Cliente</th>
                        <th>Numero Documento</th>
                        <th>Tipo Conta</th>
                        <th>Tipo Documento</th>
                        <th>Data Emissao</th>
                        <th>Data Vencimento</th>
                        <th>Valor Total</th>
                        <th>Complemento</th>
                        <th>Observacoes (Aprovacao)</th>
                        <th>Tipo</th>
                        <th>Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalDespesas.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="desktop-empty">Nenhuma despesa vinculada ou cadastrada</td>
                        </tr>
                      ) : (
                        modalDespesas.map((despesa: any) => (
                          <tr key={despesa.id}>
                            <td>{despesa.codigoFornecedorCliente}</td>
                            <td className="desktop-client">{despesa.fornecedorCliente}</td>
                            <td>{despesa.numeroDocumento}</td>
                            <td>{despesa.tipoConta}</td>
                            <td>{despesa.tipoDocumento}</td>
                            <td>{despesa.dataEmissao}</td>
                            <td>{despesa.dataVencimento}</td>
                            <td className="num">{formatCurrency(despesa.valorTotalDocumento)}</td>
                            <td className="expense-complement" title={despesa.complemento || ""}>{despesa.complemento}</td>
                            <td>{despesa.observacoesAprovacao}</td>
                            <td>{despesa.categoria}</td>
                            <td>
                              <button
                                type="button"
                                className="table-icon-button danger"
                                onClick={() => deleteDespesa.mutate({ id: despesa.id, pedidoObraId: modalPedido.id })}
                                title={despesa.origem === "vinculada" ? "Desvincular" : "Excluir"}
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <footer className="cost-modal-summary">
                  <span>Receita: <b>{formatCurrency(modalCalculations.receita)}</b></span>
                  <span>Imposto: <b>{formatCurrency(modalCalculations.valorPorcentagemImposto)}</b></span>
                  <span>Despesas: <b>{formatCurrency(modalCalculations.totalDespesas)}</b></span>
                  <strong>Saldo: {formatCurrency(modalCalculations.saldo)}</strong>
                </footer>
              </>
            )}
          </section>
        </DialogContent>
      </Dialog>

      <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
        <DialogContent className="expense-link-dialog">
          <DialogHeader>
            <DialogTitle>Vincular saida ao Pedido {modalPedido?.pedido}</DialogTitle>
            <DialogDescription>Selecione uma despesa disponivel da tabela geral.</DialogDescription>
          </DialogHeader>

          <section className="desktop-filters link-filters">
            <label>Tipo Conta:</label>
            <Select value={linkTipoContaFilter} onValueChange={setLinkTipoContaFilter}>
              <SelectTrigger className="desktop-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">TODOS</SelectItem>
                <SelectItem value="Pagar">Pagar</SelectItem>
                <SelectItem value="Receber">Receber</SelectItem>
              </SelectContent>
            </Select>
            <label>Tipo:</label>
            <Select value={linkCategory} onValueChange={(value) => setLinkCategory(value as CostCategory)}>
              <SelectTrigger className="desktop-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="desktop-search-label">
              <Search size={13} /> Buscar:
            </label>
            <Input
              value={linkSearchTerm}
              onChange={(event) => setLinkSearchTerm(event.target.value)}
              className="desktop-search"
            />
          </section>
          {linkCategory === "Outros" && (
            <Input
              value={linkJustificativa}
              onChange={(event) => setLinkJustificativa(event.target.value)}
              className="link-justification"
              placeholder="Justificativa obrigatoria para Outros"
            />
          )}

          <div className="modal-table-frame link-table-frame">
            <table className="desktop-table modal-expenses-table">
              <thead>
                <tr>
                  <th>Codigo Forn./Cliente</th>
                  <th>Fornecedor/Cliente</th>
                  <th>Numero Documento</th>
                  <th>Tipo Conta</th>
                  <th>Tipo Documento</th>
                  <th>Data Emissao</th>
                  <th>Data Vencimento</th>
                  <th>Valor Total</th>
                  <th>Complemento</th>
                  <th>Observacoes (Aprovacao)</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingAvailableExpenses ? (
                  <tr>
                    <td colSpan={11} className="desktop-empty">Carregando despesas disponiveis...</td>
                  </tr>
                ) : availableExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="desktop-empty">Nenhuma despesa disponivel</td>
                  </tr>
                ) : (
                  availableExpenses.map((despesa: any) => (
                    <tr key={despesa.id}>
                      <td>{despesa.codigoFornecedorCliente}</td>
                      <td className="desktop-client">{despesa.fornecedorCliente}</td>
                      <td>{despesa.numeroDocumento}</td>
                      <td>{despesa.tipoConta}</td>
                      <td>{despesa.tipoDocumento}</td>
                      <td>{despesa.dataEmissao}</td>
                      <td>{despesa.dataVencimento}</td>
                      <td className="num">{formatCurrency(despesa.valorTotalDocumento)}</td>
                      <td className="expense-complement" title={despesa.complemento || ""}>{despesa.complemento}</td>
                      <td>{despesa.observacoesAprovacao}</td>
                      <td>
                        <button
                          type="button"
                          className="table-icon-button"
                          onClick={() => {
                            if (linkCategory === "Outros" && !linkJustificativa.trim()) {
                              toast.error("Informe a justificativa para Outros.");
                              return;
                            }
                            handleVincularDespesa(despesa);
                          }}
                          disabled={vincularDespesa.isPending}
                          title="Vincular"
                        >
                          <Link2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            page={linkPage}
            pageSize={linkPageSize}
            total={availableExpensesTotal}
            totalPages={availableExpensesTotalPages}
            onPageChange={setLinkPage}
            onPageSizeChange={setLinkPageSize}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
