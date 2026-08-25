import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRightLeft,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  FileText,
  PackageSearch,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc";
import minasfaltoLogo from "@/assets/minasfalto-logo.jpg";
import { toast } from "sonner";
import SapDoubleConfirmDialog from "@/components/SapDoubleConfirmDialog";
import "./compras.css";

const STATUS: any = {
  EM_COTACAO: "Em cotação",
  AGUARDANDO_DEFINICAO: "Aguardando definição",
  COMPRADO: "Comprado",
  CANCELADO: "Cancelado",
};
const emptyItem = () => ({
  descricao: "",
  materialId: null as number | null,
  quantidade: 1,
  unidade: "UN",
  ofertas: [] as any[],
});
const emptyForm = () => ({
  numero: "",
  titulo: "",
  objetoCotacaoId: null as number | null,
  veiculoEquipamentoId: null as number | null,
  dataOrcamento: new Date().toISOString().slice(0, 10),
  status: "EM_COTACAO",
  observacoes: "",
  prazoEntregaPadrao: "",
  fornecedorEscolhidoId: null as number | null,
  valorCotado: 0,
  valorNegociado: 0,
  valorPago: 0,
  itens: [emptyItem()],
});
const money = (v: any) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const escapeExcelValue = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const buildExcelWorkbook = (sheetName: string, rows: unknown[][]) => `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <Worksheet ss:Name="${escapeExcelValue(sheetName)}">
    <Table>
      ${rows
        .map(
          row => `<Row>${row
            .map(
              cell =>
                `<Cell><Data ss:Type="String">${escapeExcelValue(cell)}</Data></Cell>`
            )
            .join("")}</Row>`
        )
        .join("")}
    </Table>
  </Worksheet>
</Workbook>`;
const downloadExcel = (sheetName: string, filename: string, rows: unknown[][]) => {
  const content = buildExcelWorkbook(sheetName, rows);
  const url = URL.createObjectURL(
    new Blob([content], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const normalizeItemUnit = (value: unknown) =>
  ["LT", "L", "LITRO", "LITROS"].includes(
    String(value ?? "").trim().toLocaleUpperCase("pt-BR")
  )
    ? "LT"
    : "UN";

const normalizeTableSearch = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR");

const matchesTableSearch = (
  row: Record<string, unknown>,
  search: string,
  formattedValues: unknown[] = []
) => {
  const query = normalizeTableSearch(search).trim();
  if (!query) return true;
  return [...Object.values(row), ...formattedValues].some(value =>
    normalizeTableSearch(value).includes(query)
  );
};

type SearchOption = {
  value: string;
  label: string;
  detail?: string;
};

function useComprasPagination<T extends { id: number }>(
  rows: T[],
  resetKey: unknown,
  initialPageSize = 50
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize]
  );
  useEffect(() => {
    setPage(1);
    setSelectedId(null);
  }, [resetKey, pageSize]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  useEffect(() => {
    setSelectedId(null);
  }, [page]);
  return {
    page,
    pageSize,
    selectedId,
    totalPages,
    visibleRows,
    setPage,
    setPageSize,
    setSelectedId,
  };
}

function ComprasPagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(total, page * pageSize);
  const goToPage = (nextPage: number) =>
    onPageChange(Math.min(Math.max(1, nextPage), totalPages));
  return (
    <div className="compras-pagination" aria-label="Paginação">
      <span>{firstItem}-{lastItem} de {total}</span>
      <select
        aria-label="Registros por página"
        value={pageSize}
        onChange={event => onPageSizeChange(Number(event.target.value))}
      >
        {[25, 50, 100, 200].map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      <button type="button" onClick={() => goToPage(1)} disabled={page <= 1} title="Primeira página">
        <ChevronsLeft size={15} />
      </button>
      <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1} title="Página anterior">
        <ChevronLeft size={15} />
      </button>
      <strong>Página {page} de {totalPages}</strong>
      <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= totalPages} title="Próxima página">
        <ChevronRight size={15} />
      </button>
      <button type="button" onClick={() => goToPage(totalPages)} disabled={page >= totalPages} title="Última página">
        <ChevronsRight size={15} />
      </button>
    </div>
  );
}

