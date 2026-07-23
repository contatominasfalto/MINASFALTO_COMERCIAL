import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileSpreadsheet, FileText, Flag, Link2, Pencil, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import minasfaltoLogo from "@/assets/minasfalto-logo.jpg";
import assinaturaDiretor from "@/assets/assinatura-diretor.png";
import papelTimbradoMinasfalto from "@/assets/papel-timbrado-minasfalto.jpeg";

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
type RevenueStatus = "Nfe" | "Faturamento Direto" | "Outros";

type PaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const numberValue = (value: unknown) => Number(value) || 0;
const parseMoneyInput = (value: unknown) => {
  const text = String(value ?? "0").trim();
  if (!text) return 0;
  if (text.includes(",")) {
    return Number(text.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return Number(text) || 0;
};
const parsePercentInput = (value: unknown) => Number(String(value || "0").replace(",", ".")) || 0;
const moneyInputValue = (value: unknown) => String(value ?? "0");
const categoryOptions: CostCategory[] = ["Custo", "Despesa", "Outros"];
const matchesSearch = (values: unknown[], search: string) => {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(needle));
};

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numberValue(value));

const formatCurrencyOrBlank = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "";
  return formatCurrency(value);
};
const escapeExcelValue = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
const buildExcelSheet = (name: string, rows: unknown[][]) => `
  <Worksheet ss:Name="${escapeExcelValue(name)}">
    <Table>
      ${rows.map((row) => `
        <Row>
          ${row.map((cell) => `
            <Cell><Data ss:Type="String">${escapeExcelValue(cell)}</Data></Cell>
          `).join("")}
        </Row>
      `).join("")}
    </Table>
  </Worksheet>
`;
const buildExcelWorkbook = (sheets: Array<{ name: string; rows: unknown[][] }>) => `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  ${sheets.map((sheet) => buildExcelSheet(sheet.name, sheet.rows)).join("")}
</Workbook>`;
const isNegativeAmount = (value: unknown) => value !== null && value !== undefined && value !== "" && numberValue(value) < 0;

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

const formatDateBR = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return `${day}/${month}/${year}`;
  }
  const brDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brDate) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
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
  pageSizeOptions = [25, 50, 100, 200],
}: PaginationState & {
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
}) {
  const firstItem = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const lastItem = Math.min(total, page * pageSize);
  const goToPage = (nextPage: number) => {
    onPageChange(Math.min(Math.max(1, nextPage), totalPages));
  };

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
          {pageSizeOptions.map((option) => (
            <SelectItem key={option} value={String(option)}>{option}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button type="button" onClick={() => goToPage(1)} disabled={page <= 1}>
        <ChevronsLeft size={15} />
      </button>
      <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
        <ChevronLeft size={15} />
      </button>
      <strong className="cost-page-label">Pagina {page} de {totalPages}</strong>
      <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
        <ChevronRight size={15} />
      </button>
      <button type="button" onClick={() => goToPage(totalPages)} disabled={page >= totalPages}>
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
  const [somentePagarNaoVinculados, setSomentePagarNaoVinculados] = useState(false);
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
    id: null as number | null,
    categoria: "Despesa" as CostCategory,
    justificativaOutros: "",
    codigoFornecedorCliente: "",
    fornecedorCliente: "",
    numeroDocumento: "",
    tipoConta: "",
    tipoDocumento: "",
    dataEmissao: "",
    dataVencimento: "",
    valorTotalDocumento: "",
    complemento: "",
    observacoesAprovacao: "",
  });
  const [manualRevenue, setManualRevenue] = useState({
    id: null as number | null,
    numeroDocumento: "",
    status: "Nfe" as RevenueStatus,
    data: "",
    valor: "",
    descricao: "",
  });
  const [manualExpenseModalOpen, setManualExpenseModalOpen] = useState(false);
  const [manualRevenueModalOpen, setManualRevenueModalOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [receitaGroupOpen, setReceitaGroupOpen] = useState(false);
  const [custosGroupOpen, setCustosGroupOpen] = useState(false);
  const [impostosGroupOpen, setImpostosGroupOpen] = useState(false);
  const [despesasGroupOpen, setDespesasGroupOpen] = useState(false);
  const [receitaGroupSearch, setReceitaGroupSearch] = useState("");
  const [custosGroupSearch, setCustosGroupSearch] = useState("");
  const [despesasGroupSearch, setDespesasGroupSearch] = useState("");
  const [impostosGroupSearch, setImpostosGroupSearch] = useState("");
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
  const effectiveTipoContaFilter = somentePagarNaoVinculados ? "Pagar" : tipoContaFilter;
  const { data: despesasResult, error: despesasError, isLoading: isLoadingDespesas } = trpc.despesasTabelaGeral.list.useQuery({
    tipoConta: effectiveTipoContaFilter,
    search: despesasSearchTerm,
    somenteNaoVinculados: somentePagarNaoVinculados,
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
  const modalCustos = modalData?.custos ?? [];
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
  const modalReceitas = modalData?.receitas ?? [];

  const { mutate: sincronizarCustos, isPending: isSyncing } = trpc.crti.sincronizacaoCustosObras.useMutation({
    onSuccess: (data) => {
      if (!data.obras.sucesso || !data.despesas.sucesso || !data.custos.sucesso) {
        const mensagem = !data.obras.sucesso
          ? data.obras.mensagem
          : !data.despesas.sucesso
            ? data.despesas.mensagem
            : data.custos.mensagem;
        toast.error(`CRTI Custos: ${mensagem}`);
        return;
      }
      toast.success(
        `CRTI Custos: obras ${data.obras.pedidosImportados} novos/${data.obras.pedidosAtualizados} atualizados, despesas ${data.despesas.pedidosAtualizados} processadas, custos ${data.custos.pedidosAtualizados} processados`
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
      void utils.pedidosObras.list.invalidate();
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

  const createReceita = trpc.pedidosObras.createReceita.useMutation({
    onSuccess: () => {
      toast.success("Receita cadastrada");
      resetManualRevenueForm();
      setManualRevenueModalOpen(false);
      invalidateModal();
    },
    onError: (mutationError) => toast.error(`Erro ao cadastrar receita: ${mutationError.message}`),
  });

  const updateReceita = trpc.pedidosObras.updateReceita.useMutation({
    onSuccess: () => {
      toast.success("Receita atualizada");
      resetManualRevenueForm();
      setManualRevenueModalOpen(false);
      invalidateModal();
    },
    onError: (mutationError) => toast.error(`Erro ao atualizar receita: ${mutationError.message}`),
  });

  const deleteReceita = trpc.pedidosObras.deleteReceita.useMutation({
    onSuccess: () => {
      toast.success("Receita removida");
      invalidateModal();
    },
    onError: (mutationError) => toast.error(`Erro ao remover receita: ${mutationError.message}`),
  });

  const createDespesaManual = trpc.pedidosObras.createDespesaManual.useMutation({
    onSuccess: () => {
      toast.success("Despesa cadastrada");
      resetManualExpenseForm();
      setManualExpenseModalOpen(false);
      invalidateModal();
    },
    onError: (mutationError) => toast.error(`Erro ao cadastrar despesa: ${mutationError.message}`),
  });

  const updateDespesa = trpc.pedidosObras.updateDespesa.useMutation({
    onSuccess: () => {
      toast.success("Despesa atualizada");
      resetManualExpenseForm();
      setManualExpenseModalOpen(false);
      invalidateModal();
    },
    onError: (mutationError) => toast.error(`Erro ao atualizar despesa: ${mutationError.message}`),
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

  const vincularSaidasAutomaticas = trpc.pedidosObras.vincularSaidasAutomaticas.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Vinculo automatico: ${data.vinculadas} vinculada(s), ${data.semPedido} sem pedido encontrado`
      );
      refetch();
      void utils.pedidosObras.list.invalidate();
      void utils.pedidosObras.modal.invalidate();
      void utils.pedidosObras.despesasDisponiveis.invalidate();
    },
    onError: (mutationError) => toast.error(`Erro no vinculo automatico: ${mutationError.message}`),
  });

  const exportarDespesasExcel = trpc.despesasTabelaGeral.exportExcel.useMutation({
    onSuccess: ({ despesas: despesasRows, pedidos: pedidosRows }) => {
      if (!despesasRows.length && !pedidosRows.length) {
        toast.error("Nenhum lancamento para exportar.");
        return;
      }

      const pedidosHeaders = [
        "Pedido",
        "Data Ped.",
        "Cliente",
        "Status",
        "Qtde",
        "Tap Facil",
        "A Granel",
        "Total (R$)",
        "Saldo (R$)",
      ];
      const despesasHeaders = [
        "Codigo Forn./Cliente",
        "Fornecedor/Cliente",
        "Numero Documento",
        "Tipo Conta",
        "Tipo Documento",
        "Data Emissao",
        "Data Vencimento",
        "Valor Total",
        "Complemento",
        "Observacoes (Aprovacao)",
        "Vinculado",
      ];
      const pedidosSheetRows = [
        pedidosHeaders,
        ...pedidosRows.map((pedido: any) => [
          pedido.pedido,
          pedido.dataPedido,
          pedido.cliente,
          pedido.status,
          formatDecimal(pedido.qtde),
          formatDecimal(pedido.qtdeTapFacil),
          formatDecimal(pedido.qtdeGranel, 3),
          formatCurrency(pedido.totalPedido),
          formatCurrency(pedido.saldo),
        ]),
      ];
      const despesasSheetRows = [
        despesasHeaders,
        ...despesasRows.map((despesa: any) => [
          despesa.codigoFornecedorCliente,
          despesa.fornecedorCliente,
          despesa.numeroDocumento,
          despesa.tipoConta,
          despesa.tipoDocumento,
          despesa.dataEmissao,
          despesa.dataVencimento,
          formatCurrency(despesa.valorTotalDocumento),
          despesa.complemento,
          despesa.observacoesAprovacao,
          despesa.vinculado,
        ]),
      ];
      const excelContent = buildExcelWorkbook([
        { name: "Pedidos Obras", rows: pedidosSheetRows },
        { name: "Despesas Tabela Geral", rows: despesasSheetRows },
      ]);
      const blob = new Blob([excelContent], { type: "application/vnd.ms-excel;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);

      link.href = url;
      link.download = `despesas-tabela-geral-${today}.xls`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${pedidosRows.length} pedido(s) e ${despesasRows.length} despesa(s) exportados.`);
    },
    onError: (mutationError) => toast.error(`Erro ao exportar Excel: ${mutationError.message}`),
  });

  const handleExportarDespesasExcel = () => {
    exportarDespesasExcel.mutate({
      despesas: {
        tipoConta: effectiveTipoContaFilter,
        search: despesasSearchTerm,
        somenteNaoVinculados: somentePagarNaoVinculados,
      },
      pedidos: {
        status: statusFilter,
        search: searchTerm,
      },
    });
  };

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
    if (!pedidosResult) return;
    if (pedidosPage > pedidosTotalPages) {
      setPedidosPage(pedidosTotalPages);
    }
  }, [pedidosPage, pedidosResult, pedidosTotalPages]);

  useEffect(() => {
    setTabelaPage(1);
  }, [despesasSearchTerm, effectiveTipoContaFilter, somentePagarNaoVinculados, tabelaPageSize]);

  useEffect(() => {
    if (!despesasResult) return;
    if (tabelaPage > despesasTotalPages) {
      setTabelaPage(despesasTotalPages);
    }
  }, [despesasResult, tabelaPage, despesasTotalPages]);

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
    if (!availableExpensesResult) return;
    if (linkPage > availableExpensesTotalPages) {
      setLinkPage(availableExpensesTotalPages);
    }
  }, [availableExpensesResult, linkPage, availableExpensesTotalPages]);

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
    const receita = modalReceitas.reduce((total: number, receitaItem: any) => {
      return total + numberValue(receitaItem.valor);
    }, 0);
    const nfeReceitas = modalReceitas.filter((receitaItem: any) => receitaItem.status === "Nfe");
    const valorTotalImpostoBase = nfeReceitas.reduce((total: number, receitaItem: any) => {
      return total + numberValue(receitaItem.valor);
    }, 0);
    const porcentagemImposto = parsePercentInput(financeForm.porcentagemImposto);
    const valorPorcentagemImposto = valorTotalImpostoBase * (porcentagemImposto / 100);
    const impostos = nfeReceitas.map((receitaItem: any) => ({
      id: receitaItem.id,
      numeroDocumento: receitaItem.numeroDocumento,
      data: receitaItem.data,
      valorImposto: numberValue(receitaItem.valor) * (porcentagemImposto / 100),
    }));
    const totalDespesas = modalDespesas.reduce((total: number, despesa: any) => {
      return total + numberValue(despesa.valorTotalDocumento);
    }, 0);
    const totalCustos = modalCustos.reduce((total: number, custo: any) => {
      return total + numberValue(custo.valorTotal);
    }, 0);

    return {
      receita,
      valorTotalImpostoBase,
      porcentagemImposto,
      valorPorcentagemImposto,
      impostos,
      totalDespesas,
      totalCustos,
      saldo: receita - valorPorcentagemImposto - totalDespesas - totalCustos,
    };
  }, [financeForm, modalCustos, modalDespesas, modalReceitas]);

  const filteredModalReceitas = useMemo(() => {
    return modalReceitas.filter((receita: any) => matchesSearch([
      receita.numeroDocumento,
      receita.status,
      formatDateBR(receita.data),
      formatCurrency(receita.valor),
      receita.valor,
      receita.descricao,
    ], receitaGroupSearch));
  }, [modalReceitas, receitaGroupSearch]);

  const filteredModalDespesas = useMemo(() => {
    return modalDespesas.filter((despesa: any) => matchesSearch([
      despesa.codigoFornecedorCliente,
      despesa.fornecedorCliente,
      despesa.numeroDocumento,
      despesa.tipoConta,
      despesa.tipoDocumento,
      formatDateBR(despesa.dataEmissao),
      formatDateBR(despesa.dataVencimento),
      formatCurrency(despesa.valorTotalDocumento),
      despesa.valorTotalDocumento,
      despesa.complemento,
      despesa.observacoesAprovacao,
      despesa.categoria,
    ], despesasGroupSearch));
  }, [modalDespesas, despesasGroupSearch]);

  const filteredModalCustos = useMemo(() => {
    return modalCustos.filter((custo: any) => matchesSearch([
      custo.numeroDocumento,
      formatDateBR(custo.dataEmissao),
      formatCurrency(custo.valorTotal),
      custo.valorTotal,
      custo.situacao,
      custo.complemento,
    ], custosGroupSearch));
  }, [modalCustos, custosGroupSearch]);

  const filteredModalImpostos = useMemo(() => {
    return modalCalculations.impostos.filter((imposto: any) => matchesSearch([
      imposto.numeroDocumento,
      formatDateBR(imposto.data),
      formatCurrency(imposto.valorImposto),
      imposto.valorImposto,
    ], impostosGroupSearch));
  }, [modalCalculations.impostos, impostosGroupSearch]);

  const handleExportMedicaoPdf = () => {
    if (!modalPedido) return;

    const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });

    const wrapText = (context: CanvasRenderingContext2D, text: unknown, maxWidth: number) => {
      const words = String(text ?? "").split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let line = "";

      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width <= maxWidth || !line) {
          line = candidate;
        } else {
          lines.push(line);
          line = word;
        }
      }

      if (line) lines.push(line);
      return lines.length > 0 ? lines : [""];
    };

    const drawWrappedText = (
      context: CanvasRenderingContext2D,
      text: unknown,
      x: number,
      y: number,
      maxWidth: number,
      lineHeight: number,
      maxLines = 3,
    ) => {
      const lines = wrapText(context, text, maxWidth).slice(0, maxLines);
      lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
      return lines.length * lineHeight;
    };

    const bytesFromDataUrl = (dataUrl: string) => {
      const base64 = dataUrl.split(",")[1] || "";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    };

    const createPdfBlob = (jpegPages: Array<{ dataUrl: string; width: number; height: number }>) => {
      const encoder = new TextEncoder();
      const parts: Uint8Array[] = [];
      const offsets: number[] = [];
      let position = 0;

      const pushText = (text: string) => {
        const bytes = encoder.encode(text);
        parts.push(bytes);
        position += bytes.length;
      };

      const pushBytes = (bytes: Uint8Array) => {
        parts.push(bytes);
        position += bytes.length;
      };

      const pageWidthPt = 595.28;
      const pageHeightPt = 841.89;
      const pageObjectNumbers = jpegPages.map((_, index) => 5 + index * 3);
      const objectCount = 2 + jpegPages.length * 3;

      pushText("%PDF-1.3\n");

      const pushObjectStart = (objectNumber: number) => {
        offsets[objectNumber] = position;
        pushText(`${objectNumber} 0 obj\n`);
      };

      pushObjectStart(1);
      pushText("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

      pushObjectStart(2);
      pushText(`<< /Type /Pages /Count ${jpegPages.length} /Kids [${pageObjectNumbers.map((objectNumber) => `${objectNumber} 0 R`).join(" ")}] >>\nendobj\n`);

      jpegPages.forEach((page, index) => {
        const imageObjectNumber = 3 + index * 3;
        const contentObjectNumber = 4 + index * 3;
        const pageObjectNumber = 5 + index * 3;
        const imageBytes = bytesFromDataUrl(page.dataUrl);
        const content = `q\n${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm\n/Im${index + 1} Do\nQ\n`;
        const contentBytes = encoder.encode(content);

        pushObjectStart(imageObjectNumber);
        pushText(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
        pushBytes(imageBytes);
        pushText("\nendstream\nendobj\n");

        pushObjectStart(contentObjectNumber);
        pushText(`<< /Length ${contentBytes.length} >>\nstream\n`);
        pushBytes(contentBytes);
        pushText("\nendstream\nendobj\n");

        pushObjectStart(pageObjectNumber);
        pushText(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] /Resources << /XObject << /Im${index + 1} ${imageObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>\nendobj\n`);
      });

      const xrefPosition = position;
      pushText(`xref\n0 ${objectCount + 1}\n`);
      pushText("0000000000 65535 f \n");
      for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
        pushText(`${String(offsets[objectNumber] || 0).padStart(10, "0")} 00000 n \n`);
      }
      pushText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF`);

      const blobParts: BlobPart[] = parts.map((part) =>
        part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer
      );
      return new Blob(blobParts, { type: "application/pdf" });
    };

    const downloadBlob = (blob: Blob, filename: string) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    };

    const drawTable = (
      context: CanvasRenderingContext2D,
      title: string,
      headers: string[],
      rows: unknown[][],
      startY: number,
      widths: number[],
    ) => {
      const marginX = 64;
      const lineHeight = 15;
      let y = startY;

      context.fillStyle = "#dce6f0";
      context.strokeStyle = "#9fb0c2";
      context.lineWidth = 1;
      context.fillRect(marginX, y, widths.reduce((total, width) => total + width, 0), 28);
      context.strokeRect(marginX, y, widths.reduce((total, width) => total + width, 0), 28);
      context.fillStyle = "#001b34";
      context.font = "bold 16px Arial";
      context.fillText(title, marginX + 10, y + 19);
      y += 28;

      context.fillStyle = "#e7eef6";
      context.fillRect(marginX, y, widths.reduce((total, width) => total + width, 0), 24);
      context.strokeRect(marginX, y, widths.reduce((total, width) => total + width, 0), 24);
      context.fillStyle = "#001b34";
      context.font = "bold 10px Arial";
      let x = marginX;
      headers.forEach((header, index) => {
        context.fillText(header, x + 5, y + 16);
        x += widths[index];
      });
      y += 24;

      context.font = "10px Arial";
      const tableRows = rows.length > 0 ? rows : [[`Nenhum registro em ${title.toLowerCase()}`]];
      tableRows.forEach((row, rowIndex) => {
        const rowLines = row.map((cell, index) => wrapText(context, cell, Math.max((widths[index] || 900) - 10, 60)));
        const rowHeight = Math.max(26, Math.min(82, Math.max(...rowLines.map((lines) => lines.length)) * lineHeight + 10));
        context.fillStyle = rowIndex % 2 === 0 ? "rgba(255,255,255,.94)" : "rgba(231,238,246,.7)";
        context.fillRect(marginX, y, widths.reduce((total, width) => total + width, 0), rowHeight);
        context.strokeStyle = "#c4d0dc";
        context.strokeRect(marginX, y, widths.reduce((total, width) => total + width, 0), rowHeight);
        context.fillStyle = "#111827";
        x = marginX;
        row.forEach((cell, index) => {
          drawWrappedText(context, cell, x + 5, y + 16, Math.max((widths[index] || 900) - 10, 60), lineHeight, 4);
          x += widths[index] || 900;
        });
        y += rowHeight;
      });

      return y + 18;
    };

    const buildPdf = async () => {
      const [logoImage, assinaturaImage, timbradoImage] = await Promise.all([
        loadImage(minasfaltoLogo),
        loadImage(assinaturaDiretor),
        loadImage(papelTimbradoMinasfalto),
      ]);

      const pageWidth = 1240;
      const pageHeight = 1754;
      const jpegPages: Array<{ dataUrl: string; width: number; height: number }> = [];
      const receitasRows = modalReceitas.map((receita: any) => [
        receita.numeroDocumento,
        receita.status,
        formatDateBR(receita.data),
        formatCurrency(receita.valor),
        receita.descricao,
      ]);
      const despesasRows = modalDespesas.map((despesa: any) => [
        despesa.codigoFornecedorCliente,
        despesa.fornecedorCliente,
        despesa.numeroDocumento,
        despesa.tipoConta,
        despesa.tipoDocumento,
        formatDateBR(despesa.dataEmissao),
        formatDateBR(despesa.dataVencimento),
        formatCurrency(despesa.valorTotalDocumento),
        despesa.complemento,
      ]);
      const impostosRows = modalCalculations.impostos.map((imposto: any) => [
        imposto.numeroDocumento,
        formatDateBR(imposto.data),
        formatCurrency(imposto.valorImposto),
      ]);
      const custosRows = modalCustos.map((custo: any) => [
        custo.numeroDocumento,
        formatDateBR(custo.dataEmissao),
        formatCurrency(custo.valorTotal),
        custo.situacao,
        custo.complemento,
      ]);

      const rowGroups = [
        { title: "Receitas", headers: ["N Doc", "Status", "Data", "Valor", "Descricao"], rows: receitasRows, widths: [130, 130, 120, 140, 590], chunk: 12 },
        { title: "Despesas", headers: ["Codigo", "Fornecedor", "N Doc", "Conta", "Documento", "Emissao", "Vencimento", "Valor", "Complemento"], rows: despesasRows, widths: [85, 185, 100, 90, 115, 105, 105, 120, 305], chunk: 10 },
        { title: "Impostos", headers: ["N Doc", "Data", "Valor do Imposto"], rows: impostosRows, widths: [240, 180, 220], chunk: 18 },
        { title: "Custos", headers: ["N Doc", "Data", "Valor Total", "Situacao", "Complemento"], rows: custosRows, widths: [130, 120, 140, 120, 600], chunk: 12 },
      ];

      const createPage = (pageIndex: number) => {
        const canvas = document.createElement("canvas");
        canvas.width = pageWidth;
        canvas.height = pageHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas indisponivel");

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, pageWidth, pageHeight);
        context.drawImage(timbradoImage, 0, 0, pageWidth, pageHeight);

        context.fillStyle = "rgba(255,255,255,.92)";
        context.fillRect(54, 54, pageWidth - 108, pageHeight - 170);

        context.drawImage(logoImage, 64, 64, 86, 62);
        context.fillStyle = "#001b34";
        context.font = "bold 26px Arial";
        context.fillText("MEDICAO DE OBRA", 172, 86);
        context.font = "bold 16px Arial";
        context.fillStyle = "#334155";
        context.fillText(`Pedido ${modalPedido.pedido} - ${modalPedido.cliente}`, 172, 112);
        context.strokeStyle = "#f2a51c";
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(64, 142);
        context.lineTo(pageWidth - 64, 142);
        context.stroke();

        context.font = "bold 14px Arial";
        context.fillStyle = "#001b34";
        const meta = [
          ["Pedido", modalPedido.pedido],
          ["Data de inicio", formatDateBR(modalPedido.dataPedido) || "Nao informado"],
          ["Data da impressao", formatDateTime(new Date())],
          ["Status", modalPedido.status],
        ];
        meta.forEach(([label, value], index) => {
          const x = 64 + index * 280;
          context.strokeStyle = "#9fb0c2";
          context.fillStyle = "rgba(255,255,255,.95)";
          context.fillRect(x, 162, 260, 58);
          context.strokeRect(x, 162, 260, 58);
          context.fillStyle = "#64748b";
          context.font = "bold 10px Arial";
          context.fillText(String(label).toUpperCase(), x + 10, 180);
          context.fillStyle = "#001b34";
          context.font = "bold 15px Arial";
          context.fillText(String(value), x + 10, 204);
        });

        const summary = [
          ["Receita", formatCurrency(modalCalculations.receita)],
          ["Impostos", formatCurrency(modalCalculations.valorPorcentagemImposto)],
          ["Despesas", formatCurrency(modalCalculations.totalDespesas)],
          ["Custos", formatCurrency(modalCalculations.totalCustos)],
          ["Saldo", formatCurrency(modalCalculations.saldo)],
        ];
        summary.forEach(([label, value], index) => {
          const x = 64 + index * 224;
          context.fillStyle = "rgba(255,255,255,.95)";
          context.fillRect(x, 236, 205, 62);
          context.strokeRect(x, 236, 205, 62);
          context.fillStyle = "#64748b";
          context.font = "bold 10px Arial";
          context.fillText(String(label).toUpperCase(), x + 10, 255);
          context.fillStyle = label === "Saldo" && modalCalculations.saldo < 0 ? "#c00000" : "#001b34";
          context.font = "bold 16px Arial";
          context.fillText(String(value), x + 10, 282);
        });

        context.fillStyle = "#64748b";
        context.font = "10px Arial";
        context.fillText(`Pagina ${pageIndex}`, pageWidth - 120, pageHeight - 52);

        return { canvas, context, startY: 326 };
      };

      let pageNumber = 1;
      let page = createPage(pageNumber);
      let y = page.startY;

      rowGroups.forEach((group) => {
        const chunks = group.rows.length > 0
          ? Array.from({ length: Math.ceil(group.rows.length / group.chunk) }, (_, index) => group.rows.slice(index * group.chunk, (index + 1) * group.chunk))
          : [[]];

        chunks.forEach((rows, chunkIndex) => {
          if (y > 1180 || chunkIndex > 0) {
            jpegPages.push({ dataUrl: page.canvas.toDataURL("image/jpeg", 0.92), width: pageWidth, height: pageHeight });
            pageNumber += 1;
            page = createPage(pageNumber);
            y = page.startY;
          }
          y = drawTable(page.context, chunkIndex > 0 ? `${group.title} (continuação)` : group.title, group.headers, rows, y, group.widths);
        });
      });

      if (y > 1360) {
        jpegPages.push({ dataUrl: page.canvas.toDataURL("image/jpeg", 0.92), width: pageWidth, height: pageHeight });
        pageNumber += 1;
        page = createPage(pageNumber);
        y = page.startY;
      }

      page.context.drawImage(assinaturaImage, 490, Math.max(y + 20, 1280), 260, 70);
      page.context.strokeStyle = "#111827";
      page.context.beginPath();
      page.context.moveTo(460, Math.max(y + 95, 1360));
      page.context.lineTo(780, Math.max(y + 95, 1360));
      page.context.stroke();
      page.context.fillStyle = "#001b34";
      page.context.font = "bold 13px Arial";
      page.context.fillText("Diretoria Minasfalto", 555, Math.max(y + 118, 1383));
      page.context.fillStyle = "#64748b";
      page.context.font = "10px Arial";
      page.context.fillText("Documento gerado pelo Sistema Integrado Minasfalto.", 494, Math.max(y + 146, 1411));

      jpegPages.push({ dataUrl: page.canvas.toDataURL("image/jpeg", 0.92), width: pageWidth, height: pageHeight });
      const pdfBlob = createPdfBlob(jpegPages);
      const today = new Date().toISOString().slice(0, 10);
      downloadBlob(pdfBlob, `medicao-obra-${modalPedido.pedido}-${today}.pdf`);
    };

    toast.info("Gerando PDF da medicao...");
    buildPdf()
      .then(() => toast.success("PDF da medicao baixado."))
      .catch((error) => {
        console.error(error);
        toast.error("Erro ao gerar PDF da medicao.");
      });
  };

  const updateFinanceField = (field: keyof typeof financeForm, value: string) => {
    setFinanceForm((current) => ({ ...current, [field]: value }));
  };

  function resetManualExpenseForm() {
    setManualExpense({
      id: null,
      categoria: "Despesa",
      justificativaOutros: "",
      codigoFornecedorCliente: "",
      fornecedorCliente: "",
      numeroDocumento: "",
      tipoConta: "",
      tipoDocumento: "",
      dataEmissao: "",
      dataVencimento: "",
      valorTotalDocumento: "",
      complemento: "",
      observacoesAprovacao: "",
    });
  }

  const openNewManualExpense = () => {
    resetManualExpenseForm();
    setManualExpenseModalOpen(true);
  };

  const openEditManualExpense = (despesa: any) => {
    setManualExpense({
      id: despesa.id,
      categoria: despesa.categoria || "Despesa",
      justificativaOutros: despesa.justificativaOutros || "",
      codigoFornecedorCliente: despesa.codigoFornecedorCliente || "",
      fornecedorCliente: despesa.fornecedorCliente || "",
      numeroDocumento: despesa.numeroDocumento || "",
      tipoConta: despesa.tipoConta || "",
      tipoDocumento: despesa.tipoDocumento || "",
      dataEmissao: despesa.dataEmissao || "",
      dataVencimento: despesa.dataVencimento || "",
      valorTotalDocumento: moneyInputValue(despesa.valorTotalDocumento),
      complemento: despesa.complemento || "",
      observacoesAprovacao: despesa.observacoesAprovacao || "",
    });
    setManualExpenseModalOpen(true);
  };

  function resetManualRevenueForm() {
    setManualRevenue({
      id: null,
      numeroDocumento: "",
      status: "Nfe",
      data: "",
      valor: "",
      descricao: "",
    });
  }

  const openNewManualRevenue = () => {
    resetManualRevenueForm();
    setManualRevenueModalOpen(true);
  };

  const openEditManualRevenue = (receita: any) => {
    setManualRevenue({
      id: receita.id,
      numeroDocumento: receita.numeroDocumento || "",
      status: receita.status || "Nfe",
      data: receita.data || "",
      valor: moneyInputValue(receita.valor),
      descricao: receita.descricao || "",
    });
    setManualRevenueModalOpen(true);
  };

  const handleSaveFinanceiro = () => {
    if (!modalPedido) return;
    saveFinanceiro.mutate({
      pedidoObraId: modalPedido.id,
      pedidoNum: String(modalPedido.pedido),
      nfes: parseMoneyInput(financeForm.nfes),
      faturamentoDireto: parseMoneyInput(financeForm.faturamentoDireto),
      valorTotalImposto: modalCalculations.valorTotalImpostoBase,
      porcentagemImposto: parsePercentInput(financeForm.porcentagemImposto),
    });
  };

  const handleClearFinanceiro = () => {
    if (!modalPedido) return;
    clearFinanceiro.mutate({
      pedidoObraId: modalPedido.id,
      pedidoNum: String(modalPedido.pedido),
    });
  };

  const handleSaveReceita = () => {
    if (!modalPedido) return;
    const payload = {
      pedidoObraId: modalPedido.id,
      pedidoNum: String(modalPedido.pedido),
      numeroDocumento: manualRevenue.numeroDocumento,
      status: manualRevenue.status,
      data: manualRevenue.data,
      valor: parseMoneyInput(manualRevenue.valor),
      descricao: manualRevenue.descricao,
    };

    if (manualRevenue.id) {
      updateReceita.mutate({
        id: manualRevenue.id,
        pedidoObraId: payload.pedidoObraId,
        numeroDocumento: payload.numeroDocumento,
        status: payload.status,
        data: payload.data,
        valor: payload.valor,
        descricao: payload.descricao,
      });
      return;
    }

    createReceita.mutate(payload);
  };

  const handleCreateDespesaManual = () => {
    if (!modalPedido) return;
    const payload = {
      pedidoObraId: modalPedido.id,
      pedidoNum: String(modalPedido.pedido),
      categoria: manualExpense.categoria,
      justificativaOutros: manualExpense.justificativaOutros,
      codigoFornecedorCliente: manualExpense.codigoFornecedorCliente,
      fornecedorCliente: manualExpense.fornecedorCliente,
      numeroDocumento: manualExpense.numeroDocumento,
      tipoConta: manualExpense.tipoConta,
      tipoDocumento: manualExpense.tipoDocumento,
      dataEmissao: manualExpense.dataEmissao,
      dataVencimento: manualExpense.dataVencimento,
      valorTotalDocumento: parseMoneyInput(manualExpense.valorTotalDocumento),
      complemento: manualExpense.complemento,
      observacoesAprovacao: manualExpense.observacoesAprovacao,
    };

    if (manualExpense.id) {
      updateDespesa.mutate({
        id: manualExpense.id,
        ...payload,
      });
      return;
    }

    createDespesaManual.mutate(payload);
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

      {modalPedido ? (
        <section className="medicao-print-root" aria-label="Medicao de obra para impressao">
          <img className="medicao-letterhead-bg" src={papelTimbradoMinasfalto} alt="" />
          <main className="medicao-print-page">
            <header className="medicao-print-header">
              <img src={minasfaltoLogo} alt="Minasfalto" className="medicao-print-logo" />
              <div>
                <h1>Medicao de Obra</h1>
                <p>Pedido {modalPedido.pedido} - {modalPedido.cliente}</p>
              </div>
            </header>

            <section className="medicao-meta-grid">
              <div>
                <span>Pedido</span>
                <strong>{modalPedido.pedido}</strong>
              </div>
              <div>
                <span>Data de inicio</span>
                <strong>{formatDateBR(modalPedido.dataPedido) || "Nao informado"}</strong>
              </div>
              <div>
                <span>Data da impressao</span>
                <strong>{formatDateTime(new Date())}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{modalPedido.status}</strong>
              </div>
            </section>

            <section className="medicao-summary-grid">
              <div><span>Receita</span><strong>{formatCurrency(modalCalculations.receita)}</strong></div>
              <div><span>Impostos</span><strong>{formatCurrency(modalCalculations.valorPorcentagemImposto)}</strong></div>
              <div><span>Despesas</span><strong>{formatCurrency(modalCalculations.totalDespesas)}</strong></div>
              <div><span>Custos</span><strong>{formatCurrency(modalCalculations.totalCustos)}</strong></div>
              <div>
                <span>Saldo</span>
                <strong className={modalCalculations.saldo < 0 ? "negative" : ""}>{formatCurrency(modalCalculations.saldo)}</strong>
              </div>
            </section>

            <section className="medicao-section">
              <h2>Receitas</h2>
              <table>
                <thead>
                  <tr>
                    <th>N Doc</th>
                    <th>Status</th>
                    <th>Data</th>
                    <th>Valor</th>
                    <th>Descricao</th>
                  </tr>
                </thead>
                <tbody>
                  {modalReceitas.length === 0 ? (
                    <tr><td colSpan={5}>Nenhuma receita cadastrada</td></tr>
                  ) : modalReceitas.map((receita: any) => (
                    <tr key={receita.id}>
                      <td>{receita.numeroDocumento}</td>
                      <td>{receita.status}</td>
                      <td>{formatDateBR(receita.data)}</td>
                      <td>{formatCurrency(receita.valor)}</td>
                      <td>{receita.descricao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="medicao-section">
              <h2>Despesas</h2>
              <table>
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Fornecedor/Cliente</th>
                    <th>N Documento</th>
                    <th>Tipo Conta</th>
                    <th>Tipo Documento</th>
                    <th>Data Emissao</th>
                    <th>Data Vencimento</th>
                    <th>Valor Total</th>
                    <th>Complemento</th>
                    <th>Observacoes</th>
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {modalDespesas.length === 0 ? (
                    <tr><td colSpan={11}>Nenhuma despesa vinculada ou cadastrada</td></tr>
                  ) : modalDespesas.map((despesa: any) => (
                    <tr key={despesa.id}>
                      <td>{despesa.codigoFornecedorCliente}</td>
                      <td>{despesa.fornecedorCliente}</td>
                      <td>{despesa.numeroDocumento}</td>
                      <td>{despesa.tipoConta}</td>
                      <td>{despesa.tipoDocumento}</td>
                      <td>{formatDateBR(despesa.dataEmissao)}</td>
                      <td>{formatDateBR(despesa.dataVencimento)}</td>
                      <td>{formatCurrency(despesa.valorTotalDocumento)}</td>
                      <td>{despesa.complemento}</td>
                      <td>{despesa.observacoesAprovacao}</td>
                      <td>{despesa.categoria}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="medicao-section">
              <h2>Impostos</h2>
              <table>
                <thead>
                  <tr>
                    <th>N Doc</th>
                    <th>Data</th>
                    <th>Valor do Imposto</th>
                  </tr>
                </thead>
                <tbody>
                  {modalCalculations.impostos.length === 0 ? (
                    <tr><td colSpan={3}>Nenhum imposto calculado</td></tr>
                  ) : modalCalculations.impostos.map((imposto: any) => (
                    <tr key={imposto.id}>
                      <td>{imposto.numeroDocumento}</td>
                      <td>{formatDateBR(imposto.data)}</td>
                      <td>{formatCurrency(imposto.valorImposto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="medicao-section">
              <h2>Custos</h2>
              <table>
                <thead>
                  <tr>
                    <th>N Doc</th>
                    <th>Data</th>
                    <th>Valor Total</th>
                    <th>Situacao</th>
                    <th>Complemento</th>
                  </tr>
                </thead>
                <tbody>
                  {modalCustos.length === 0 ? (
                    <tr><td colSpan={5}>Nenhum custo sincronizado pelo CRTI</td></tr>
                  ) : modalCustos.map((custo: any) => (
                    <tr key={custo.id}>
                      <td>{custo.numeroDocumento}</td>
                      <td>{formatDateBR(custo.dataEmissao)}</td>
                      <td>{formatCurrency(custo.valorTotal)}</td>
                      <td>{custo.situacao}</td>
                      <td>{custo.complemento}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="medicao-signature">
              <img src={assinaturaDiretor} alt="Assinatura do diretor" />
              <div>Diretoria Minasfalto</div>
            </section>
            <p className="medicao-print-note">Documento gerado pelo Sistema Integrado Minasfalto.</p>
          </main>
        </section>
      ) : null}

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
        {activeTab === "tabela" ? (
          <button
            type="button"
            className="cost-export-excel"
            onClick={handleExportarDespesasExcel}
            disabled={exportarDespesasExcel.isPending}
            title="Exportar Excel respeitando o filtro atual"
          >
            <FileSpreadsheet size={13} />
            {exportarDespesasExcel.isPending ? "EXPORTANDO..." : "EXPORTAR EXCEL"}
          </button>
        ) : null}
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
                <SelectItem value="Concluido">Concluído</SelectItem>
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
                            setReceitaGroupOpen(false);
                            setCustosGroupOpen(false);
                            setImpostosGroupOpen(false);
                            setDespesasGroupOpen(false);
                            setReceitaGroupSearch("");
                            setCustosGroupSearch("");
                            setDespesasGroupSearch("");
                            setImpostosGroupSearch("");
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
                          <td className={`num ${isNegativeAmount(pedido.saldo) ? "negative-amount" : ""}`}>
                            {formatCurrency(pedido.saldo)}
                          </td>
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
            <Select
              value={effectiveTipoContaFilter}
              onValueChange={(value) => {
                setSomentePagarNaoVinculados(false);
                setTipoContaFilter(value);
              }}
            >
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

            <button
              className={`desktop-filter-flag ${somentePagarNaoVinculados ? "active" : ""}`}
              onClick={() => setSomentePagarNaoVinculados((current) => !current)}
              type="button"
              title="Filtrar contas a pagar sem vinculo"
            >
              <Flag size={13} /> Filtrar sem Vinculo
            </button>

            <button
              className="desktop-refresh"
              onClick={() => vincularSaidasAutomaticas.mutate()}
              disabled={vincularSaidasAutomaticas.isPending}
            >
              <Link2 size={13} /> {vincularSaidasAutomaticas.isPending ? "Vinculando..." : "Vinculo automatico"}
            </button>

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
                    <th>Vinculado</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingDespesas ? (
                    <tr>
                      <td colSpan={11} className="desktop-empty">Carregando despesas...</td>
                    </tr>
                  ) : despesasError ? (
                    <tr>
                      <td colSpan={11} className="desktop-empty">
                        Erro ao carregar despesas: {despesasError.message}
                      </td>
                    </tr>
                  ) : despesas.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="desktop-empty">Nenhuma despesa encontrada</td>
                    </tr>
                  ) : (
                    despesas.map((despesa: any) => (
                      <tr key={despesa.id}>
                        <td>{despesa.codigoFornecedorCliente}</td>
                        <td className="desktop-client">{despesa.fornecedorCliente}</td>
                        <td>{despesa.numeroDocumento}</td>
                        <td>{despesa.tipoConta}</td>
                        <td>{despesa.tipoDocumento}</td>
                        <td>{formatDateBR(despesa.dataEmissao)}</td>
                        <td>{formatDateBR(despesa.dataVencimento)}</td>
                        <td className="num">{formatCurrency(despesa.valorTotalDocumento)}</td>
                        <td className="expense-complement" title={despesa.complemento || ""}>{despesa.complemento}</td>
                        <td>{despesa.observacoesAprovacao}</td>
                        <td className="linked-order-code">{despesa.vinculado}</td>
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

      <Dialog open={Boolean(modalPedido)} onOpenChange={(open) => {
        if (!open) {
          setReceitaGroupOpen(false);
          setCustosGroupOpen(false);
          setImpostosGroupOpen(false);
          setDespesasGroupOpen(false);
          setReceitaGroupSearch("");
          setCustosGroupSearch("");
          setDespesasGroupSearch("");
          setImpostosGroupSearch("");
          setModalPedido(null);
        }
      }}>
        <DialogContent className="cost-detail-dialog">
          <DialogHeader>
            <img src={minasfaltoLogo} alt="Minasfalto" className="cost-detail-logo" />
            <div className="cost-detail-heading">
              <DialogTitle>Pedido {modalPedido?.pedido}</DialogTitle>
              <DialogDescription>{modalPedido?.cliente}</DialogDescription>
            </div>
            <div className="cost-detail-header-actions">
              <button
                type="button"
                onClick={handleExportMedicaoPdf}
                disabled={isLoadingModal}
                title="Extrair medicao em PDF"
              >
                <FileText size={14} />
                PDF Medicao
              </button>
            </div>
          </DialogHeader>
          <section className="cost-detail-workspace" aria-label="Area de trabalho do pedido">
            {isLoadingModal ? (
              <div className="cost-detail-loading">Carregando dados do pedido...</div>
            ) : (
              <>
                <section className={`cost-expense-group cost-revenue-group ${receitaGroupOpen ? "expanded" : "collapsed"}`}>
                  <div className="cost-expense-group-gutter">
                    <button
                      type="button"
                      className="cost-group-toggle"
                      onClick={() => setReceitaGroupOpen((current) => !current)}
                      aria-expanded={receitaGroupOpen}
                      title={receitaGroupOpen ? "Recolher receita" : "Expandir receita"}
                    >
                      {receitaGroupOpen ? "-" : "+"}
                    </button>
                  </div>
                  <div className="cost-expense-group-main">
                    <button
                      type="button"
                      className="cost-group-title"
                      onClick={() => setReceitaGroupOpen((current) => !current)}
                      aria-expanded={receitaGroupOpen}
                    >
                      <span>Receita</span>
                      <strong>{formatCurrency(modalCalculations.receita)}</strong>
                    </button>
                    {receitaGroupOpen ? (
                      <>
                        <div className="cost-modal-actions">
                          <button type="button" onClick={openNewManualRevenue}>
                            <Plus size={14} />
                            Cadastrar receitas
                          </button>
                          <label className="cost-group-search">
                            <Search size={14} />
                            <span>Buscar:</span>
                            <Input
                              value={receitaGroupSearch}
                              onChange={(event) => setReceitaGroupSearch(event.target.value)}
                            />
                          </label>
                        </div>

                        <div className="modal-table-frame revenue-table-frame">
                          <table className="desktop-table modal-revenues-table">
                            <thead>
                              <tr>
                                <th>N Doc</th>
                                <th>Status</th>
                                <th>Data</th>
                                <th>Valor</th>
                                <th>Descricao</th>
                                <th>Acoes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {modalReceitas.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="desktop-empty">Nenhuma receita cadastrada</td>
                                </tr>
                              ) : filteredModalReceitas.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="desktop-empty">Nenhuma receita encontrada para a busca</td>
                                </tr>
                              ) : (
                                filteredModalReceitas.map((receita: any) => (
                                  <tr key={receita.id}>
                                    <td>{receita.numeroDocumento}</td>
                                    <td>{receita.status}</td>
                                    <td>{formatDateBR(receita.data)}</td>
                                    <td className="num">{formatCurrency(receita.valor)}</td>
                                    <td className="expense-complement" title={receita.descricao || ""}>{receita.descricao}</td>
                                    <td>
                                      <button
                                        type="button"
                                        className="table-icon-button"
                                        onClick={() => openEditManualRevenue(receita)}
                                        title="Editar"
                                      >
                                        <Pencil size={15} />
                                      </button>
                                      <button
                                        type="button"
                                        className="table-icon-button danger"
                                        onClick={() => deleteReceita.mutate({ id: receita.id, pedidoObraId: modalPedido.id })}
                                        title="Excluir"
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
                      </>
                    ) : null}
                  </div>
                </section>

                <section className={`cost-expense-group ${despesasGroupOpen ? "expanded" : "collapsed"}`}>
                  <div className="cost-expense-group-gutter">
                    <button
                      type="button"
                      className="cost-group-toggle"
                      onClick={() => setDespesasGroupOpen((current) => !current)}
                      aria-expanded={despesasGroupOpen}
                      title={despesasGroupOpen ? "Recolher despesas" : "Expandir despesas"}
                    >
                      {despesasGroupOpen ? "-" : "+"}
                    </button>
                  </div>
                  <div className="cost-expense-group-main">
                    <button
                      type="button"
                      className="cost-group-title"
                      onClick={() => setDespesasGroupOpen((current) => !current)}
                      aria-expanded={despesasGroupOpen}
                    >
                      <span>Despesas</span>
                      <strong>{formatCurrency(modalCalculations.totalDespesas)}</strong>
                    </button>
                    {despesasGroupOpen ? (
                      <>
                        <div className="cost-modal-actions">
                          <button
                            type="button"
                            onClick={openNewManualExpense}
                          >
                            <Plus size={14} />
                            Cadastrar despesa
                          </button>
                          <button type="button" onClick={() => setLinkModalOpen(true)}>
                            <Link2 size={14} />
                            Vincular saida
                          </button>
                          <label className="cost-group-search">
                            <Search size={14} />
                            <span>Buscar:</span>
                            <Input
                              value={despesasGroupSearch}
                              onChange={(event) => setDespesasGroupSearch(event.target.value)}
                            />
                          </label>
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
                              ) : filteredModalDespesas.length === 0 ? (
                                <tr>
                                  <td colSpan={12} className="desktop-empty">Nenhuma despesa encontrada para a busca</td>
                                </tr>
                              ) : (
                                filteredModalDespesas.map((despesa: any) => (
                                  <tr key={despesa.id}>
                                    <td>{despesa.codigoFornecedorCliente}</td>
                                    <td className="desktop-client">{despesa.fornecedorCliente}</td>
                                    <td>{despesa.numeroDocumento}</td>
                                    <td>{despesa.tipoConta}</td>
                                    <td>{despesa.tipoDocumento}</td>
                                    <td>{formatDateBR(despesa.dataEmissao)}</td>
                                    <td>{formatDateBR(despesa.dataVencimento)}</td>
                                    <td className="num">{formatCurrency(despesa.valorTotalDocumento)}</td>
                                    <td className="expense-complement" title={despesa.complemento || ""}>{despesa.complemento}</td>
                                    <td>{despesa.observacoesAprovacao}</td>
                                    <td>{despesa.categoria}</td>
                                    <td>
                                      <button
                                        type="button"
                                        className="table-icon-button"
                                        onClick={() => openEditManualExpense(despesa)}
                                        title="Editar"
                                      >
                                        <Pencil size={15} />
                                      </button>
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
                      </>
                    ) : null}
                  </div>
                </section>

                <section className={`cost-expense-group cost-tax-group ${impostosGroupOpen ? "expanded" : "collapsed"}`}>
                  <div className="cost-expense-group-gutter">
                    <button
                      type="button"
                      className="cost-group-toggle"
                      onClick={() => setImpostosGroupOpen((current) => !current)}
                      aria-expanded={impostosGroupOpen}
                      title={impostosGroupOpen ? "Recolher impostos" : "Expandir impostos"}
                    >
                      {impostosGroupOpen ? "-" : "+"}
                    </button>
                  </div>
                  <div className="cost-expense-group-main">
                    <button
                      type="button"
                      className="cost-group-title"
                      onClick={() => setImpostosGroupOpen((current) => !current)}
                      aria-expanded={impostosGroupOpen}
                    >
                      <span>Impostos</span>
                      <strong>{formatCurrency(modalCalculations.valorPorcentagemImposto)}</strong>
                    </button>
                    {impostosGroupOpen ? (
                      <>
                        <div className="cost-modal-actions cost-tax-actions">
                          <label className="cost-tax-percent-field">
                            <span>Porcentagem Imposto %</span>
                            <Input
                              value={financeForm.porcentagemImposto}
                              onChange={(event) => updateFinanceField("porcentagemImposto", event.target.value)}
                            />
                          </label>
                          <button type="button" onClick={handleSaveFinanceiro} disabled={saveFinanceiro.isPending}>
                            <Save size={14} />
                            {saveFinanceiro.isPending ? "Salvando..." : "Salvar campos"}
                          </button>
                          <label className="cost-group-search">
                            <Search size={14} />
                            <span>Buscar:</span>
                            <Input
                              value={impostosGroupSearch}
                              onChange={(event) => setImpostosGroupSearch(event.target.value)}
                            />
                          </label>
                        </div>

                        <div className="modal-table-frame tax-table-frame">
                          <table className="desktop-table modal-tax-table">
                            <thead>
                              <tr>
                                <th>N do doc</th>
                                <th>Data</th>
                                <th>Valor do Imposto</th>
                              </tr>
                            </thead>
                            <tbody>
                              {modalCalculations.impostos.length === 0 ? (
                                <tr>
                                  <td colSpan={3} className="desktop-empty">Nenhuma Nfe cadastrada em receitas</td>
                                </tr>
                              ) : filteredModalImpostos.length === 0 ? (
                                <tr>
                                  <td colSpan={3} className="desktop-empty">Nenhum imposto encontrado para a busca</td>
                                </tr>
                              ) : (
                                filteredModalImpostos.map((imposto: any) => (
                                  <tr key={imposto.id}>
                                    <td>{imposto.numeroDocumento}</td>
                                    <td>{formatDateBR(imposto.data)}</td>
                                    <td className="num">{formatCurrency(imposto.valorImposto)}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : null}
                  </div>
                </section>

                <section className={`cost-expense-group cost-values-group ${custosGroupOpen ? "expanded" : "collapsed"}`}>
                  <div className="cost-expense-group-gutter">
                    <button
                      type="button"
                      className="cost-group-toggle"
                      onClick={() => setCustosGroupOpen((current) => !current)}
                      aria-expanded={custosGroupOpen}
                      title={custosGroupOpen ? "Recolher custos" : "Expandir custos"}
                    >
                      {custosGroupOpen ? "-" : "+"}
                    </button>
                  </div>
                  <div className="cost-expense-group-main">
                    <button
                      type="button"
                      className="cost-group-title"
                      onClick={() => setCustosGroupOpen((current) => !current)}
                      aria-expanded={custosGroupOpen}
                    >
                      <span>Custos</span>
                      <strong>{formatCurrency(modalCalculations.totalCustos)}</strong>
                    </button>
                    {custosGroupOpen ? (
                      <>
                        <div className="cost-modal-actions">
                          <label className="cost-group-search">
                            <Search size={14} />
                            <span>Buscar:</span>
                            <Input
                              value={custosGroupSearch}
                              onChange={(event) => setCustosGroupSearch(event.target.value)}
                            />
                          </label>
                        </div>

                        <div className="modal-table-frame">
                          <table className="desktop-table modal-costs-table">
                            <thead>
                              <tr>
                                <th>N do doc</th>
                                <th>Data</th>
                                <th>Valor Total</th>
                                <th>Situacao</th>
                                <th>Complemento</th>
                              </tr>
                            </thead>
                            <tbody>
                              {modalCustos.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="desktop-empty">Nenhum custo sincronizado pelo CRTI</td>
                                </tr>
                              ) : filteredModalCustos.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="desktop-empty">Nenhum custo encontrado para a busca</td>
                                </tr>
                              ) : (
                                filteredModalCustos.map((custo: any) => (
                                  <tr key={custo.id}>
                                    <td>{custo.numeroDocumento}</td>
                                    <td>{formatDateBR(custo.dataEmissao)}</td>
                                    <td className="num">{formatCurrency(custo.valorTotal)}</td>
                                    <td>{custo.situacao}</td>
                                    <td className="expense-complement" title={custo.complemento || ""}>{custo.complemento}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : null}
                  </div>
                </section>

                <footer className="cost-modal-summary">
                  <span>Receita: <b>{formatCurrency(modalCalculations.receita)}</b></span>
                  <span>Imposto: <b>{formatCurrency(modalCalculations.valorPorcentagemImposto)}</b></span>
                  <span>Despesas: <b>{formatCurrency(modalCalculations.totalDespesas)}</b></span>
                  <span>Custos: <b>{formatCurrency(modalCalculations.totalCustos)}</b></span>
                  <strong className={modalCalculations.saldo < 0 ? "negative-amount" : ""}>
                    Saldo: {formatCurrency(modalCalculations.saldo)}
                  </strong>
                </footer>
              </>
            )}
          </section>
        </DialogContent>
      </Dialog>

      <Dialog open={manualRevenueModalOpen} onOpenChange={(open) => {
        setManualRevenueModalOpen(open);
        if (!open) resetManualRevenueForm();
      }}>
        <DialogContent className="manual-expense-dialog manual-revenue-dialog">
          <DialogHeader>
            <DialogTitle>{manualRevenue.id ? "Editar receita" : "Cadastrar receita"}</DialogTitle>
            <DialogDescription>Pedido {modalPedido?.pedido}</DialogDescription>
          </DialogHeader>

          <section className="manual-expense-form manual-revenue-form">
            <label>
              <span>N Doc</span>
              <Input
                type="number"
                value={manualRevenue.numeroDocumento}
                onChange={(event) => setManualRevenue((current) => ({ ...current, numeroDocumento: event.target.value }))}
              />
            </label>
            <label>
              <span>Status</span>
              <Select
                value={manualRevenue.status}
                onValueChange={(value) => setManualRevenue((current) => ({ ...current, status: value as RevenueStatus }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Nfe">Nfe</SelectItem>
                  <SelectItem value="Faturamento Direto">Faturamento Direto</SelectItem>
                  <SelectItem value="Outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label>
              <span>Data</span>
              <Input
                type="date"
                value={manualRevenue.data}
                onChange={(event) => setManualRevenue((current) => ({ ...current, data: event.target.value }))}
              />
            </label>
            <label>
              <span>Valor</span>
              <div className="money-input-wrap">
                <span>R$</span>
                <Input
                  value={manualRevenue.valor}
                  onChange={(event) => setManualRevenue((current) => ({ ...current, valor: event.target.value }))}
                />
              </div>
            </label>
            <label className="span-2">
              <span>Descricao</span>
              <Input
                value={manualRevenue.descricao}
                onChange={(event) => setManualRevenue((current) => ({ ...current, descricao: event.target.value }))}
              />
            </label>
          </section>

          <footer className="manual-expense-actions">
            <button type="button" onClick={() => setManualRevenueModalOpen(false)}>Cancelar</button>
            <button
              type="button"
              onClick={handleSaveReceita}
              disabled={createReceita.isPending || updateReceita.isPending}
            >
              <Save size={14} />
              Salvar
            </button>
          </footer>
        </DialogContent>
      </Dialog>

      <Dialog open={manualExpenseModalOpen} onOpenChange={(open) => {
        setManualExpenseModalOpen(open);
        if (!open) resetManualExpenseForm();
      }}>
        <DialogContent className="manual-expense-dialog">
          <DialogHeader>
            <DialogTitle>{manualExpense.id ? "Editar despesa" : "Cadastrar despesa"}</DialogTitle>
            <DialogDescription>Pedido {modalPedido?.pedido}</DialogDescription>
          </DialogHeader>

          <section className="manual-expense-form">
            <label>
              <span>Centro de custo</span>
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
              <span>Codigo Forn./Cliente</span>
              <Input
                value={manualExpense.codigoFornecedorCliente}
                onChange={(event) => setManualExpense((current) => ({ ...current, codigoFornecedorCliente: event.target.value }))}
              />
            </label>
            <label className="span-2">
              <span>Fornecedor/Cliente</span>
              <Input
                value={manualExpense.fornecedorCliente}
                onChange={(event) => setManualExpense((current) => ({ ...current, fornecedorCliente: event.target.value }))}
              />
            </label>
            <label>
              <span>Numero Documento</span>
              <Input
                value={manualExpense.numeroDocumento}
                onChange={(event) => setManualExpense((current) => ({ ...current, numeroDocumento: event.target.value }))}
              />
            </label>
            <label>
              <span>Tipo Conta</span>
              <Input
                value={manualExpense.tipoConta}
                onChange={(event) => setManualExpense((current) => ({ ...current, tipoConta: event.target.value }))}
              />
            </label>
            <label>
              <span>Tipo Documento</span>
              <Input
                value={manualExpense.tipoDocumento}
                onChange={(event) => setManualExpense((current) => ({ ...current, tipoDocumento: event.target.value }))}
              />
            </label>
            <label>
              <span>Data Emissao</span>
              <Input
                value={manualExpense.dataEmissao}
                onChange={(event) => setManualExpense((current) => ({ ...current, dataEmissao: event.target.value }))}
              />
            </label>
            <label>
              <span>Data Vencimento</span>
              <Input
                value={manualExpense.dataVencimento}
                onChange={(event) => setManualExpense((current) => ({ ...current, dataVencimento: event.target.value }))}
              />
            </label>
            <label>
              <span>Valor Total</span>
              <div className="money-input-wrap">
                <span>R$</span>
                <Input
                  value={manualExpense.valorTotalDocumento}
                  onChange={(event) => setManualExpense((current) => ({ ...current, valorTotalDocumento: event.target.value }))}
                />
              </div>
            </label>
            <label className="span-2">
              <span>Complemento</span>
              <Input
                value={manualExpense.complemento}
                onChange={(event) => setManualExpense((current) => ({ ...current, complemento: event.target.value }))}
              />
            </label>
            <label className="span-2">
              <span>Observacoes (Aprovacao)</span>
              <Input
                value={manualExpense.observacoesAprovacao}
                onChange={(event) => setManualExpense((current) => ({ ...current, observacoesAprovacao: event.target.value }))}
              />
            </label>
            {manualExpense.categoria === "Outros" && (
              <label className="span-2">
                <span>Justificativa Outros</span>
                <Input
                  value={manualExpense.justificativaOutros}
                  onChange={(event) => setManualExpense((current) => ({ ...current, justificativaOutros: event.target.value }))}
                />
              </label>
            )}
          </section>

          <footer className="manual-expense-actions">
            <button type="button" onClick={() => setManualExpenseModalOpen(false)}>
              Cancelar
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
              disabled={createDespesaManual.isPending || updateDespesa.isPending}
            >
              <Save size={14} />
              {createDespesaManual.isPending || updateDespesa.isPending ? "Salvando..." : "Salvar"}
            </button>
          </footer>
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
                      <td>{formatDateBR(despesa.dataEmissao)}</td>
                      <td>{formatDateBR(despesa.dataVencimento)}</td>
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
            pageSizeOptions={[25, 50, 100]}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