function handleComprasTableKeyDown<T extends { id: number }>(
  event: React.KeyboardEvent<HTMLDivElement>,
  options: {
    rows: T[];
    selectedId: number | null;
    setSelectedId: (id: number | null) => void;
    page: number;
    totalPages: number;
    setPage: (page: number) => void;
    onEnter?: (row: T) => void;
  }
) {
  if (event.shiftKey && event.key === "ArrowRight") {
    event.preventDefault();
    options.setPage(Math.min(options.page + 1, options.totalPages));
    return;
  }
  if (event.shiftKey && event.key === "ArrowLeft") {
    event.preventDefault();
    options.setPage(Math.max(options.page - 1, 1));
    return;
  }
  if (["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) {
    event.preventDefault();
    if (!options.rows.length) return;
    const currentIndex = options.rows.findIndex(row => Number(row.id) === Number(options.selectedId));
    const isForward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const nextIndex = currentIndex < 0
      ? isForward ? 0 : options.rows.length - 1
      : isForward
        ? Math.min(currentIndex + 1, options.rows.length - 1)
        : Math.max(currentIndex - 1, 0);
    options.setSelectedId(Number(options.rows[nextIndex].id));
    window.requestAnimationFrame(() => {
      (event.currentTarget.querySelector("tbody tr.selected") as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
    });
    return;
  }
  if (event.key === "Enter" && options.onEnter) {
    const selected = options.rows.find(row => Number(row.id) === Number(options.selectedId));
    if (selected) {
      event.preventDefault();
      options.onEnter(selected);
    }
  }
}

function CurrencyField({
  value,
  onChange,
  readOnly = false,
  className = "",
  ariaLabel,
  title,
  tabIndex,
}: {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  className?: string;
  ariaLabel?: string;
  title?: string;
  tabIndex?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const formattedValue = Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const parseCurrency = (input: string) => {
    const sanitized = input.replace(/[^\d,.-]/g, "");
    const normalized = sanitized.includes(",")
      ? sanitized.replaceAll(".", "").replace(",", ".")
      : sanitized;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };

  return (
    <div className={`compra-currency-field ${className}`.trim()} title={title}>
      <span aria-hidden="true">R$</span>
      <input
        type="text"
        inputMode="decimal"
        value={editing && !readOnly ? draft : formattedValue}
        readOnly={readOnly}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        onFocus={() => {
          if (readOnly) return;
          setDraft(String(Number(value || 0)).replace(".", ","));
          setEditing(true);
        }}
        onBlur={() => setEditing(false)}
        onChange={event => {
          setDraft(event.target.value);
          onChange?.(parseCurrency(event.target.value));
        }}
      />
    </div>
  );
}

function SearchableSelect({
  value,
  options,
  placeholder,
  searchPlaceholder = "Pesquisar...",
  onChange,
}: {
  value: string;
  options: SearchOption[];
  placeholder: string;
  searchPlaceholder?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find(option => option.value === value);
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = options.filter(option =>
    `${option.label} ${option.detail || ""}`
      .toLocaleLowerCase("pt-BR")
      .includes(normalizedSearch)
  );

  return (
    <div className={`compras-search-select${open ? " open" : ""}`}>
      <button
        type="button"
        className="compras-search-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen(current => !current);
          setSearch("");
        }}
      >
        <span className={selected ? "" : "placeholder"}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="compras-search-menu">
          <div className="compras-search-box">
            <Search size={14} />
            <input
              autoFocus
              value={search}
              placeholder={searchPlaceholder}
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Escape") setOpen(false);
              }}
            />
          </div>
          <div className="compras-search-options" role="listbox">
            {filtered.length ? (
              filtered.map(option => (
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={option.value === value ? "selected" : ""}
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <span>{option.label}</span>
                  {option.detail && <small>{option.detail}</small>}
                </button>
              ))
            ) : (
              <p>Nenhum resultado encontrado.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Compras() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.compras.painel.useQuery();
  const [tab, setTab] = useState<
    | "orcamentos"
    | "fornecedores"
    | "fornecedor_item"
    | "materiais"
    | "relatorios"
  >("orcamentos");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [auxModal, setAuxModal] = useState<"objeto" | "veiculo" | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const detail = trpc.compras.obterOrcamento.useQuery(
    { id: editingId || 1 },
    { enabled: Boolean(editingId && open) }
  );
  const refresh = () => utils.compras.painel.invalidate();
  const saveOptions = {
    onSuccess: async (result: { id: number }) => {
      await Promise.all([
        utils.compras.obterOrcamento.reset({ id: result.id }),
        utils.compras.painel.invalidate(),
      ]);
      toast.success("Orçamento salvo com sucesso.");
      setOpen(false);
      setEditingId(null);
    },
    onError: (e: any) => toast.error(e.message),
  };
  const createQuote = trpc.compras.criarOrcamento.useMutation(saveOptions);
  const updateQuote = trpc.compras.atualizarOrcamento.useMutation(saveOptions);
  const remove = trpc.compras.excluirOrcamento.useMutation({
    onSuccess: () => {
      toast.success("Orçamento excluído.");
      setDeleteTarget(null);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const [generatingMirrorId, setGeneratingMirrorId] = useState<number | null>(
    null
  );
  const mirrorPdf = trpc.compras.exportarEspelhoPdf.useMutation({
    onSuccess: result => {
      const bytes = Uint8Array.from(atob(result.base64), char =>
        char.charCodeAt(0)
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setGeneratingMirrorId(null);
      toast.success("Espelho da cotação gerado com sucesso.");
    },
    onError: error => {
      setGeneratingMirrorId(null);
      toast.error(error.message);
    },
  });
  useEffect(() => {
    if (!detail.data) return;
    const o: any = detail.data.orcamento;
    const offers: any[] = detail.data.ofertas as any[];
    const prazoEntregaPadrao =
      o.prazo_entrega_padrao ||
      offers.find(oferta => oferta.prazoEntrega)?.prazoEntrega ||
      "";
    setForm({
      numero: o.numero,
      titulo: o.titulo,
      objetoCotacaoId:
        o.objeto_cotacao_id ||
        (data?.objetosCotacao as any[] | undefined)?.find(
          item => item.nome === o.titulo
        )?.id ||
        null,
      veiculoEquipamentoId: o.veiculo_equipamento_id || null,
      dataOrcamento: String(o.data_orcamento).slice(0, 10),
      status: o.status,
      observacoes: o.observacoes || "",
      prazoEntregaPadrao,
      fornecedorEscolhidoId: o.fornecedor_escolhido_id || null,
      valorCotado: Number(o.valor_cotado || 0),
      valorNegociado: Number(o.valor_negociado || 0),
      valorPago: Number(o.valor_pago || 0),
      itens: (detail.data.itens as any[]).map(i => ({
        ...i,
        quantidade: Number(i.quantidade),
        unidade: normalizeItemUnit(i.unidade),
        ofertas: offers
          .filter(x => x.itemId === i.id)
          .map(x => ({
            ...x,
            valorUnitario: Number(x.valorUnitario),
            incluidoCalculo: x.incluidoCalculo !== false,
            prazoEntrega: x.prazoEntrega || prazoEntregaPadrao,
            condicaoPagamento: x.condicaoPagamento || "",
            selecionada: Boolean(x.selecionada),
          })),
      })),
    });
  }, [detail.data, data?.objetosCotacao]);
  const suggestedTotal = useMemo(
    () =>
      form.itens.reduce((sum, item) => {
        return (
          sum +
          item.ofertas.reduce(
            (itemTotal, oferta) =>
              oferta.incluidoCalculo === false
                ? itemTotal
                : itemTotal +
                  Number(oferta.valorUnitario || 0) *
                    Number(item.quantidade || 0),
            0
          )
        );
      }, 0),
    [form.itens]
  );
  const finalTotal = Math.max(
    0,
    suggestedTotal - Number(form.valorNegociado || 0)
  );
  const activeSuppliers = useMemo(
    () => ((data?.fornecedores as any[]) || []).filter(f => f.ativo),
    [data?.fornecedores]
  );
  const activeMaterials = useMemo(
    () => ((data?.materiais as any[]) || []).filter(m => m.ativo),
    [data?.materiais]
  );
  const activeQuoteObjects = useMemo(
    () => ((data?.objetosCotacao as any[]) || []).filter(item => item.ativo),
    [data?.objetosCotacao]
  );
  const activeVehicles = useMemo(
    () =>
      ((data?.veiculosEquipamentos as any[]) || []).filter(item => item.ativo),
    [data?.veiculosEquipamentos]
  );
  const filteredQuotes = useMemo(
    () =>
      ((data?.orcamentos || []) as any[]).filter(quote =>
        matchesTableSearch(quote, tableSearch, [
          STATUS[quote.status],
          money(quote.valorCotado),
          money(quote.valorNegociado),
          money(quote.valorPago),
          String(quote.dataOrcamento || "")
            .split("-")
            .reverse()
            .join("/"),
        ])
      ),
    [data?.orcamentos, tableSearch]
  );
  const filteredNoteSuppliers = useMemo(
    () =>
      ((data?.fornecedores || []) as any[]).filter(
        supplier =>
          supplier.ativo &&
          supplier.fornecedorNota &&
          matchesTableSearch(supplier, tableSearch)
      ),
    [data?.fornecedores, tableSearch]
  );
  const filteredItemSuppliers = useMemo(
    () =>
      ((data?.fornecedores || []) as any[]).filter(
        supplier =>
          supplier.ativo &&
          supplier.fornecedorItem &&
          matchesTableSearch(supplier, tableSearch)
      ),
    [data?.fornecedores, tableSearch]
  );
  const filteredMaterials = useMemo(
    () =>
      ((data?.materiais || []) as any[]).filter(
        material => material.ativo && matchesTableSearch(material, tableSearch)
      ),
    [data?.materiais, tableSearch]
  );
  const quotesPagination = useComprasPagination(
    filteredQuotes,
    `orcamentos:${tableSearch}`
  );
  const selectedItemSupplierIds = useMemo(
    () =>
      new Set(
        form.itens.flatMap(item =>
          item.ofertas
            .map(oferta => Number(oferta.fornecedorId))
            .filter(Boolean)
        )
      ),
    [form.itens]
  );
  const noteSupplierOptions = useMemo<SearchOption[]>(
    () => [
      { value: "", label: "Nenhum fornecedor definido" },
      ...activeSuppliers
        .filter(
          f =>
            Boolean(f.fornecedorNota) ||
            Number(f.id) === Number(form.fornecedorEscolhidoId)
        )
        .map(f => ({
          value: String(f.id),
          label: f.nome,
          detail: f.documento || f.email || undefined,
        })),
    ],
    [activeSuppliers, form.fornecedorEscolhidoId]
  );
  const itemSupplierOptions = useMemo<SearchOption[]>(
    () =>
      activeSuppliers
        .filter(
          f =>
            Boolean(f.fornecedorItem) ||
            selectedItemSupplierIds.has(Number(f.id))
        )
        .map(f => ({
          value: String(f.id),
          label: f.nome,
          detail: f.documento || f.email || undefined,
        })),
    [activeSuppliers, selectedItemSupplierIds]
  );
  const materialOptions = useMemo<SearchOption[]>(
    () =>
      activeMaterials.map(m => ({
        value: String(m.id),
        label: m.descricao,
        detail: [m.categoria, m.unidade].filter(Boolean).join(" • "),
      })),
    [activeMaterials]
  );
  const statusOptions = useMemo<SearchOption[]>(
    () =>
      Object.entries(STATUS).map(([value, label]) => ({
        value,
        label: String(label),
      })),
    []
  );
  const quoteObjectOptions = useMemo<SearchOption[]>(
    () =>
      activeQuoteObjects.map(item => ({
        value: String(item.id),
        label: item.nome,
      })),
    [activeQuoteObjects]
  );
  const vehicleOptions = useMemo<SearchOption[]>(
    () => [
      { value: "", label: "Nenhum veículo/equipamento definido" },
      ...activeVehicles.map(item => ({
        value: String(item.id),
        label: item.nome,
      })),
    ],
    [activeVehicles]
  );
  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  };
  const openEdit = (id: number) => {
    setForm(emptyForm());
    setEditingId(id);
    setOpen(true);
  };
  const submit = () => {
    if (
      !form.objetoCotacaoId ||
      form.itens.some(i => !i.materialId || !i.descricao.trim())
    )
      return toast.error(
        "Preencha o objeto da cotação e selecione o material de todos os itens."
      );

    if (
      form.itens.some(item =>
        item.ofertas.some(oferta => !Number(oferta.fornecedorId))
      )
    ) {
      return toast.error(
        "Selecione uma marca do produto em todas as propostas ou remova a proposta vazia."
      );
    }

    if (
      form.itens.some(item => {
        const ids = item.ofertas.map(oferta => Number(oferta.fornecedorId));
        return new Set(ids).size !== ids.length;
      })
    ) {
      return toast.error(
        "A mesma marca do produto não pode aparecer duas vezes no mesmo item."
      );
    }

    if (Number(form.valorNegociado || 0) > suggestedTotal) {
      return toast.error(
        "O valor do desconto não pode ser maior que o valor cotado."
      );
    }

    const upper = (value: unknown) =>
      String(value ?? "")
        .trim()
        .toLocaleUpperCase("pt-BR");
    const payload = {
      ...form,
      numero: form.numero ? upper(form.numero) : undefined,
      titulo: upper(form.titulo),
      observacoes: upper(form.observacoes),
      prazoEntregaPadrao: upper(form.prazoEntregaPadrao),
      valorCotado: suggestedTotal,
      valorPago: finalTotal,
      itens: form.itens.map(item => ({
        ...item,
        descricao: upper(item.descricao),
        unidade: upper(item.unidade),
        ofertas: item.ofertas.map(oferta => ({
          ...oferta,
          prazoEntrega: upper(oferta.prazoEntrega),
          condicaoPagamento: upper(oferta.condicaoPagamento),
        })),
      })),
    };
    editingId
      ? updateQuote.mutate({ ...payload, id: editingId } as any)
      : createQuote.mutate(payload as any);
  };
  const exportExcel = () => {
    const rows = [
      [
        "Número",
        "Data",
        "Título",
        "Veículo/Equipamento",
        "Status",
        "Fornecedor escolhido",
        "Valor cotado",
        "Valor do desconto",
        "Valor final",
      ],
      ...filteredQuotes.map(o => [
        o.numero,
        String(o.dataOrcamento || "").split("-").reverse().join("/"),
        o.titulo,
        o.veiculoEquipamento || "",
        STATUS[o.status],
        o.fornecedorEscolhido || "",
        money(o.valorCotado),
        money(o.valorNegociado),
        money(o.valorPago),
      ]),
    ];
    downloadExcel(
      "Cotações",
      `controle-cotacao-${new Date().toISOString().slice(0, 10)}.xls`,
      rows
    );
    toast.success(`${filteredQuotes.length} cotação(ões) exportada(s).`);
  };
  return (
    <main className="compras-page">
      <header>
        <div>
          <ShoppingCart />
          <h1>
            CONTROLE DE COTAÇÃO
            <small>Cotações, comparativos e histórico de aquisições</small>
          </h1>
        </div>
        <button onClick={() => navigate("/")}>← Voltar</button>
      </header>
      <nav>
        {[
          ["orcamentos", "Orçamentos", BarChart3],
          ["fornecedores", "Fornecedores", Users],
          ["fornecedor_item", "Marca do Produto", Users],
          ["materiais", "Materiais", PackageSearch],
          ["relatorios", "Relatórios", BarChart3],
        ].map(([key, label, Icon]: any) => (
          <button
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
            key={key}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
        <label className="compras-global-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={tableSearch}
            onChange={event => setTableSearch(event.target.value)}
            placeholder="Pesquisar em todos os campos..."
            aria-label="Pesquisar em todos os campos da tabela atual"
          />
        </label>
      </nav>
      {tab === "orcamentos" && (
        <section>
          <div className="compras-toolbar">
            <button className="primary" onClick={openNew}>
              <Plus size={16} />
              Novo orçamento
            </button>
            <button onClick={() => setAuxModal("veiculo")}>
              <Plus size={16} />
              Cadastrar Veículos/Equipamentos
            </button>
            <button onClick={() => setAuxModal("objeto")}>
              <Plus size={16} />
              Cadastrar Objeto da Cotação
            </button>
            <button onClick={exportExcel}>
              <Download size={16} />
              Excel
            </button>
          </div>
          <div className="compras-cards">
            <article>
              <span>Orçamentos</span>
              <b>{filteredQuotes.length}</b>
            </article>
            <article>
              <span>Valor cotado</span>
              <b>
                {money(
                  filteredQuotes.reduce(
                    (s, o) => s + Number(o.valorCotado || 0),
                    0
                  )
                )}
              </b>
            </article>
            <article>
              <span>Valor final</span>
              <b>
                {money(
                  filteredQuotes.reduce(
                    (s, o) => s + Number(o.valorPago || 0),
                    0
                  )
                )}
              </b>
            </article>
          </div>
          <div
            className="compras-table compras-keyboard-table"
            tabIndex={0}
            role="grid"
            aria-label="Orçamentos"
            onKeyDown={event =>
              handleComprasTableKeyDown(event, {
                rows: quotesPagination.visibleRows,
                selectedId: quotesPagination.selectedId,
                setSelectedId: quotesPagination.setSelectedId,
                page: quotesPagination.page,
                totalPages: quotesPagination.totalPages,
                setPage: quotesPagination.setPage,
                onEnter: row => openEdit(row.id),
              })
            }
          >
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Data</th>
                  <th>Objeto da cotação</th>
                  <th>Veículo/Equipamento</th>
                  <th>Status</th>
                  <th>Itens</th>
                  <th>Fornecedor escolhido</th>
                  <th>Cotado</th>
                  <th>Valor do desconto</th>
                  <th>Valor final</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={11}>Carregando...</td>
                  </tr>
                ) : filteredQuotes.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="compras-empty">
                      {tableSearch
                        ? "Nenhum orçamento encontrado para a pesquisa informada."
                        : "Nenhum orçamento cadastrado."}
                    </td>
                  </tr>
                ) : (
                  quotesPagination.visibleRows.map(o => (
                    <tr
                      key={o.id}
                      className={quotesPagination.selectedId === Number(o.id) ? "selected" : ""}
                      onClick={() => quotesPagination.setSelectedId(Number(o.id))}
                      onDoubleClick={() => openEdit(Number(o.id))}
                    >
                      <td>{o.numero}</td>
                      <td>
                        {String(o.dataOrcamento).split("-").reverse().join("/")}
                      </td>
                      <td>{o.titulo}</td>
                      <td>{o.veiculoEquipamento || "—"}</td>
                      <td>
                        <span className={`status ${o.status}`}>
                          {STATUS[o.status]}
                        </span>
                      </td>
                      <td>{o.itens}</td>
                      <td>{o.fornecedorEscolhido || "—"}</td>
                      <td>{money(o.valorCotado)}</td>
                      <td>{money(o.valorNegociado)}</td>
                      <td>{money(o.valorPago)}</td>
                      <td>
                        <button title="Editar" onClick={() => openEdit(o.id)}>
                          <Pencil size={15} />
                        </button>
                        <button
                          title="Espelho Cotação"
                          aria-label={`Baixar espelho da cotação ${o.numero}`}
                          disabled={mirrorPdf.isPending}
                          onClick={() => {
                            setGeneratingMirrorId(Number(o.id));
                            mirrorPdf.mutate({ id: Number(o.id) });
                          }}
                        >
                          <FileText
                            size={15}
                            className={
                              generatingMirrorId === Number(o.id)
                                ? "compras-action-loading"
                                : undefined
                            }
                          />
                        </button>
                        <button
                          title="Excluir"
                          onClick={() => setDeleteTarget(o)}
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
          <ComprasPagination
            page={quotesPagination.page}
            pageSize={quotesPagination.pageSize}
            total={filteredQuotes.length}
            totalPages={quotesPagination.totalPages}
            onPageChange={quotesPagination.setPage}
            onPageSizeChange={quotesPagination.setPageSize}
          />
        </section>
      )}
      {tab === "fornecedores" && (
        <Cadastro
          tipo="fornecedor"
          categoriaFornecedor="NOTA"
          items={filteredNoteSuppliers}
          refresh={refresh}
          searchKey={tableSearch}
        />
      )}{" "}
      {tab === "fornecedor_item" && (
        <Cadastro
          tipo="fornecedor"
          categoriaFornecedor="ITEM"
          items={filteredItemSuppliers}
          refresh={refresh}
          searchKey={tableSearch}
        />
      )}{" "}
      {tab === "materiais" && (
        <Cadastro
          tipo="material"
          items={filteredMaterials}
          refresh={refresh}
          searchKey={tableSearch}
        />
      )}{" "}
      {tab === "relatorios" && (
        <RelatoriosCompras
          orcamentos={(data?.orcamentos || []) as any[]}
          fornecedores={activeSuppliers.filter(f => f.fornecedorNota)}
          objetos={activeQuoteObjects}
          veiculos={activeVehicles}
        />
      )}{" "}
      {open && (
        <div className="compras-overlay">
          <div className="compras-modal">
            <button className="close" onClick={() => setOpen(false)}>
              <X />
            </button>
            <div className="compras-modal-heading">
              <span className="compras-modal-kicker">Controle de Cotação</span>
              <h2>{editingId ? "Editar orçamento" : "Cadastrar orçamento"}</h2>
              <p>
                Registre a cotação, selecione os materiais cadastrados e compare
                as propostas recebidas.
              </p>
            </div>
            <h3 className="compras-section-title">Dados gerais</h3>
            <div className="form-grid compras-general-grid">
              <label>
                Número do orçamento
                <input
                  value={
                    editingId ? form.numero : "GERADO AUTOMATICAMENTE AO SALVAR"
                  }
                  readOnly
                  aria-readonly="true"
                />
              </label>
              <label>
                Data
                <input
                  type="date"
                  value={form.dataOrcamento}
                  onChange={e =>
                    setForm({ ...form, dataOrcamento: e.target.value })
                  }
                />
              </label>
              <label className="compras-object-field">
                Objeto da cotação
                <SearchableSelect
                  value={String(form.objetoCotacaoId || "")}
                  options={quoteObjectOptions}
                  placeholder="Selecione o objeto da cotação"
                  searchPlaceholder="Pesquisar objeto da cotação..."
                  onChange={value => {
                    const selected = activeQuoteObjects.find(
                      item => Number(item.id) === Number(value)
                    );
                    setForm({
                      ...form,
                      objetoCotacaoId: value ? Number(value) : null,
                      titulo: selected?.nome || "",
                    });
                  }}
                />
              </label>
              <label className="compras-vehicle-field">
                Veículo/Equipamento
                <SearchableSelect
                  value={String(form.veiculoEquipamentoId || "")}
                  options={vehicleOptions}
                  placeholder="Selecione o veículo/equipamento"
                  searchPlaceholder="Pesquisar veículo/equipamento..."
                  onChange={value =>
                    setForm({
                      ...form,
                      veiculoEquipamentoId: value ? Number(value) : null,
                    })
                  }
                />
              </label>
              <label>
                Status
                <SearchableSelect
                  value={form.status}
                  options={statusOptions}
                  placeholder="Selecione o status"
                  searchPlaceholder="Pesquisar status..."
                  onChange={status => setForm({ ...form, status })}
                />
              </label>
              <label>
                Fornecedor da nota
                <SearchableSelect
                  value={String(form.fornecedorEscolhidoId || "")}
                  options={noteSupplierOptions}
                  placeholder="Selecione o fornecedor"
                  searchPlaceholder="Pesquisar fornecedor..."
                  onChange={value =>
                    setForm({
                      ...form,
                      fornecedorEscolhidoId: value ? Number(value) : null,
                    })
                  }
                />
              </label>
              <label className="compras-deadline-field">
                Prazo de entrega padrão
                <input
                  value={form.prazoEntregaPadrao}
                  placeholder="EX.: 15 DIAS"
                  onChange={e => {
                    const prazoAnterior = form.prazoEntregaPadrao;
                    const prazoEntregaPadrao = e.target.value;
                    setForm({
                      ...form,
                      prazoEntregaPadrao,
                      itens: form.itens.map(item => ({
                        ...item,
                        ofertas: item.ofertas.map(oferta => ({
                          ...oferta,
                          prazoEntrega:
                            !oferta.prazoEntrega ||
                            oferta.prazoEntrega === prazoAnterior
                              ? prazoEntregaPadrao
                              : oferta.prazoEntrega,
                        })),
                      })),
                    });
                  }}
                />
              </label>
              {["valorCotado", "valorNegociado", "valorPago"].map(k => (
                <label key={k}>
                  {
                    (
                      {
                        valorCotado: "Valor cotado",
                        valorNegociado: "Valor do desconto",
                        valorPago: "Valor final",
                      } as any
                    )[k]
                  }
                  <CurrencyField
                    className={
                      k === "valorNegociado" ? "" : "compra-total-calculado"
                    }
                    readOnly={k !== "valorNegociado"}
                    value={
                      k === "valorCotado"
                        ? suggestedTotal
                        : k === "valorPago"
                          ? finalTotal
                          : form.valorNegociado
                    }
                    onChange={value =>
                      k === "valorNegociado" &&
                      setForm({ ...form, valorNegociado: value })
                    }
                  />
                </label>
              ))}
            </div>
            <h3 className="compras-section-title">
              Itens e propostas de marcas do produto
            </h3>
            <p className="compras-section-help">
              Selecione um material do cadastro, informe a quantidade e registre
              uma ou mais propostas para comparação.
            </p>
            {form.itens.map((item, idx) => (
              <div className="compra-item" key={idx}>
                <div className="compra-item-title">
                  <div className="compra-item-title-main">
                    <strong>Item {idx + 1}</strong>
                  </div>
                  <span>
                    Material cadastrado, quantidade e unidade de medida
                  </span>
                </div>
                <div>
                  <label className="compra-control compra-material-control">
                    <span>Material / serviço</span>
                    <SearchableSelect
                      value={String(item.materialId || "")}
                      options={materialOptions}
                      placeholder="Selecione um material cadastrado"
                      searchPlaceholder="Pesquisar material por nome ou categoria..."
                      onChange={value => {
                        const material = activeMaterials.find(
                          candidate => String(candidate.id) === value
                        );
                        if (!material) return;
                        const itens = [...form.itens];
                        itens[idx] = {
                          ...item,
                          materialId: Number(material.id),
                          descricao: material.descricao,
                          unidade: normalizeItemUnit(
                            material.unidade || item.unidade
                          ),
                        };
                        setForm({ ...form, itens });
                      }}
                    />
                  </label>
                  <label className="compra-control">
                    <span>Quantidade</span>
                    <input
                      aria-label={`Quantidade do item ${idx + 1}`}
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.quantidade}
                      onChange={e => {
                        const itens = [...form.itens];
                        itens[idx] = {
                          ...item,
                          quantidade: Number(e.target.value),
                        };
                        setForm({ ...form, itens });
                      }}
                    />
                  </label>
                  <label className="compra-control">
                    <span>Unidade</span>
                    <select
                      aria-label={`Unidade do item ${idx + 1}`}
                      value={item.unidade}
                      onChange={event => {
                        const itens = [...form.itens];
                        itens[idx] = {
                          ...item,
                          unidade: event.target.value,
                        };
                        setForm({ ...form, itens });
                      }}
                    >
                      <option value="UN">UN</option>
                      <option value="LT">LT - Litro</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="compra-remove-item"
                    title="Excluir item"
                    aria-label={`Excluir item ${idx + 1}`}
                    onClick={() =>
                      setForm({
                        ...form,
                        itens: form.itens.filter((_, i) => i !== idx),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {item.ofertas.length > 0 && (
                  <div className="compra-offer-heading">
                    <span>Incluir</span>
                    <span>Marca do produto</span>
                    <span>Valor unitário</span>
                    <span>Valor total</span>
                    <span>Prazo de entrega</span>
                    <span>Ação</span>
                  </div>
                )}
                {item.ofertas.map((oferta: any, oi: number) => (
                  <div className="oferta" key={oi}>
                    <label
                      className="compra-item-calculo-toggle compra-oferta-calculo-toggle"
                      title="Incluir esta proposta no valor cotado"
                    >
                      <input
                        type="checkbox"
                        checked={oferta.incluidoCalculo !== false}
                        aria-label={`Incluir proposta ${oi + 1} do item ${idx + 1} no valor cotado`}
                        onChange={event => {
                          const itens = [...form.itens];
                          item.ofertas[oi] = {
                            ...oferta,
                            incluidoCalculo: event.target.checked,
                          };
                          itens[idx] = { ...item };
                          setForm({ ...form, itens });
                        }}
                      />
                    </label>
                    <SearchableSelect
                      value={String(oferta.fornecedorId || "")}
                      options={itemSupplierOptions}
                      placeholder="Selecione a marca do produto"
                      searchPlaceholder="Pesquisar marca do produto..."
                      onChange={value => {
                        const itens = [...form.itens];
                        item.ofertas[oi] = {
                          ...oferta,
                          fornecedorId: Number(value),
                        };
                        itens[idx] = { ...item };
                        setForm({ ...form, itens });
                      }}
                    />
                    <CurrencyField
                      ariaLabel={`Valor unitário da proposta ${oi + 1} do item ${idx + 1}`}
                      value={oferta.valorUnitario}
                      onChange={value => {
                        const itens = [...form.itens];
                        item.ofertas[oi] = {
                          ...oferta,
                          valorUnitario: value,
                        };
                        itens[idx] = { ...item };
                        setForm({ ...form, itens });
                      }}
                    />
                    <CurrencyField
                      className="compra-oferta-total compra-total-calculado"
                      ariaLabel={`Valor total da proposta ${oi + 1} do item ${idx + 1}`}
                      title="Valor unitário multiplicado pela quantidade do item"
                      readOnly
                      tabIndex={-1}
                      value={Number(
                        (
                          Number(oferta.valorUnitario || 0) *
                          Number(item.quantidade || 0)
                        ).toFixed(2)
                      )}
                    />
                    <input
                      placeholder="Prazo"
                      value={oferta.prazoEntrega || ""}
                      onChange={e => {
                        const itens = [...form.itens];
                        item.ofertas[oi] = {
                          ...oferta,
                          prazoEntrega: e.target.value,
                        };
                        itens[idx] = { ...item };
                        setForm({ ...form, itens });
                      }}
                    />
                    <button
                      onClick={() => {
                        const itens = [...form.itens];
                        item.ofertas.splice(oi, 1);
                        itens[idx] = { ...item };
                        setForm({ ...form, itens });
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  disabled={itemSupplierOptions.length === 0}
                  title={
                    itemSupplierOptions.length > 0
                      ? "Adicionar proposta de marca"
                      : "Cadastre ou importe ao menos uma marca do produto"
                  }
                  onClick={() => {
                    const primeiroFornecedor = itemSupplierOptions[0];
                    if (!primeiroFornecedor) {
                      toast.error(
                        "Cadastre uma marca do produto antes de adicionar propostas."
                      );
                      return;
                    }
                    const itens = [...form.itens];
                    itens[idx] = {
                      ...item,
                      ofertas: [
                        ...item.ofertas,
                        {
                          fornecedorId: 0,
                          valorUnitario: 0,
                          prazoEntrega: form.prazoEntregaPadrao,
                          condicaoPagamento: "",
                          selecionada: false,
                          incluidoCalculo: true,
                        },
                      ],
                    };
                    setForm({ ...form, itens });
                  }}
                >
                  <Plus size={14} />
                  Adicionar proposta
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setForm({ ...form, itens: [...form.itens, emptyItem()] })
              }
            >
              <Plus size={15} />
              Adicionar item
            </button>
            <label className="observacoes">
              Observações
              <textarea
                value={form.observacoes}
                onChange={e =>
                  setForm({ ...form, observacoes: e.target.value })
                }
              />
            </label>
            <footer>
              <button onClick={() => setOpen(false)}>Cancelar</button>
              <button
                className="primary"
                onClick={submit}
                disabled={createQuote.isPending || updateQuote.isPending}
              >
                <Save size={16} />
                Salvar
              </button>
            </footer>
          </div>
        </div>
      )}
      {auxModal && (
        <CadastroAuxiliarModal
          tipo={auxModal}
          items={
            auxModal === "objeto"
              ? (data?.objetosCotacao as any[]) || []
              : (data?.veiculosEquipamentos as any[]) || []
          }
          refresh={refresh}
          onClose={() => setAuxModal(null)}
        />
      )}
      <SapDoubleConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={o => !o && setDeleteTarget(null)}
        title="Confirmar exclusão de orçamento"
        description="Confira o orçamento que será excluído."
        finalDescription="Confirma a exclusão definitiva? O histórico de auditoria será preservado."
        details={
          deleteTarget
            ? [
                { label: "Orçamento", value: deleteTarget.numero },
                { label: "Objeto", value: deleteTarget.titulo },
              ]
            : []
        }
        onConfirm={() =>
          remove.mutate({
            id: deleteTarget.id,
            motivo: "Exclusão confirmada em duas etapas",
          })
        }
        isPending={remove.isPending}
      />
    </main>
  );
}

function RelatoriosCompras({
  orcamentos,
  fornecedores,
  objetos,
  veiculos,
}: {
  orcamentos: any[];
  fornecedores: any[];
  objetos: any[];
  veiculos: any[];
}) {
  const vazio = {
    inicio: "",
    fim: "",
    objetoId: "",
    fornecedorId: "",
    veiculoId: "",
  };
  const [rascunho, setRascunho] = useState(vazio);
  const [filtros, setFiltros] = useState(vazio);
  const objetoOptions = useMemo<SearchOption[]>(
    () => [
      { value: "", label: "Todos" },
      ...objetos.map(item => ({ value: String(item.id), label: item.nome })),
    ],
    [objetos]
  );
  const fornecedorOptions = useMemo<SearchOption[]>(
    () => [
      { value: "", label: "Todos" },
      ...fornecedores.map(item => ({
        value: String(item.id),
        label: item.nome,
        detail: item.documento || item.email || undefined,
      })),
    ],
    [fornecedores]
  );
  const veiculoOptions = useMemo<SearchOption[]>(
    () => [
      { value: "", label: "Todos" },
      ...veiculos.map(item => ({ value: String(item.id), label: item.nome })),
    ],
    [veiculos]
  );

  const chaveData = (valor: unknown) => {
    if (!valor) return "";
    const texto = String(valor).trim();
    const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const brasil = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (brasil) return `${brasil[3]}-${brasil[2]}-${brasil[1]}`;
    const data = valor instanceof Date ? valor : new Date(texto);
    if (Number.isNaN(data.getTime())) return "";
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
  };

  const compararCronologicamente = (a: any, b: any) => {
    const porData = chaveData(a.dataOrcamento).localeCompare(chaveData(b.dataOrcamento));
    return porData || String(a.numero || "").localeCompare(String(b.numero || ""), "pt-BR", { numeric: true });
  };

  const formatarData = (valor: unknown) => {
    const data = chaveData(valor);
    return data ? data.split("-").reverse().join("/") : "—";
  };

  const registros = useMemo(() => {
    return orcamentos
      .filter(item => {
        const data = chaveData(item.dataOrcamento);
        return (
          (!filtros.inicio || data >= filtros.inicio) &&
          (!filtros.fim || data <= filtros.fim) &&
          (!filtros.objetoId ||
            Number(item.objetoCotacaoId) === Number(filtros.objetoId)) &&
          (!filtros.fornecedorId ||
            Number(item.fornecedorEscolhidoId) ===
              Number(filtros.fornecedorId)) &&
          (!filtros.veiculoId ||
            Number(item.veiculoEquipamentoId) === Number(filtros.veiculoId))
        );
      });
  }, [orcamentos, filtros]);

  const registrosOrdenados = useMemo(
    () => [...registros].sort(compararCronologicamente),
    [registros]
  );
  const reportPagination = useComprasPagination(
    registrosOrdenados,
    `relatorio:${JSON.stringify(filtros)}`
  );

  const totais = useMemo(
    () => ({
      itens: registros.reduce((s, item) => s + Number(item.itens || 0), 0),
      cotado: registros.reduce(
        (s, item) => s + Number(item.valorCotado || 0),
        0
      ),
      desconto: registros.reduce(
        (s, item) => s + Number(item.valorNegociado || 0),
        0
      ),
      final: registros.reduce((s, item) => s + Number(item.valorPago || 0), 0),
    }),
    [registros]
  );

  const evolucaoValorFinal = useMemo(
    () =>
      [...registrosOrdenados]
        .sort((a, b) => {
          const porData = chaveData(a.dataOrcamento).localeCompare(
            chaveData(b.dataOrcamento)
          );
          return porData || String(a.numero || "").localeCompare(String(b.numero || ""));
        })
        .map(item => {
          const data = chaveData(item.dataOrcamento);
          return {
            rotulo: `${data ? data.split("-").reverse().join("/") : "—"} · ${item.numero}`,
            numero: item.numero,
            data,
            objeto: item.titulo,
            valorFinal: Number(item.valorPago || 0),
          };
        }),
    [registrosOrdenados]
  );

  const porStatus = useMemo(() => {
    const mapa = new Map<string, number>();
    registros.forEach(item => {
      const nome = STATUS[item.status] || item.status || "Não informado";
      mapa.set(nome, (mapa.get(nome) || 0) + 1);
    });
    return Array.from(mapa.entries()).map(([nome, quantidade]) => ({
      nome,
      quantidade,
    }));
  }, [registros]);

  const aplicar = (event: React.FormEvent) => {
    event.preventDefault();
    if (rascunho.inicio && rascunho.fim && rascunho.inicio > rascunho.fim) {
      toast.error("A data inicial não pode ser posterior à data final.");
      return;
    }
    setFiltros({ ...rascunho });
  };

  const nomeSelecionado = (lista: any[], id: string, campo = "nome") =>
    lista.find(item => Number(item.id) === Number(id))?.[campo] || "Todos";
  const periodo = `${filtros.inicio ? filtros.inicio.split("-").reverse().join("/") : "Início"} a ${filtros.fim ? filtros.fim.split("-").reverse().join("/") : "Hoje"}`;
  const resumo = `Período: ${periodo} | Objeto: ${nomeSelecionado(objetos, filtros.objetoId)} | Fornecedor: ${nomeSelecionado(fornecedores, filtros.fornecedorId)} | Veículo/Equipamento: ${nomeSelecionado(veiculos, filtros.veiculoId)}`;

  const exportarExcel = () => {
    const linhas = [
      ["RELATÓRIO DE ORÇAMENTOS / CONTROLE DE COTAÇÃO"],
      [resumo],
      [],
      [
        "Número",
        "Data",
        "Objeto da cotação",
        "Veículo/Equipamento",
        "Fornecedor da nota",
        "Status",
        "Itens",
        "Valor cotado",
        "Valor do desconto",
        "Valor final",
      ],
      ...registrosOrdenados.map(item => [
        item.numero,
        formatarData(item.dataOrcamento),
        item.titulo,
        item.veiculoEquipamento || "",
        item.fornecedorEscolhido || "",
        STATUS[item.status] || item.status,
        item.itens,
        money(item.valorCotado),
        money(item.valorNegociado),
        money(item.valorPago),
      ]),
    ];
    downloadExcel(
      "Relatório de Cotações",
      `relatorio-controle-cotacao-${new Date().toISOString().slice(0, 10)}.xls`,
      linhas
    );
    toast.success(`${registrosOrdenados.length} cotação(ões) exportada(s).`);
  };

  const imprimir = () => {
    const escape = (valor: unknown) =>
      String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    const barras = evolucaoValorFinal
      .map(item => {
        const maximo = Math.max(
          ...evolucaoValorFinal.map(x => x.valorFinal),
          1
        );
        const largura = Math.max(2, (item.valorFinal / maximo) * 100);
        return `<div class="bar-row"><span>${escape(item.rotulo)}</span><div class="bar-track"><svg viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width="${largura}" height="14" fill="#2f668f" /></svg></div><b>${escape(money(item.valorFinal))}</b></div>`;
      })
      .join("");
    const linhas = registrosOrdenados
      .map(
        item =>
          `<tr><td>${escape(item.numero)}</td><td>${escape(
            formatarData(item.dataOrcamento)
          )}</td><td>${escape(item.titulo)}</td><td>${escape(item.veiculoEquipamento || "—")}</td><td>${escape(item.fornecedorEscolhido || "—")}</td><td>${escape(STATUS[item.status] || item.status)}</td><td>${escape(item.itens)}</td><td>${escape(money(item.valorCotado))}</td><td>${escape(money(item.valorNegociado))}</td><td>${escape(money(item.valorPago))}</td></tr>`
      )
      .join("");
    const janela = window.open("", "_blank");
    if (!janela)
      return toast.error("Permita pop-ups para gerar o PDF/Imprimir.");
    janela.document
      .write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de Controle de Cotação</title><style>
      @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:10px Arial,sans-serif;color:#071c32;margin:0;text-transform:uppercase;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}header{display:flex;align-items:center;gap:22px;border-bottom:2px solid #e4a100;padding:0 0 12px;margin-bottom:12px}header img{width:76px;height:52px;object-fit:contain}h1{font-size:22px;margin:0}h1 small{display:block;font-size:11px;color:#40566a;margin-top:5px}.filters{font-size:9px;color:#40566a;margin-bottom:12px}.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px}.metrics div{border:1px solid #9bb2c7;padding:9px}.metrics small{display:block;color:#536b81}.metrics strong{font-size:15px}.chart{border:1px solid #9bb2c7;padding:10px;margin-bottom:14px;break-inside:avoid}.chart h2{font-size:13px}.bar-row{display:grid;grid-template-columns:180px 1fr 95px;align-items:center;gap:8px;margin:7px 0}.bar-track{height:14px;background:#edf2f6;border:1px solid #bdcad5;overflow:hidden}.bar-track svg{display:block;width:100%;height:100%}.bar-row b{text-align:right}table{width:100%;border-collapse:collapse;font-size:8px}th{background:#dbe9f4}th,td{border:1px solid #abc0d2;padding:5px;text-align:left;vertical-align:top}tr{break-inside:avoid}footer{margin-top:12px;border-top:1px solid #e4a100;padding-top:6px;color:#60788d;text-align:right}@media print{button{display:none}.bar-track{background:#edf2f6!important}}
    </style></head><body><header><img src="${escape(minasfaltoLogo)}"><h1>Relatório de Controle de Cotação<small>Orçamentos e análise de aquisições</small></h1></header><div class="filters">${escape(resumo)}</div><section class="metrics"><div><small>Orçamentos</small><strong>${registros.length}</strong></div><div><small>Itens</small><strong>${totais.itens}</strong></div><div><small>Valor cotado</small><strong>${escape(money(totais.cotado))}</strong></div><div><small>Valor do desconto</small><strong>${escape(money(totais.desconto))}</strong></div><div><small>Valor final</small><strong>${escape(money(totais.final))}</strong></div></section><section class="chart"><h2>Comparativo cronológico por valor final</h2>${barras || "Nenhum dado para o período."}</section><table><thead><tr><th>Número</th><th>Data</th><th>Objeto</th><th>Veículo/Equipamento</th><th>Fornecedor</th><th>Status</th><th>Itens</th><th>Cotado</th><th>Desconto</th><th>Final</th></tr></thead><tbody>${linhas || '<tr><td colspan="10">Nenhum orçamento encontrado.</td></tr>'}</tbody></table><footer>Minasfalto — Relatório emitido em ${new Date().toLocaleString("pt-BR")}</footer><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`);
    janela.document.close();
  };

  return (
    <section className="compras-reports">
      <form className="compras-report-filters" onSubmit={aplicar}>
        <h2>Relatório de Orçamentos / Controle de Cotação</h2>
        <p>
          Defina os critérios para analisar as cotações e os valores de
          compra.
        </p>
        <div className="compras-report-filter-grid">
          <label>
            Data inicial
            <input
              type="date"
              value={rascunho.inicio}
              onChange={e =>
                setRascunho({ ...rascunho, inicio: e.target.value })
              }
            />
          </label>
          <label>
            Data final
            <input
              type="date"
              value={rascunho.fim}
              onChange={e => setRascunho({ ...rascunho, fim: e.target.value })}
            />
          </label>
          <label>
            Objeto da cotação
            <SearchableSelect
              value={rascunho.objetoId}
              options={objetoOptions}
              placeholder="Todos"
              searchPlaceholder="Pesquisar objeto da cotação..."
              onChange={value =>
                setRascunho({ ...rascunho, objetoId: value })
              }
            />
          </label>
          <label>
            Fornecedor da nota
            <SearchableSelect
              value={rascunho.fornecedorId}
              options={fornecedorOptions}
              placeholder="Todos"
              searchPlaceholder="Pesquisar fornecedor da nota..."
              onChange={value =>
                setRascunho({ ...rascunho, fornecedorId: value })
              }
            />
          </label>
          <label>
            Veículo/Equipamento
            <SearchableSelect
              value={rascunho.veiculoId}
              options={veiculoOptions}
              placeholder="Todos"
              searchPlaceholder="Pesquisar veículo ou equipamento..."
              onChange={value =>
                setRascunho({ ...rascunho, veiculoId: value })
              }
            />
          </label>
        </div>
        <div className="compras-report-actions">
          <button className="primary" type="submit">
            <BarChart3 size={15} />
            Gerar relatório
          </button>
          <button
            type="button"
            onClick={() => {
              setRascunho(vazio);
              setFiltros(vazio);
            }}
          >
            Limpar
          </button>
          <button type="button" onClick={exportarExcel}>
            <Download size={15} />
            Excel
          </button>
          <button type="button" onClick={imprimir}>
            <Printer size={15} />
            PDF/Imprimir
          </button>
        </div>
      </form>
      <div className="compras-report-summary">{resumo}</div>
      <div className="compras-report-metrics">
        <article>
          <small>Orçamentos</small>
          <strong>{registros.length}</strong>
        </article>
        <article>
          <small>Itens cotados</small>
          <strong>{totais.itens.toLocaleString("pt-BR")}</strong>
        </article>
        <article>
          <small>Valor cotado</small>
          <strong>{money(totais.cotado)}</strong>
        </article>
        <article>
          <small>Valor do desconto</small>
          <strong>{money(totais.desconto)}</strong>
        </article>
        <article>
          <small>Valor final</small>
          <strong>{money(totais.final)}</strong>
        </article>
      </div>
      <div className="compras-report-charts">
        <article>
          <h2>Comparativo cronológico por valor final</h2>
          <div className="compras-chart-scroll">
            <div
              style={{
                width: Math.max(650, evolucaoValorFinal.length * 125),
                height: 270,
              }}
            >
              <ResponsiveContainer>
                <BarChart
                  data={evolucaoValorFinal}
                  margin={{ top: 12, right: 15, left: 15, bottom: 70 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="rotulo"
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    height={78}
                  />
                  <YAxis
                    width={76}
                    tickFormatter={v =>
                      `R$ ${Number(v).toLocaleString("pt-BR")}`
                    }
                  />
                  <Tooltip
                    formatter={(v: any) => money(v)}
                    labelFormatter={(_, payload) => {
                      const item = payload?.[0]?.payload;
                      return item?.objeto
                        ? `${item.rotulo} — ${item.objeto}`
                        : item?.rotulo || "";
                    }}
                  />
                  <Bar
                    dataKey="valorFinal"
                    name="Valor final"
                    fill="#2f668f"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </article>
        <article>
          <h2>Orçamentos por status</h2>
          <div style={{ height: 270 }}>
            <ResponsiveContainer>
              <BarChart
                data={porStatus}
                margin={{ top: 12, right: 15, left: 5, bottom: 55 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="nome"
                  angle={-28}
                  textAnchor="end"
                  interval={0}
                  height={65}
                />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="quantidade" name="Orçamentos" fill="#d99b00" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>
      <section className="compras-report-data">
        <h2>Dados do relatório</h2>
        <div
          className="compras-table compras-keyboard-table"
          tabIndex={0}
          role="grid"
          aria-label="Dados do relatório"
          onKeyDown={event =>
            handleComprasTableKeyDown(event, {
              rows: reportPagination.visibleRows,
              selectedId: reportPagination.selectedId,
              setSelectedId: reportPagination.setSelectedId,
              page: reportPagination.page,
              totalPages: reportPagination.totalPages,
              setPage: reportPagination.setPage,
            })
          }
        >
          <table>
            <thead>
              <tr>
                <th>Número</th>
                <th>Data</th>
                <th>Objeto da cotação</th>
                <th>Veículo/Equipamento</th>
                <th>Fornecedor da nota</th>
                <th>Status</th>
                <th>Itens</th>
                <th>Cotado</th>
                <th>Valor do desconto</th>
                <th>Valor final</th>
              </tr>
            </thead>
            <tbody>
              {registrosOrdenados.length ? (
                reportPagination.visibleRows.map(item => (
                  <tr
                    key={item.id}
                    className={
                      reportPagination.selectedId === Number(item.id)
                        ? "selected"
                        : ""
                    }
                    onClick={() =>
                      reportPagination.setSelectedId(Number(item.id))
                    }
                  >
                    <td>{item.numero}</td>
                    <td>
                      {formatarData(item.dataOrcamento)}
                    </td>
                    <td>{item.titulo}</td>
                    <td>{item.veiculoEquipamento || "—"}</td>
                    <td>{item.fornecedorEscolhido || "—"}</td>
                    <td>{STATUS[item.status] || item.status}</td>
                    <td>{item.itens}</td>
                    <td>{money(item.valorCotado)}</td>
                    <td>{money(item.valorNegociado)}</td>
                    <td>{money(item.valorPago)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="compras-empty">
                    Nenhum orçamento encontrado para os filtros informados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ComprasPagination
          page={reportPagination.page}
          pageSize={reportPagination.pageSize}
          total={registrosOrdenados.length}
          totalPages={reportPagination.totalPages}
          onPageChange={reportPagination.setPage}
          onPageSizeChange={reportPagination.setPageSize}
        />
      </section>
    </section>
  );
}

function CadastroAuxiliarModal({
  tipo,
  items,
  refresh,
  onClose,
}: {
  tipo: "objeto" | "veiculo";
  items: any[];
  refresh: () => void;
  onClose: () => void;
}) {
  const label = tipo === "objeto" ? "Objeto da Cotação" : "Veículo/Equipamento";
  const [form, setForm] = useState({
    id: undefined as number | undefined,
    nome: "",
    ativo: true,
  });
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const pagination = useComprasPagination(items, `auxiliar:${tipo}`, 25);
  const editItem = (item: any) =>
    setForm({
      id: Number(item.id),
      nome: item.nome,
      ativo: Boolean(item.ativo),
    });
  const save = trpc.compras.salvarCadastroAuxiliar.useMutation({
    onSuccess: () => {
      toast.success(`${label} salvo com sucesso.`);
      setForm({ id: undefined, nome: "", ativo: true });
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.compras.excluirCadastroAuxiliar.useMutation({
    onSuccess: () => {
      toast.success(`${label} excluído com sucesso.`);
      setDeleteTarget(null);
      setForm({ id: undefined, nome: "", ativo: true });
      refresh();
    },
    onError: error => toast.error(error.message),
  });

  return (
    <div className="compras-overlay compras-aux-overlay">
      <div className="compras-aux-modal" role="dialog" aria-modal="true">
        <button className="close" aria-label="Fechar" onClick={onClose}>
          <X size={20} />
        </button>
        <div className="compras-modal-heading">
          <span className="compras-modal-kicker">Controle de Cotação</span>
          <h2>Cadastrar {label}</h2>
          <p>Inclua, edite ou exclua as opções disponíveis nos orçamentos.</p>
        </div>
        <div className="compras-aux-form">
          <label>
            Nome
            <input
              autoFocus
              value={form.nome}
              placeholder={`Informe o ${label.toLocaleLowerCase("pt-BR")}`}
              onChange={event => setForm({ ...form, nome: event.target.value })}
            />
          </label>
          <label className="compras-active-check">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={event =>
                setForm({ ...form, ativo: event.target.checked })
              }
            />
            Cadastro ativo
          </label>
          <button
            className="primary"
            disabled={save.isPending}
            onClick={() => {
              if (!form.nome.trim())
                return toast.error(
                  `Informe o ${label.toLocaleLowerCase("pt-BR")}.`
                );
              save.mutate({ tipo, ...form });
            }}
          >
            <Save size={15} />
            Salvar
          </button>
          {form.id && (
            <button
              onClick={() => setForm({ id: undefined, nome: "", ativo: true })}
            >
              Cancelar edição
            </button>
          )}
        </div>
        <div
          className="compras-table compras-aux-table compras-keyboard-table"
          tabIndex={0}
          role="grid"
          aria-label={`Lista de ${label}`}
          onKeyDown={event =>
            handleComprasTableKeyDown(event, {
              rows: pagination.visibleRows,
              selectedId: pagination.selectedId,
              setSelectedId: pagination.setSelectedId,
              page: pagination.page,
              totalPages: pagination.totalPages,
              setPage: pagination.setPage,
              onEnter: editItem,
            })
          }
        >
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="compras-empty">
                    Nenhum cadastro encontrado.
                  </td>
                </tr>
              ) : (
                pagination.visibleRows.map(item => (
                  <tr
                    key={item.id}
                    className={
                      pagination.selectedId === Number(item.id)
                        ? "selected"
                        : ""
                    }
                    onClick={() => pagination.setSelectedId(Number(item.id))}
                    onDoubleClick={() => editItem(item)}
                  >
                    <td>{item.nome}</td>
                    <td>{item.ativo ? "ATIVO" : "INATIVO"}</td>
                    <td>
                      <button
                        title="Editar"
                        onClick={() => editItem(item)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        title="Excluir"
                        onClick={() => setDeleteTarget(item)}
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
        <ComprasPagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={items.length}
          totalPages={pagination.totalPages}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
        />
        <footer>
          <button onClick={onClose}>Fechar</button>
        </footer>
      </div>
      <SapDoubleConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={value => !value && setDeleteTarget(null)}
        title={`Confirmar exclusão de ${label.toLocaleLowerCase("pt-BR")}`}
        description="Confira o cadastro que será excluído."
        finalDescription="Confirma a exclusão definitiva? Cadastros vinculados a orçamentos não poderão ser excluídos."
        details={deleteTarget ? [{ label, value: deleteTarget.nome }] : []}
        onConfirm={() =>
          remove.mutate({
            tipo,
            id: Number(deleteTarget.id),
            motivo: "Exclusão confirmada em duas etapas",
          })
        }
        isPending={remove.isPending}
      />
    </div>
  );
}

function Cadastro({
  tipo,
  items,
  refresh,
  searchKey,
  categoriaFornecedor = "NOTA",
}: {
  tipo: "fornecedor" | "material";
  items: any[];
  refresh: () => void;
  searchKey: string;
  categoriaFornecedor?: "NOTA" | "ITEM";
}) {
  const blank =
    tipo === "fornecedor"
      ? {
          nome: "",
          documento: "",
          telefone: "",
          email: "",
          endereco: "",
          ativo: true,
        }
      : { descricao: "", categoria: "", unidade: "UN", ativo: true };
  const [form, setForm] = useState<any>(blank);
  const [target, setTarget] = useState<any>(null);
  const [transferTarget, setTransferTarget] = useState<any>(null);
  const [transferDestination, setTransferDestination] = useState("");
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);
  const isProductBrand =
    tipo === "fornecedor" && categoriaFornecedor === "ITEM";
  const pagination = useComprasPagination(
    items,
    `${tipo}:${categoriaFornecedor}:${searchKey}`
  );
  const editItem = (item: any) =>
    setForm({
      ...blank,
      ...item,
      ativo: Boolean(item.ativo),
      ...(tipo === "fornecedor"
        ? {
            documento: item.documento ?? "",
            telefone: item.telefone ?? "",
            email: item.email ?? "",
            endereco: item.endereco ?? "",
          }
        : {
            categoria: item.categoria ?? "",
            unidade: item.unidade ?? "",
          }),
    });
  const cadastroOptions = {
    onSuccess: () => {
      toast.success("Cadastro salvo.");
      setForm(blank);
      refresh();
    },
    onError: (e: any) => toast.error(e.message),
  };
  const createF = trpc.compras.criarFornecedor.useMutation(cadastroOptions);
  const updateF = trpc.compras.atualizarFornecedor.useMutation(cadastroOptions);
  const createM = trpc.compras.criarMaterial.useMutation(cadastroOptions);
  const updateM = trpc.compras.atualizarMaterial.useMutation(cadastroOptions);
  const del = trpc.compras.excluirCadastro.useMutation({
    onSuccess: result => {
      toast.success(
        result.acao === "EXCLUIDO"
          ? isProductBrand
            ? "Marca do produto excluída com sucesso."
            : "Fornecedor excluído com sucesso."
          : "Cadastro inativado."
      );
      setTarget(null);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const transfer = trpc.compras.transferirCadastro.useMutation({
    onSuccess: () => {
      toast.success("Cadastro transferido com sucesso.");
      setTransferTarget(null);
      setTransferDestination("");
      setTransferConfirmOpen(false);
      setForm(blank);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  return (
    <section className="cadastro">
      <h2>
        {tipo === "fornecedor"
          ? categoriaFornecedor === "ITEM"
            ? "Cadastro de marcas do produto"
            : "Cadastro de fornecedores da nota"
          : "Cadastro de materiais"}
      </h2>
      <div className="cadastro-form">
        {Object.keys(blank)
          .filter(k => k !== "ativo")
          .map(k => (
            <label key={k}>
              {k}
              <input
                value={form[k] || ""}
                onChange={e => setForm({ ...form, [k]: e.target.value })}
              />
            </label>
          ))}
        <button
          className="primary"
          onClick={() => {
            const payload = {
              ...form,
              ativo: Boolean(form.ativo),
              ...(tipo === "fornecedor"
                ? {
                    documento: form.documento ?? "",
                    telefone: form.telefone ?? "",
                    email: form.email ?? "",
                    endereco: form.endereco ?? "",
                  }
                : {
                    categoria: form.categoria ?? "",
                    unidade: form.unidade ?? "",
                  }),
            };
            if (tipo === "fornecedor")
              form.id
                ? updateF.mutate(payload)
                : createF.mutate({
                    ...payload,
                    tipoFornecedor: categoriaFornecedor,
                  });
            else form.id ? updateM.mutate(payload) : createM.mutate(payload);
          }}
        >
          <Save size={15} />
          Salvar
        </button>
      </div>
      <div
        className="compras-table compras-keyboard-table"
        tabIndex={0}
        role="grid"
        aria-label={
          tipo === "material"
            ? "Materiais"
            : isProductBrand
              ? "Marcas do produto"
              : "Fornecedores da nota"
        }
        onKeyDown={event =>
          handleComprasTableKeyDown(event, {
            rows: pagination.visibleRows,
            selectedId: pagination.selectedId,
            setSelectedId: pagination.setSelectedId,
            page: pagination.page,
            totalPages: pagination.totalPages,
            setPage: pagination.setPage,
            onEnter: editItem,
          })
        }
      >
        <table>
          <thead>
            <tr>
              {Object.keys(blank)
                .filter(k => k !== "ativo")
                .map(k => (
                  <th>{k}</th>
                ))}
              <th>Origem</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {pagination.visibleRows.map(x => (
              <tr
                key={x.id}
                className={pagination.selectedId === Number(x.id) ? "selected" : ""}
                onClick={() => pagination.setSelectedId(Number(x.id))}
                onDoubleClick={() => editItem(x)}
              >
                {Object.keys(blank)
                  .filter(k => k !== "ativo")
                  .map(k => (
                    <td>{x[k] || "—"}</td>
                  ))}
                <td>{x.origemPlanilha ? "Planilha" : "Sistema"}</td>
                <td>
                  <button
                    onClick={() => editItem(x)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    title="Transferir cadastro"
                    aria-label="Transferir cadastro"
                    onClick={() => {
                      setTransferTarget(x);
                      setTransferDestination(
                        tipo === "material"
                          ? "FORNECEDOR_NOTA"
                          : categoriaFornecedor === "NOTA"
                            ? "FORNECEDOR_ITEM"
                            : "FORNECEDOR_NOTA"
                      );
                    }}
                  >
                    <ArrowRightLeft size={15} />
                  </button>
                  <button onClick={() => setTarget(x)}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ComprasPagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={items.length}
        totalPages={pagination.totalPages}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
      />
      {transferTarget && !transferConfirmOpen && (
        <div className="compras-transfer-overlay" role="presentation">
          <div
            className="compras-transfer-dialog"
            role="dialog"
            aria-modal="true"
          >
            <button
              className="close"
              aria-label="Fechar"
              onClick={() => setTransferTarget(null)}
            >
              <X size={20} />
            </button>
            <h2>Transferir cadastro</h2>
            <p>
              Escolha a lista de destino para{" "}
              <strong>{transferTarget.nome || transferTarget.descricao}</strong>
              .
            </p>
            <label>
              Destino
              <select
                value={transferDestination}
                onChange={e => setTransferDestination(e.target.value)}
              >
                {tipo === "material" ? (
                  <>
                    <option value="FORNECEDOR_NOTA">Fornecedores</option>
                    <option value="FORNECEDOR_ITEM">Marca do Produto</option>
                  </>
                ) : categoriaFornecedor === "NOTA" ? (
                  <>
                    <option value="FORNECEDOR_ITEM">Marca do Produto</option>
                    <option value="MATERIAL">Materiais</option>
                  </>
                ) : (
                  <>
                    <option value="FORNECEDOR_NOTA">Fornecedores</option>
                    <option value="MATERIAL">Materiais</option>
                  </>
                )}
              </select>
            </label>
            <footer>
              <button onClick={() => setTransferTarget(null)}>Cancelar</button>
              <button
                className="primary"
                onClick={() => setTransferConfirmOpen(true)}
              >
                Continuar
              </button>
            </footer>
          </div>
        </div>
      )}
      <SapDoubleConfirmDialog
        open={Boolean(transferTarget && transferConfirmOpen)}
        onOpenChange={o => !o && setTransferConfirmOpen(false)}
        title="Confirmar transferência de cadastro"
        description="O cadastro será movido para a lista escolhida sem alterar seu histórico."
        finalDescription="Confirma a transferência? Orçamentos já vinculados continuarão preservados."
        details={
          transferTarget
            ? [
                {
                  label: isProductBrand ? "Marca do produto" : "Fornecedor",
                  value: transferTarget.nome,
                },
                {
                  label: "Destino",
                  value: (
                    {
                      FORNECEDOR_NOTA: "Fornecedores",
                      FORNECEDOR_ITEM: "Marca do Produto",
                      MATERIAL: "Materiais",
                    } as Record<string, string>
                  )[transferDestination],
                },
              ]
            : []
        }
        onConfirm={() =>
          transfer.mutate({
            id: transferTarget.id,
            origem:
              tipo === "material"
                ? "MATERIAL"
                : categoriaFornecedor === "NOTA"
                  ? "FORNECEDOR_NOTA"
                  : "FORNECEDOR_ITEM",
            destino: transferDestination as
              | "FORNECEDOR_NOTA"
              | "FORNECEDOR_ITEM"
              | "MATERIAL",
          })
        }
        isPending={transfer.isPending}
      />
      <SapDoubleConfirmDialog
        open={Boolean(target)}
        onOpenChange={o => !o && setTarget(null)}
        title={
          tipo === "fornecedor"
            ? isProductBrand
              ? "Confirmar exclusão de marca do produto"
              : "Confirmar exclusão de fornecedor"
            : "Confirmar inativação"
        }
        description={
          tipo === "fornecedor"
            ? isProductBrand
              ? "A marca do produto será excluída definitivamente do cadastro."
              : "O fornecedor será excluído definitivamente do cadastro."
            : "O cadastro deixará de aparecer em novas cotações."
        }
        finalDescription={
          tipo === "fornecedor"
            ? "Confirma a exclusão definitiva? Esta ação não poderá ser desfeita."
            : "Confirma a inativação? O histórico será mantido."
        }
        details={
          target
            ? [{ label: "Cadastro", value: target.nome || target.descricao }]
            : []
        }
        onConfirm={() =>
          del.mutate({
            tipo,
            id: target.id,
            motivo:
              tipo === "fornecedor"
                ? "Exclusão definitiva confirmada em duas etapas"
                : "Inativação confirmada em duas etapas",
          })
        }
        isPending={del.isPending}
      />
    </section>
  );
}
