import { trpc } from "@/lib/trpc";
import { withAppBase } from "@/lib/app-base";
import SapDoubleConfirmDialog from "@/components/SapDoubleConfirmDialog";
import minasfaltoLogo from "@/assets/minasfalto-logo.jpg";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  Link2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const defaultStatus = ["Pendente", "Encerrado", "Documentacao Separada", "Adjucado"];
const regioesMg = ["Norte", "Sul", "Leste", "Oeste", "Triangulo", "Central", "Metropolitana", "Zona da Mata", "Vale do Aco", "Vale do Rio Doce", "Alto Paranaiba", "Noroeste", "Jequitinhonha", "Mucuri", "Campo das Vertentes"];
const cidadesMg = [
  "Belo Horizonte", "Contagem", "Betim", "Ribeirao das Neves", "Santa Luzia", "Ibirite", "Sabara", "Nova Lima",
  "Uberlandia", "Uberaba", "Araguari", "Ituiutaba", "Patos de Minas", "Patrocinio", "Araxá", "Frutal",
  "Montes Claros", "Januaria", "Pirapora", "Bocaiuva", "Janauba", "Salinas", "Varginha", "Pouso Alegre",
  "Lavras", "Alfenas", "Passos", "Itajuba", "Pocos de Caldas", "Tres Coracoes", "Juiz de Fora", "Barbacena",
  "Muriaé", "Ubá", "Cataguases", "Viçosa", "Governador Valadares", "Ipatinga", "Coronel Fabriciano",
  "Timoteo", "Caratinga", "Manhuaçu", "Teofilo Otoni", "Diamantina", "Curvelo", "Sete Lagoas", "Divinopolis",
  "Itauna", "Formiga", "Pará de Minas", "Ouro Preto", "Mariana", "Conselheiro Lafaiete", "Joao Monlevade",
  "Outra",
];

type Licitacao = any;
type ActiveModal = "menu" | "licitacao" | "status" | "plataforma" | "vendedor" | "entrega" | "ata" | null;
type PanelTab = "geral" | "adjudicadas";
type SortDirection = "asc" | "desc";

const emptyPedidoCrtiForm = {
  pedidoCrti: "",
  cliente: "",
  dataPedido: "",
  statusPedido: "",
  quantidade: 0,
  valorTotal: 0,
  observacoes: "",
};

const emptyAdesaoForm = {
  id: null as number | null,
  orgaoAderente: "",
  dataAdesao: "",
  quantidade: 0,
  entregue: false,
  dataEntrega: "",
  observacoes: "",
};

const emptyLicitacao = {
  data: "",
  orgao: "",
  cidade: "",
  status: "Pendente",
  horaInicioDisputa: "",
  item: "",
  tipo: "",
  qtdeSc: 0,
  valorUnit: 0,
  lanceLimite: 0,
  valorAdjudicado: 0,
  qtdeTn: 0,
  valorInicialContrato: 0,
  kmDistancia: 0,
  regiao: "",
  statusContrato: "Pendente",
  ataVendedorId: null as number | null,
  ataVendedorNome: "NA",
  plataformaId: null as number | null,
};

function numberValue(value: unknown) {
  return Number(value) || 0;
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numberValue(value));
}

function formatDecimal(value: unknown, digits = 3) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(numberValue(value));
}

function formatSaldoEntrega(value: unknown) {
  return formatDecimal(value, 2);
}

function formatSaldoEntregaResumo(value: unknown) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(numberValue(value));
}

function formatDateBR(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const datePart = text.split("T")[0];
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function getPotencial(km: unknown) {
  const value = numberValue(km);
  if (!value) return "";
  if (value <= 200) return "Cliente potencial";
  if (value <= 300) return "Medio potencial";
  return "Cliente distante / fraco potencial";
}

function normalizeText(value: unknown) {
  return String(value ?? "").toUpperCase();
}

function normalizeExternalUrl(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

function getLicitacaoFilterValue(licitacao: any, key: string) {
  if (key === "data") return formatDateBR(licitacao.data);
  if (key === "status") return getLicitacaoStatusDisplay(licitacao);
  if (key === "plataformaNome") return `${licitacao.plataformaNome || ""} ${licitacao.plataformaLink || ""}`;
  if (key === "qtdeSc" || key === "qtdeTn") return formatDecimal(licitacao[key]);
  if (key === "valorUnit" || key === "lanceLimite" || key === "valorAdjudicado" || key === "valorInicialContrato") return formatCurrency(licitacao[key]);
  if (key === "kmDistancia") return formatDecimal(licitacao.kmDistancia, 0);
  if (key === "potencialCliente") return licitacao.potencialCliente || getPotencial(licitacao.kmDistancia);
  if (key === "statusContrato") return licitacao.statusContrato || "Pendente";
  if (key === "ataVendedorNome") return licitacao.ataVendedorNome || "NA";
  if (key === "ataControle") return licitacao.ataVendedorNome && licitacao.ataVendedorNome !== "NA" ? "ATA VINCULADA" : "";
  return licitacao[key] ?? "";
}

function normalizeLicitacaoStatusLabel(value: unknown) {
  const text = normalizeText(value);
  if (text.includes("ADJUDICADO")) return text.replaceAll("ADJUDICADO", "ADJUCADO");
  return text;
}

function isAdjucadoStatus(value: unknown) {
  const text = normalizeText(value);
  return text.includes("ADJUCADO") || text.includes("ADJUDICADO");
}

function isPendenteStatus(value: unknown) {
  return normalizeText(value).trim() === "PENDENTE";
}

function getLicitacaoStatusDisplay(licitacao: Licitacao) {
  if (isAdjucadoStatus(licitacao?.status) && Math.abs(numberValue(licitacao?.saldoEntrega)) < 0.001) {
    return "ADJUCADO/ENTREGUE";
  }
  return normalizeLicitacaoStatusLabel(licitacao?.status);
}

function SimpleModal({
  title,
  children,
  onClose,
  wide = false,
  menu = false,
  delivery = false,
  fullscreen = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  menu?: boolean;
  delivery?: boolean;
  fullscreen?: boolean;
}) {
  return (
    <div className={`desktop-modal-backdrop licitacao-modal-backdrop${fullscreen ? " licitacao-modal-backdrop-fullscreen" : ""}`}>
      <section className={fullscreen ? "licitacao-modal licitacao-modal-fullscreen" : delivery ? "licitacao-modal licitacao-modal-delivery" : wide ? "licitacao-modal licitacao-modal-wide" : menu ? "licitacao-modal licitacao-modal-menu" : "licitacao-modal"}>
        {delivery && <img className="licitacao-modal-logo" src={minasfaltoLogo} alt="Minasfalto" />}
        <button type="button" className="desktop-modal-close" onClick={onClose} aria-label="Fechar">
          <X size={22} />
        </button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

function TextField({ label, value, onChange, type = "text" }: { label: string; value: any; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="licitacao-field">
      <span>{label}</span>
      <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: any; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="licitacao-field">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function LicitacaoPagination({
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
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="cost-pagination licitacao-pagination" aria-label="Paginacao">
      <span className="cost-page-range">{start}-{end} de {total}</span>
      <select
        className="cost-page-size"
        value={pageSize}
        onChange={(event) => onPageSizeChange(Number(event.target.value))}
        aria-label="Registros por pagina"
      >
        {[25, 50, 100, 200].map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1} aria-label="Primeira pagina">
        <ChevronsLeft size={15} />
      </button>
      <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Pagina anterior">
        <ChevronLeft size={15} />
      </button>
      <span className="cost-page-label">Pagina {page} de {totalPages}</span>
      <button type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} aria-label="Proxima pagina">
        <ChevronRight size={15} />
      </button>
      <button type="button" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} aria-label="Ultima pagina">
        <ChevronsRight size={15} />
      </button>
    </div>
  );
}

export default function Licitacoes() {
  const utils = trpc.useUtils();
  const [modal, setModal] = useState<ActiveModal>("menu");
  const [panelTab, setPanelTab] = useState<PanelTab>("geral");
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState("data");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [licitacaoPage, setLicitacaoPage] = useState(1);
  const [licitacaoPageSize, setLicitacaoPageSize] = useState(50);
  const [selectedTableLicitacaoId, setSelectedTableLicitacaoId] = useState<number | null>(null);
  const [editingLicitacao, setEditingLicitacao] = useState<Licitacao | null>(null);
  const [licitacaoForm, setLicitacaoForm] = useState<any>(emptyLicitacao);
  const [cidadeMode, setCidadeMode] = useState("lista");
  const [simpleEdit, setSimpleEdit] = useState<any>(null);
  const [simpleForm, setSimpleForm] = useState<any>({ nome: "", link: "" });
  const [selectedLicitacao, setSelectedLicitacao] = useState<Licitacao | null>(null);
  const [pedidoForm, setPedidoForm] = useState<any>(emptyPedidoCrtiForm);
  const [openEntregaGroups, setOpenEntregaGroups] = useState<Record<number, boolean>>({});
  const [ataForm, setAtaForm] = useState<any>({ vendedorId: null, vendedorNome: "NA", validadeAta: "", quantidadeOriginal: 0, observacoes: "" });
  const [ataTab, setAtaTab] = useState<"dados" | "adesoes">("dados");
  const [adesaoForm, setAdesaoForm] = useState<any>(emptyAdesaoForm);
  const [selectedAdesaoId, setSelectedAdesaoId] = useState<number | null>(null);
  const [openAdesaoGroups, setOpenAdesaoGroups] = useState<Record<number, boolean>>({});
  const [adesaoPedidoCrti, setAdesaoPedidoCrti] = useState("");
  const hydratedAtaId = useRef<number | null>(null);
  const [deleteLicitacaoTarget, setDeleteLicitacaoTarget] = useState<Licitacao | null>(null);
  const [deleteSimpleTarget, setDeleteSimpleTarget] = useState<{ kind: "status" | "plataforma" | "vendedor"; item: any; remove: any } | null>(null);
  const [deletePedidoTarget, setDeletePedidoTarget] = useState<{ pedido: any; licitacao: Licitacao } | null>(null);
  const [deleteAdesaoTarget, setDeleteAdesaoTarget] = useState<{ adesao: any; licitacao: Licitacao } | null>(null);
  const [deleteAdesaoPedidoTarget, setDeleteAdesaoPedidoTarget] = useState<{ pedido: any; adesao: any } | null>(null);

  const opcoes = trpc.licitacoes.opcoes.useQuery();
  const licitacoes = trpc.licitacoes.list.useQuery({
    search,
    adjudicadas: panelTab === "adjudicadas" ? true : false,
  });
  const adjudicadas = trpc.licitacoes.list.useQuery({ adjudicadas: true });
  const pedidosCrti = trpc.licitacoes.pedidosCrti.list.useQuery(
    { licitacaoId: selectedLicitacao?.id || 0 },
    { enabled: Boolean(selectedLicitacao?.id) },
  );
  const ata = trpc.licitacoes.ata.get.useQuery(
    { licitacaoId: selectedLicitacao?.id || 0 },
    { enabled: modal === "ata" && Boolean(selectedLicitacao?.id) },
  );
  const adesoes = trpc.licitacoes.adesoes.list.useQuery(
    { licitacaoId: selectedLicitacao?.id || 0 },
    { enabled: modal === "ata" && Boolean(selectedLicitacao?.id) },
  );
  const adesaoPedidosCrti = trpc.licitacoes.adesoes.pedidosCrti.list.useQuery(
    { adesaoId: selectedAdesaoId || 0 },
    { enabled: modal === "ata" && ataTab === "adesoes" && Boolean(selectedAdesaoId) },
  );

  useEffect(() => {
    if (modal !== "ata" || !selectedLicitacao || !ata.isFetched || hydratedAtaId.current === selectedLicitacao.id) return;

    const savedAta = ata.data;
    if (savedAta && Number(savedAta.licitacaoId) === selectedLicitacao.id) {
      setAtaForm({
        vendedorId: savedAta.vendedorId || null,
        vendedorNome: savedAta.vendedorNome || "NA",
        validadeAta: savedAta.validadeAta || "",
        quantidadeOriginal: numberValue(savedAta.quantidadeOriginal),
        observacoes: savedAta.observacoes || "",
      });
    }
    hydratedAtaId.current = selectedLicitacao.id;
  }, [ata.data, ata.isFetched, modal, selectedLicitacao]);
  const invalidateAll = () => {
    void utils.licitacoes.list.invalidate();
    void utils.licitacoes.opcoes.invalidate();
    void utils.licitacoes.pedidosCrti.list.invalidate();
    void utils.licitacoes.ata.get.invalidate();
    void utils.licitacoes.adesoes.list.invalidate();
    void utils.licitacoes.adesoes.pedidosCrti.list.invalidate();
  };

  const createLicitacao = trpc.licitacoes.create.useMutation({
    onSuccess: () => {
      toast.success("Licitacao cadastrada.");
      setModal(null);
      setLicitacaoForm(emptyLicitacao);
      invalidateAll();
    },
    onError: (error) => toast.error(`Erro ao cadastrar licitacao: ${error.message}`),
  });
  const updateLicitacao = trpc.licitacoes.update.useMutation({
    onSuccess: () => {
      toast.success("Licitacao atualizada.");
      setModal(null);
      setEditingLicitacao(null);
      invalidateAll();
    },
    onError: (error) => toast.error(`Erro ao atualizar licitacao: ${error.message}`),
  });
  const deleteLicitacao = trpc.licitacoes.delete.useMutation({
    onSuccess: () => {
      toast.success("Licitacao excluida.");
      invalidateAll();
    },
    onError: (error) => toast.error(`Erro ao excluir licitacao: ${error.message}`),
  });

  const statusCreate = trpc.licitacoes.status.create.useMutation({ onSuccess: () => { setSimpleForm({ nome: "", link: "" }); invalidateAll(); } });
  const statusUpdate = trpc.licitacoes.status.update.useMutation({ onSuccess: () => { setSimpleEdit(null); setSimpleForm({ nome: "", link: "" }); invalidateAll(); } });
  const statusDelete = trpc.licitacoes.status.delete.useMutation({ onSuccess: invalidateAll });
  const plataformaCreate = trpc.licitacoes.plataformas.create.useMutation({ onSuccess: () => { setSimpleForm({ nome: "", link: "" }); invalidateAll(); } });
  const plataformaUpdate = trpc.licitacoes.plataformas.update.useMutation({ onSuccess: () => { setSimpleEdit(null); setSimpleForm({ nome: "", link: "" }); invalidateAll(); } });
  const plataformaDelete = trpc.licitacoes.plataformas.delete.useMutation({ onSuccess: invalidateAll });
  const vendedorCreate = trpc.licitacoes.vendedores.create.useMutation({ onSuccess: () => { setSimpleForm({ nome: "", link: "" }); invalidateAll(); } });
  const vendedorUpdate = trpc.licitacoes.vendedores.update.useMutation({ onSuccess: () => { setSimpleEdit(null); setSimpleForm({ nome: "", link: "" }); invalidateAll(); } });
  const vendedorDelete = trpc.licitacoes.vendedores.delete.useMutation({ onSuccess: invalidateAll });

  const saveAta = trpc.licitacoes.ata.save.useMutation({
    onSuccess: () => {
      toast.success("Controle de ata salvo.");
      invalidateAll();
    },
    onError: (error) => toast.error(`Erro ao salvar ata: ${error.message}`),
  });
  const saveAdesaoSuccess = () => {
    toast.success(adesaoForm.id ? "Adesao atualizada." : "Adesao cadastrada.");
    setAdesaoForm(emptyAdesaoForm);
    invalidateAll();
  };
  const createAdesao = trpc.licitacoes.adesoes.create.useMutation({
    onSuccess: saveAdesaoSuccess,
    onError: (error) => toast.error(`Erro ao cadastrar adesao: ${error.message}`),
  });
  const updateAdesao = trpc.licitacoes.adesoes.update.useMutation({
    onSuccess: saveAdesaoSuccess,
    onError: (error) => toast.error(`Erro ao atualizar adesao: ${error.message}`),
  });
  const deleteAdesao = trpc.licitacoes.adesoes.delete.useMutation({
    onSuccess: () => { toast.success("Adesao excluida."); setAdesaoForm(emptyAdesaoForm); invalidateAll(); },
    onError: (error) => toast.error(`Erro ao excluir adesao: ${error.message}`),
  });
  const createAdesaoPedido = trpc.licitacoes.adesoes.pedidosCrti.create.useMutation({
    onSuccess: () => { toast.success("Pedido CRTI vinculado a adesao."); setAdesaoPedidoCrti(""); invalidateAll(); },
    onError: (error) => toast.error(`Erro ao vincular pedido CRTI: ${error.message}`),
  });
  const deleteAdesaoPedido = trpc.licitacoes.adesoes.pedidosCrti.delete.useMutation({
    onSuccess: () => { toast.success("Pedido CRTI desvinculado da adesao."); invalidateAll(); },
    onError: (error) => toast.error(`Erro ao desvincular pedido CRTI: ${error.message}`),
  });
  const createPedido = trpc.licitacoes.pedidosCrti.create.useMutation({
    onSuccess: () => {
      toast.success("Pedido vinculado.");
      setPedidoForm(emptyPedidoCrtiForm);
      invalidateAll();
    },
    onError: (error) => toast.error(`Erro ao vincular pedido: ${error.message}`),
  });
  const deletePedido = trpc.licitacoes.pedidosCrti.delete.useMutation({
    onSuccess: () => {
      toast.success("Pedido desvinculado.");
      setPedidoForm(emptyPedidoCrtiForm);
      invalidateAll();
    },
    onError: (error) => toast.error(`Erro ao desvincular pedido: ${error.message}`),
  });

  const statuses = [...defaultStatus, ...(opcoes.data?.status || []).map((item: any) => normalizeLicitacaoStatusLabel(item.nome))]
    .filter((value, index, arr) => value && arr.indexOf(value) === index);
  const vendedores = opcoes.data?.vendedores || [];
  const plataformas = opcoes.data?.plataformas || [];
  const licitacaoTableColumns = useMemo(() => {
    const columns: Array<[string, string]> = [
      ["data", "Data"],
      ["orgao", "Orgao"],
      ["cidade", "Cidade"],
      ["status", "Status"],
      ["item", "Item"],
      ["tipo", "Tipo"],
      ["qtdeSc", "Qtde SC"],
      ["valorUnit", "Valor Unit"],
      ["lanceLimite", "Lance Limite"],
      ["valorAdjudicado", "Valor Adjucado"],
      ["qtdeTn", "Qtde TN"],
      ["valorInicialContrato", "Valor Inicial Contrato"],
      ["kmDistancia", "KM"],
      ["potencialCliente", "Potencial"],
      ["regiao", "Regiao"],
    ];

    if (panelTab === "geral") {
      columns.splice(4, 0, ["plataformaNome", "Link Plat.Pregao"]);
    }

    if (panelTab === "adjudicadas") {
      columns.push(["statusContrato", "Status Contrato"], ["ataVendedorNome", "Ata Vendedor"], ["ataControle", "Ata"]);
    }

    return columns;
  }, [panelTab]);
  const licitacaoTableColumnCount = licitacaoTableColumns.length + 1;
  const rows = useMemo(() => {
    const visibleColumnKeys = new Set(licitacaoTableColumns.map(([key]) => key));
    const filters = Object.entries(columnFilters)
      .map(([key, value]) => [key, normalizeText(value).trim()] as const)
      .filter(([key, value]) => visibleColumnKeys.has(key) && value);
    const data = [...(licitacoes.data || [])].filter((licitacao) => {
      if (!filters.length) return true;
      return filters.every(([key, value]) => normalizeText(getLicitacaoFilterValue(licitacao, key)).includes(value));
    });

    return data.sort((left, right) => {
      const a = String(getLicitacaoFilterValue(left, sortKey));
      const b = String(getLicitacaoFilterValue(right, sortKey));
      const result = a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
      return sortDirection === "asc" ? result : -result;
    });
  }, [licitacoes.data, licitacaoTableColumns, columnFilters, sortKey, sortDirection]);
  const licitacaoTotal = rows.length;
  const licitacaoTotalPages = Math.max(1, Math.ceil(licitacaoTotal / licitacaoPageSize));
  const visibleLicitacoes = useMemo(
    () => rows.slice((licitacaoPage - 1) * licitacaoPageSize, licitacaoPage * licitacaoPageSize),
    [rows, licitacaoPage, licitacaoPageSize],
  );
  const currentTableLicitacao = useMemo(
    () => visibleLicitacoes.find((licitacao) => licitacao.id === selectedTableLicitacaoId) || visibleLicitacoes[0] || null,
    [visibleLicitacoes, selectedTableLicitacaoId],
  );
  const adjudicadasPendentes = useMemo(
    () => (adjudicadas.data || []).filter((licitacao: any) => Math.abs(numberValue(licitacao.saldoEntrega)) >= 0.001),
    [adjudicadas.data],
  );

  useEffect(() => {
    setLicitacaoPage(1);
  }, [search, panelTab, licitacaoPageSize, columnFilters]);

  useEffect(() => {
    if (licitacaoPage > licitacaoTotalPages) setLicitacaoPage(licitacaoTotalPages);
  }, [licitacaoPage, licitacaoTotalPages]);

  useEffect(() => {
    if (!visibleLicitacoes.length) {
      if (selectedTableLicitacaoId !== null) setSelectedTableLicitacaoId(null);
      return;
    }

    if (!selectedTableLicitacaoId || !visibleLicitacoes.some((licitacao) => licitacao.id === selectedTableLicitacaoId)) {
      setSelectedTableLicitacaoId(visibleLicitacoes[0].id);
    }
  }, [visibleLicitacoes, selectedTableLicitacaoId]);

  const scrollSelectedLicitacaoIntoView = () => {
    window.requestAnimationFrame(() => {
      const selectedRow = document.querySelector(".licitacao-grid-frame tbody tr.selected") as HTMLElement | null;
      selectedRow?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  };

  const sortBy = (key: string) => {
    if (sortKey === key) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const handleLicitacoesTableKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.shiftKey && event.key === "ArrowRight") {
      event.preventDefault();
      setLicitacaoPage((current) => Math.min(licitacaoTotalPages, current + 1));
      return;
    }

    if (event.shiftKey && event.key === "ArrowLeft") {
      event.preventDefault();
      setLicitacaoPage((current) => Math.max(1, current - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (currentTableLicitacao) openLicitacaoForm(currentTableLicitacao);
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const scrollContainer = event.currentTarget;
      scrollContainer.scrollLeft += event.key === "ArrowRight" ? 120 : -120;
      return;
    }

    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    if (!visibleLicitacoes.length) return;

    const currentIndex = Math.max(
      0,
      visibleLicitacoes.findIndex((licitacao) => licitacao.id === currentTableLicitacao?.id),
    );
    const nextIndex = event.key === "ArrowDown"
      ? Math.min(visibleLicitacoes.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);

    setSelectedTableLicitacaoId(visibleLicitacoes[nextIndex].id);
    scrollSelectedLicitacaoIntoView();
  };

  const openLicitacaoForm = (licitacao?: Licitacao) => {
    setEditingLicitacao(licitacao || null);
    setLicitacaoForm(licitacao ? { ...emptyLicitacao, ...licitacao, status: normalizeLicitacaoStatusLabel(licitacao.status) } : emptyLicitacao);
    setCidadeMode(licitacao?.cidade && !cidadesMg.includes(licitacao.cidade) ? "outra" : "lista");
    setModal("licitacao");
  };

  const submitLicitacao = () => {
    const payload = {
      ...licitacaoForm,
      orgao: normalizeText(licitacaoForm.orgao),
      cidade: normalizeText(licitacaoForm.cidade),
      status: normalizeLicitacaoStatusLabel(licitacaoForm.status),
      plataformaId: licitacaoForm.plataformaId ? Number(licitacaoForm.plataformaId) : null,
      item: normalizeText(licitacaoForm.item),
      tipo: normalizeText(licitacaoForm.tipo),
      regiao: normalizeText(licitacaoForm.regiao),
    };
    if (editingLicitacao) updateLicitacao.mutate({ id: editingLicitacao.id, data: payload });
    else createLicitacao.mutate(payload);
  };

  const openAta = (licitacao: Licitacao) => {
    hydratedAtaId.current = null;
    setAtaTab("dados");
    setAdesaoForm(emptyAdesaoForm);
    setSelectedAdesaoId(null);
    setOpenAdesaoGroups({});
    setAdesaoPedidoCrti("");
    setSelectedLicitacao(licitacao);
    setAtaForm({
      vendedorId: licitacao.ataVendedorId || null,
      vendedorNome: licitacao.ataVendedorNome || "NA",
      validadeAta: "",
      quantidadeOriginal: licitacao.qtdeSc || 0,
      observacoes: "",
    });
    setModal("ata");
  };

  const submitAdesao = () => {
    if (!selectedLicitacao) return;
    if (!String(adesaoForm.orgaoAderente || "").trim()) {
      toast.error("Informe o orgao aderente.");
      return;
    }
    const payload = {
      licitacaoId: selectedLicitacao.id,
      orgaoAderente: normalizeText(adesaoForm.orgaoAderente).trim(),
      dataAdesao: adesaoForm.dataAdesao || "",
      quantidade: numberValue(adesaoForm.quantidade),
      entregue: Boolean(adesaoForm.entregue),
      dataEntrega: adesaoForm.entregue ? adesaoForm.dataEntrega || "" : "",
      observacoes: normalizeText(adesaoForm.observacoes),
    };
    if (adesaoForm.id) updateAdesao.mutate({ id: adesaoForm.id, data: payload });
    else createAdesao.mutate(payload);
  };

  const submitPedidoCrti = (licitacao: Licitacao) => {
    const codigoPedido = String(pedidoForm.pedidoCrti || "").trim();
    if (!codigoPedido) {
      toast.error("Informe o codigo do pedido CRTI.");
      return;
    }

    setSelectedLicitacao(licitacao);
    const payload = {
      ...pedidoForm,
      pedidoCrti: codigoPedido,
      licitacaoId: licitacao.id,
      cliente: normalizeText(pedidoForm.cliente),
      observacoes: normalizeText(pedidoForm.observacoes),
    };

    createPedido.mutate(payload);
  };

  const renderAuxCadastro = (kind: "status" | "plataforma" | "vendedor") => {
    const isPlataforma = kind === "plataforma";
    const title = kind === "status" ? "Cadastro Status" : kind === "plataforma" ? "Cadastro Plataforma Pregao" : "Cadastro Vendedor";
    const items = kind === "status" ? opcoes.data?.status || [] : kind === "plataforma" ? plataformas : vendedores;
    const create = kind === "status" ? statusCreate : kind === "plataforma" ? plataformaCreate : vendedorCreate;
    const update = kind === "status" ? statusUpdate : kind === "plataforma" ? plataformaUpdate : vendedorUpdate;
    const remove = kind === "status" ? statusDelete : kind === "plataforma" ? plataformaDelete : vendedorDelete;
    return (
      <SimpleModal title={title} onClose={() => setModal("menu")} wide>
        <section className="licitacao-form-grid licitacao-form-grid-compact">
          <TextField label="Nome" value={simpleForm.nome} onChange={(value) => setSimpleForm((current: any) => ({ ...current, nome: normalizeText(value) }))} />
          {isPlataforma && <TextField label="Link" value={simpleForm.link} onChange={(value) => setSimpleForm((current: any) => ({ ...current, link: value }))} />}
          <button
            type="button"
            className="desktop-action"
            onClick={() => simpleEdit ? update.mutate({ id: simpleEdit.id, data: simpleForm }) : create.mutate(simpleForm)}
          >
            <Save size={14} /> {simpleEdit ? "Salvar edicao" : "Cadastrar"}
          </button>
        </section>
        <div className="desktop-table-scroll licitacao-list-scroll">
          <table className="desktop-table licitacao-simple-table">
            <thead>
              <tr>
                <th>Nome</th>
                {isPlataforma && <th>Link</th>}
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id}>
                  <td>{item.nome}</td>
                  {isPlataforma && <td>{item.link ? <a href={item.link} target="_blank" rel="noreferrer">{item.link}</a> : ""}</td>}
                  <td>
                    <button className="mini-icon-button" onClick={() => { setSimpleEdit(item); setSimpleForm({ nome: item.nome, link: item.link || "" }); }}><Pencil size={14} /></button>
                    <button className="mini-icon-button danger" onClick={() => setDeleteSimpleTarget({ kind, item, remove })}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SimpleModal>
    );
  };

  return (
    <main className="desktop-page licitacao-page">
      <header className="desktop-header licitacao-header">
        <div className="desktop-title">
          <img src={minasfaltoLogo} alt="Minasfalto" />
          <div>
            <h1>LICITACOES</h1>
            <span>Controle de pregoes, atas e entregas CRTI</span>
          </div>
        </div>
        <button className="desktop-back" onClick={() => { window.location.href = withAppBase("/"); }}>
          <ArrowLeft size={16} /> Voltar
        </button>
      </header>

      <section className="desktop-toolbar">
        <button className="desktop-action" onClick={() => setModal("menu")}><Plus size={14} /> Menu Licitacoes</button>
        <button className="desktop-action" onClick={() => openLicitacaoForm()}><Plus size={14} /> Nova Licitacao</button>
        <label className="desktop-search">
          <Search size={13} /> Buscar:
          <input value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </section>

      <section className="desktop-tabs licitacao-tabs">
        <button className={panelTab === "geral" ? "active" : ""} onClick={() => setPanelTab("geral")}>PAINEL PRINCIPAL</button>
        <button className={panelTab === "adjudicadas" ? "active" : ""} onClick={() => setPanelTab("adjudicadas")}>ADJUCADOS</button>
      </section>

      <section className="desktop-grid-frame licitacao-grid-frame">
        <div
          className="desktop-table-scroll keyboard-table-scroll"
          tabIndex={0}
          role="grid"
          aria-label="Licitacoes"
          onKeyDown={handleLicitacoesTableKeyDown}
        >
          <table className={`desktop-table licitacao-table ${panelTab === "geral" ? "licitacao-table-general" : "licitacao-table-adjucados"}`}>
            <thead>
              <tr>
                {licitacaoTableColumns.map(([key, label]) => <th key={key} onClick={() => sortBy(key)}>{label}</th>)}
                <th>Acoes</th>
              </tr>
              <tr className="licitacao-filter-row">
                {licitacaoTableColumns.map(([key, label]) => (
                  <th key={`${key}-filter`}>
                    <input
                      aria-label={`Filtrar ${label}`}
                      value={columnFilters[key] || ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setColumnFilters((current) => ({ ...current, [key]: value }));
                      }}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    />
                  </th>
                ))}
                <th>
                  <button
                    type="button"
                    className="licitacao-clear-filters"
                    onClick={(event) => {
                      event.stopPropagation();
                      setColumnFilters({});
                    }}
                    disabled={Object.values(columnFilters).every((value) => !value)}
                  >
                    Limpar
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {licitacoes.isLoading ? (
                <tr><td colSpan={licitacaoTableColumnCount} className="desktop-empty">Carregando licitacoes...</td></tr>
              ) : visibleLicitacoes.length === 0 ? (
                <tr><td colSpan={licitacaoTableColumnCount} className="desktop-empty">Nenhuma licitacao encontrada</td></tr>
              ) : visibleLicitacoes.map((licitacao) => (
                <tr
                  key={licitacao.id}
                  className={currentTableLicitacao?.id === licitacao.id ? "selected" : ""}
                  onClick={() => setSelectedTableLicitacaoId(licitacao.id)}
                  onDoubleClick={() => openLicitacaoForm(licitacao)}
                >
                  <td>{formatDateBR(licitacao.data)}</td>
                  <td title={licitacao.orgao}>{normalizeText(licitacao.orgao)}</td>
                  <td>{normalizeText(licitacao.cidade)}</td>
                  <td className={isPendenteStatus(getLicitacaoStatusDisplay(licitacao)) ? "licitacao-status-pendente" : ""}>
                    {getLicitacaoStatusDisplay(licitacao)}
                  </td>
                  {panelTab === "geral" && (
                    <td className="licitacao-platform-cell">
                      {licitacao.plataformaLink ? (
                        <button
                          type="button"
                          className="mini-icon-button licitacao-platform-button"
                          title={normalizeText(licitacao.plataformaNome || "Abrir plataforma")}
                          onClick={(event) => {
                            event.stopPropagation();
                            const url = normalizeExternalUrl(licitacao.plataformaLink);
                            if (url) window.open(url, "_blank", "noopener,noreferrer");
                          }}
                        >
                          <ExternalLink size={13} />
                          <span>Abrir</span>
                        </button>
                      ) : (
                        <span className="licitacao-platform-empty">-</span>
                      )}
                    </td>
                  )}
                  <td>{normalizeText(licitacao.item)}</td>
                  <td>{normalizeText(licitacao.tipo)}</td>
                  <td className="num">{formatDecimal(licitacao.qtdeSc)}</td>
                  <td className="num">{formatCurrency(licitacao.valorUnit)}</td>
                  <td className="num">{formatCurrency(licitacao.lanceLimite)}</td>
                  <td className="num">{formatCurrency(licitacao.valorAdjudicado)}</td>
                  <td className="num">{formatDecimal(licitacao.qtdeTn)}</td>
                  <td className="num">{formatCurrency(licitacao.valorInicialContrato)}</td>
                  <td className="num">{formatDecimal(licitacao.kmDistancia, 0)}</td>
                  <td>{normalizeText(licitacao.potencialCliente || getPotencial(licitacao.kmDistancia))}</td>
                  <td>{normalizeText(licitacao.regiao)}</td>
                  {panelTab === "adjudicadas" && (
                    <>
                      <td>
                        <select value={licitacao.statusContrato || "Pendente"} onChange={(event) => updateLicitacao.mutate({ id: licitacao.id, data: { ...(licitacao as any), statusContrato: event.target.value } })}>
                          <option value="Assinado">ASSINADO</option>
                          <option value="Pendente">PENDENTE</option>
                        </select>
                      </td>
                      <td>
                        <select
                          value={licitacao.ataVendedorId || "NA"}
                          onChange={(event) => {
                            const vendedor = vendedores.find((item: any) => String(item.id) === event.target.value);
                            updateLicitacao.mutate({
                              id: licitacao.id,
                              data: { ...(licitacao as any), ataVendedorId: vendedor?.id || null, ataVendedorNome: vendedor?.nome || "NA" },
                            });
                          }}
                        >
                          <option value="NA">NA</option>
                          {vendedores.map((vendedor: any) => <option key={vendedor.id} value={vendedor.id}>{normalizeText(vendedor.nome)}</option>)}
                        </select>
                      </td>
                      <td>
                        {licitacao.ataVendedorNome && licitacao.ataVendedorNome !== "NA" && (
                          <button className="mini-icon-button" onClick={() => openAta(licitacao)}><Link2 size={14} /></button>
                        )}
                      </td>
                    </>
                  )}
                  <td>
                    <button className="mini-icon-button" onClick={() => openLicitacaoForm(licitacao)}><Pencil size={14} /></button>
                    <button className="mini-icon-button" onClick={() => { setSelectedLicitacao(licitacao); setOpenEntregaGroups({}); setModal("entrega"); }}><Link2 size={14} /></button>
                    <button className="mini-icon-button danger" onClick={() => setDeleteLicitacaoTarget(licitacao)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="licitacao-grid-footer">
          <LicitacaoPagination
            page={licitacaoPage}
            pageSize={licitacaoPageSize}
            total={licitacaoTotal}
            totalPages={licitacaoTotalPages}
            onPageChange={setLicitacaoPage}
            onPageSizeChange={setLicitacaoPageSize}
          />
          <span>{visibleLicitacoes.length} licitacao(s) nesta pagina</span>
        </footer>
      </section>

      {modal === "menu" && (
        <SimpleModal title="Licitações" onClose={() => setModal(null)} menu>
          <div className="licitacao-menu-grid">
            <button onClick={() => openLicitacaoForm()}><Plus size={18} /> Cadastro Licitacao</button>
            <button onClick={() => setModal("status")}><Plus size={18} /> Cadastro status</button>
            <button onClick={() => setModal("plataforma")}><ExternalLink size={18} /> Cadastro Plataforma Pregao</button>
            <button onClick={() => setModal(null)}><Search size={18} /> Acesso ao Painel Principal</button>
            <button onClick={() => setModal("vendedor")}><Plus size={18} /> Cadastro Vendedor</button>
            <button onClick={() => { setSelectedLicitacao(null); setOpenEntregaGroups({}); setModal("entrega"); }}><Link2 size={18} /> Vincular Pedido CRTI Controle de Entrega</button>
          </div>
        </SimpleModal>
      )}

      {modal === "licitacao" && (
        <SimpleModal title={editingLicitacao ? "Editar Licitacao" : "Cadastro Licitacao"} onClose={() => setModal(null)} wide>
          <section className="licitacao-form-grid">
            <TextField label="Data" type="date" value={licitacaoForm.data} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, data: value }))} />
            <TextField label="Orgao" value={licitacaoForm.orgao} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, orgao: normalizeText(value) }))} />
            <SelectField label="Cidade" value={cidadeMode === "outra" ? "Outra" : licitacaoForm.cidade} onChange={(value) => { setCidadeMode(value === "Outra" ? "outra" : "lista"); setLicitacaoForm((current: any) => ({ ...current, cidade: value === "Outra" ? "" : value })); }}>
              <option value="">Selecione</option>
              {cidadesMg.map((cidade) => <option key={cidade} value={cidade}>{normalizeText(cidade)}</option>)}
            </SelectField>
            {cidadeMode === "outra" && <TextField label="Outra cidade" value={licitacaoForm.cidade} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, cidade: normalizeText(value) }))} />}
            <SelectField label="Status" value={licitacaoForm.status} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, status: value }))}>
              {statuses.map((status) => <option key={status} value={status}>{normalizeText(status)}</option>)}
              <option value="Outro">OUTRO</option>
            </SelectField>
            {licitacaoForm.status === "Outro" && <TextField label="Outro status" value={licitacaoForm.statusOutro || ""} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, status: normalizeText(value), statusOutro: normalizeText(value) }))} />}
            <SelectField
              label="Plataforma Pregao"
              value={licitacaoForm.plataformaId || ""}
              onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, plataformaId: value ? Number(value) : null }))}
            >
              <option value="">Selecione</option>
              {plataformas.map((plataforma: any) => (
                <option key={plataforma.id} value={plataforma.id}>{normalizeText(plataforma.nome)}</option>
              ))}
            </SelectField>
            <TextField label="Hora Inicio da Disputa" type="time" value={licitacaoForm.horaInicioDisputa} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, horaInicioDisputa: value }))} />
            <TextField label="Item" value={licitacaoForm.item} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, item: normalizeText(value) }))} />
            <TextField label="Tipo" value={licitacaoForm.tipo} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, tipo: normalizeText(value) }))} />
            <TextField label="Qtde SC" type="number" value={licitacaoForm.qtdeSc} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, qtdeSc: Number(value) }))} />
            <TextField label="Valor Unit" type="number" value={licitacaoForm.valorUnit} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, valorUnit: Number(value) }))} />
            <TextField label="Lance Limite" type="number" value={licitacaoForm.lanceLimite} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, lanceLimite: Number(value) }))} />
            <TextField label="Valor Adjucado" type="number" value={licitacaoForm.valorAdjudicado} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, valorAdjudicado: Number(value) }))} />
            <TextField label="Qtde TN" type="number" value={licitacaoForm.qtdeTn} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, qtdeTn: Number(value) }))} />
            <TextField label="Valor Inicial Contrato" type="number" value={licitacaoForm.valorInicialContrato} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, valorInicialContrato: Number(value) }))} />
            <TextField label="KM distancia" type="number" value={licitacaoForm.kmDistancia} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, kmDistancia: Number(value) }))} />
            <label className="licitacao-field licitacao-readonly"><span>Potencial</span><strong>{getPotencial(licitacaoForm.kmDistancia)}</strong></label>
            <SelectField label="Regiao" value={licitacaoForm.regiao} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, regiao: value }))}>
              <option value="">Selecione</option>
              {regioesMg.map((regiao) => <option key={regiao} value={regiao}>{normalizeText(regiao)}</option>)}
            </SelectField>
          </section>
          <footer className="licitacao-modal-actions">
            <button className="desktop-action" onClick={() => setModal(null)}><X size={14} /> Cancelar</button>
            <button className="desktop-action primary" onClick={submitLicitacao}><Save size={14} /> Salvar</button>
          </footer>
        </SimpleModal>
      )}

      {modal === "status" && renderAuxCadastro("status")}
      {modal === "plataforma" && renderAuxCadastro("plataforma")}
      {modal === "vendedor" && renderAuxCadastro("vendedor")}

      {modal === "ata" && selectedLicitacao && (
        <SimpleModal title={`Controle de Ata - ${selectedLicitacao.orgao}`} onClose={() => setModal(null)} fullscreen>
          <nav className="licitacao-ata-tabs">
            <button type="button" className={ataTab === "dados" ? "active" : ""} onClick={() => setAtaTab("dados")}>Dados da Ata</button>
            <button type="button" className={ataTab === "adesoes" ? "active" : ""} onClick={() => setAtaTab("adesoes")}>Controle de Adesoes</button>
          </nav>

          {ataTab === "dados" && (
            <>
              <section className="licitacao-form-grid licitacao-form-grid-compact">
                <SelectField label="Vendedor" value={ataForm.vendedorId || "NA"} onChange={(value) => {
                  const vendedor = vendedores.find((item: any) => String(item.id) === value);
                  setAtaForm((current: any) => ({ ...current, vendedorId: vendedor?.id || null, vendedorNome: vendedor?.nome || "NA" }));
                }}>
                  <option value="NA">NA</option>
                  {vendedores.map((vendedor: any) => <option key={vendedor.id} value={vendedor.id}>{normalizeText(vendedor.nome)}</option>)}
                </SelectField>
                <TextField label="Validade Ata" type="date" value={ataForm.validadeAta} onChange={(value) => setAtaForm((current: any) => ({ ...current, validadeAta: value }))} />
                <TextField label="Quantidade Original" type="number" value={ataForm.quantidadeOriginal} onChange={(value) => setAtaForm((current: any) => ({ ...current, quantidadeOriginal: Number(value) }))} />
                <label className="licitacao-field licitacao-readonly"><span>Limite Individual (50%)</span><strong>{formatDecimal(numberValue(ataForm.quantidadeOriginal) * 0.5)}</strong></label>
                <label className="licitacao-field licitacao-readonly"><span>Limite Coletivo (200%)</span><strong>{formatDecimal(numberValue(ataForm.quantidadeOriginal) * 2)}</strong></label>
              </section>
              <label className="licitacao-field">
                <span>Observacoes</span>
                <textarea value={ataForm.observacoes} onChange={(event) => setAtaForm((current: any) => ({ ...current, observacoes: normalizeText(event.target.value) }))} />
              </label>
              <footer className="licitacao-modal-actions">
                <button className="desktop-action primary" disabled={saveAta.isPending} onClick={() => saveAta.mutate({ ...ataForm, licitacaoId: selectedLicitacao.id })}><Save size={14} /> Salvar Ata</button>
              </footer>
            </>
          )}

          {ataTab === "adesoes" && (
            <section className="licitacao-adesoes">
              <div className="licitacao-adesoes-summary">
                <span><small>Limite Individual (50%)</small><strong>{formatDecimal(adesoes.data?.limiteIndividual || 0)}</strong></span>
                <span><small>Limite Coletivo (200%)</small><strong>{formatDecimal(adesoes.data?.limiteColetivo || 0)}</strong></span>
                <span><small>Quantidade Aderida</small><strong>{formatDecimal(adesoes.data?.quantidadeUtilizada || 0)}</strong></span>
                <span><small>Saldo coletivo</small><strong>{formatDecimal(adesoes.data?.saldoColetivo || 0)}</strong></span>
              </div>

              <div className="licitacao-adesao-form">
                <TextField label="Orgao Aderente" value={adesaoForm.orgaoAderente} onChange={(value) => setAdesaoForm((current: any) => ({ ...current, orgaoAderente: normalizeText(value) }))} />
                <TextField label="Data da Adesao" type="date" value={adesaoForm.dataAdesao} onChange={(value) => setAdesaoForm((current: any) => ({ ...current, dataAdesao: value }))} />
                <TextField label="Quantidade" type="number" value={adesaoForm.quantidade} onChange={(value) => setAdesaoForm((current: any) => ({ ...current, quantidade: Number(value) }))} />
                <SelectField label="Entrega" value={adesaoForm.entregue ? "sim" : "nao"} onChange={(value) => setAdesaoForm((current: any) => ({ ...current, entregue: value === "sim", dataEntrega: value === "sim" ? current.dataEntrega : "" }))}>
                  <option value="nao">Nao</option>
                  <option value="sim">Sim</option>
                </SelectField>
                {adesaoForm.entregue && <TextField label="Data da Entrega" type="date" value={adesaoForm.dataEntrega} onChange={(value) => setAdesaoForm((current: any) => ({ ...current, dataEntrega: value }))} />}
                <label className="licitacao-field licitacao-adesao-observacoes"><span>Observacoes</span><textarea value={adesaoForm.observacoes} onChange={(event) => setAdesaoForm((current: any) => ({ ...current, observacoes: normalizeText(event.target.value) }))} /></label>
                <div className="licitacao-adesao-actions">
                  {adesaoForm.id && <button type="button" className="desktop-action" onClick={() => setAdesaoForm(emptyAdesaoForm)}><X size={14} /> Cancelar</button>}
                  <button type="button" className="desktop-action primary" disabled={createAdesao.isPending || updateAdesao.isPending} onClick={submitAdesao}><Save size={14} /> {adesaoForm.id ? "Atualizar Adesao" : "Cadastrar Adesao"}</button>
                </div>
              </div>

              <div className="desktop-table-scroll licitacao-adesoes-table-wrap">
                <table className="desktop-table licitacao-adesoes-table">
                  <thead><tr><th></th><th>Orgao Aderente</th><th>Data</th><th>Quantidade</th><th>Status Entrega</th><th>Data Entrega</th><th>Pedidos CRTI</th><th>Saldo</th><th>Acoes</th></tr></thead>
                  <tbody>
                    {(adesoes.data?.items || []).map((item: any) => {
                      const isOpen = Boolean(openAdesaoGroups[item.id]);
                      return (
                        <Fragment key={item.id}>
                          <tr>
                            <td><button type="button" className="mini-icon-button" title="Vincular pedidos CRTI" onClick={() => { setSelectedAdesaoId(item.id); setAdesaoPedidoCrti(""); setOpenAdesaoGroups({ [item.id]: !isOpen }); }}>{isOpen ? "-" : "+"}</button></td>
                            <td>{normalizeText(item.orgaoAderente)}</td>
                            <td>{formatDateBR(item.dataAdesao)}</td>
                            <td className="num">{formatDecimal(item.quantidade)}</td>
                            <td><span className={`licitacao-delivery-flag ${item.entregue ? "yes" : "no"}`}>{item.entregue ? "SIM" : "NAO"}</span></td>
                            <td>{item.entregue ? formatDateBR(item.dataEntrega) : "-"}</td>
                            <td className="num">{item.totalPedidos || 0}</td>
                            <td className="num">{formatSaldoEntrega(item.saldoEntrega)}</td>
                            <td className="actions">
                              <button type="button" className="mini-icon-button" title="Editar adesao" onClick={() => setAdesaoForm({ id: item.id, orgaoAderente: item.orgaoAderente || "", dataAdesao: item.dataAdesao || "", quantidade: numberValue(item.quantidade), entregue: Boolean(item.entregue), dataEntrega: item.dataEntrega || "", observacoes: item.observacoes || "" })}><Pencil size={14} /></button>
                              <button type="button" className="mini-icon-button danger" title="Excluir adesao" onClick={() => setDeleteAdesaoTarget({ adesao: item, licitacao: selectedLicitacao })}><Trash2 size={14} /></button>
                            </td>
                          </tr>
                          {isOpen && selectedAdesaoId === item.id && (
                            <tr className="licitacao-adesao-pedidos-row">
                              <td colSpan={9}>
                                <div className="licitacao-adesao-pedido-form">
                                  <TextField label="Codigo Pedido CRTI" value={adesaoPedidoCrti} onChange={setAdesaoPedidoCrti} />
                                  <button type="button" className="desktop-action primary" disabled={createAdesaoPedido.isPending} onClick={() => {
                                    const codigo = adesaoPedidoCrti.trim();
                                    if (!codigo) return toast.error("Informe o codigo do pedido CRTI.");
                                    createAdesaoPedido.mutate({ adesaoId: item.id, licitacaoId: selectedLicitacao.id, pedidoCrti: codigo });
                                  }}><Link2 size={14} /> Vincular Pedido</button>
                                  <span><small>Quantidade da adesao</small><strong>{formatDecimal(item.quantidade)}</strong></span>
                                  <span><small>Saldo atual</small><strong>{formatSaldoEntrega(adesaoPedidosCrti.data?.saldoEntrega ?? item.saldoEntrega)}</strong></span>
                                </div>
                                <div className="desktop-table-scroll licitacao-adesao-pedidos-list">
                                  <table className="desktop-table">
                                    <thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Status</th><th>Quantidade</th><th>Valor</th><th>Acoes</th></tr></thead>
                                    <tbody>
                                      {(adesaoPedidosCrti.data?.items || []).map((pedido: any) => (
                                        <tr key={pedido.id}>
                                          <td>{pedido.pedidoCrti}</td><td>{normalizeText(pedido.cliente)}</td><td>{formatDateBR(pedido.dataPedido)}</td><td>{normalizeText(pedido.statusPedido)}</td><td className="num">{formatDecimal(pedido.quantidade)}</td><td className="num">{formatCurrency(pedido.valorTotal)}</td>
                                          <td><button type="button" className="mini-icon-button danger" title="Desvincular pedido" onClick={() => setDeleteAdesaoPedidoTarget({ pedido, adesao: item })}><Trash2 size={14} /></button></td>
                                        </tr>
                                      ))}
                                      {!adesaoPedidosCrti.isLoading && !(adesaoPedidosCrti.data?.items || []).length && <tr><td colSpan={7} className="desktop-empty">Nenhum pedido CRTI vinculado.</td></tr>}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {!adesoes.isLoading && !(adesoes.data?.items || []).length && <tr><td colSpan={9} className="desktop-empty">Nenhuma adesao cadastrada.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </SimpleModal>
      )}

      {modal === "entrega" && (
        <SimpleModal title="Vincular Pedido CRTI Controle de Entrega" onClose={() => setModal(null)} delivery>
          <section className="licitacao-delivery-list">
            <div className="licitacao-delivery-columns" aria-hidden="true">
              <span></span>
              <strong>ORGAO</strong>
              <strong>Cidade</strong>
              <strong>Item</strong>
              <strong>Tipo</strong>
              <strong>Status</strong>
              <strong>Saldo</strong>
            </div>
            {adjudicadasPendentes.length === 0 ? (
              <div className="desktop-empty">Nenhuma licitacao adjucada com saldo pendente.</div>
            ) : adjudicadasPendentes.map((licitacao: any) => {
              const isOpen = Boolean(openEntregaGroups[licitacao.id]);
              const isSelected = selectedLicitacao?.id === licitacao.id;
              const saldoEntrega = numberValue(licitacao.saldoEntrega);
              const statusEntrega = Math.abs(saldoEntrega) < 0.001 ? "PEDIDO ENTREGUE" : "ENTREGA TOTAL PENDENTE";
              return (
                <article className="licitacao-delivery-group" key={licitacao.id}>
                  <button type="button" className="licitacao-group-header" onClick={() => { setSelectedLicitacao(licitacao); setOpenEntregaGroups((current) => ({ ...current, [licitacao.id]: !isOpen })); }}>
                    <span>{isOpen ? "-" : "+"}</span>
                    <strong>
                      <em>{normalizeText(licitacao.orgao)}</em>
                      <i>{normalizeText(licitacao.cidade)}</i>
                      <span className="licitacao-group-item">{normalizeText(licitacao.item)}</span>
                      <span className="licitacao-group-type">{normalizeText(licitacao.tipo)}</span>
                      <small>{statusEntrega}</small>
                    </strong>
                    <b>{formatSaldoEntregaResumo(saldoEntrega)}</b>
                  </button>
                  {isOpen && (
                    <div className="licitacao-group-body">
                      <section className="licitacao-delivery-form">
                        <TextField label="Codigo Pedido CRTI" value={pedidoForm.pedidoCrti} onChange={(value) => setPedidoForm((current: any) => ({ ...current, pedidoCrti: value }))} />
                        <button
                          type="button"
                          className="desktop-action primary"
                          onClick={() => submitPedidoCrti(licitacao)}
                        >
                          <Save size={14} /> Salvar
                        </button>
                        <div className="licitacao-delivery-quantity">
                          <span>Quantidade Licitacao</span>
                          <strong>{formatDecimal(licitacao.qtdeSc)}</strong>
                        </div>
                      </section>
                      {isSelected && (
                        <div className="desktop-table-scroll licitacao-list-scroll">
                          <table className="desktop-table licitacao-delivery-table">
                            <thead>
                              <tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Status</th><th>Qtde</th><th>Valor</th><th>Saldo Entrega</th><th>Acoes</th></tr>
                            </thead>
                            <tbody>
                              {(pedidosCrti.data?.items || []).map((pedido: any) => (
                                <tr key={pedido.id}>
                                  <td>{pedido.pedidoCrti}</td>
                                  <td>{normalizeText(pedido.cliente)}</td>
                                  <td>{formatDateBR(pedido.dataPedido)}</td>
                                  <td>{normalizeText(pedido.statusPedido)}</td>
                                  <td className="num">{formatDecimal(pedido.quantidade)}</td>
                                  <td className="num">{formatCurrency(pedido.valorTotal)}</td>
                                  <td className="num">{formatSaldoEntrega(pedidosCrti.data?.saldoEntrega || 0)}</td>
                                  <td>
                                    <button
                                      type="button"
                                      className="mini-icon-button danger"
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setSelectedLicitacao(licitacao);
                                        setDeletePedidoTarget({ pedido, licitacao });
                                      }}
                                      title="Desvincular pedido"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </SimpleModal>
      )}

      <SapDoubleConfirmDialog
        open={Boolean(deleteLicitacaoTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteLicitacaoTarget(null);
        }}
        title="Confirmar exclusão de licitação"
        description="Esta ação vai excluir a licitação selecionada."
        finalDescription="Confirmação final: depois de continuar, a licitação será excluída."
        details={[
          { label: "Órgão", value: normalizeText(deleteLicitacaoTarget?.orgao) || "-" },
          { label: "Cidade", value: normalizeText(deleteLicitacaoTarget?.cidade) || "-" },
          { label: "Status", value: normalizeText(deleteLicitacaoTarget?.status) || "-" },
        ]}
        isPending={deleteLicitacao.isPending}
        onConfirm={() => {
          if (!deleteLicitacaoTarget?.id) return;
          deleteLicitacao.mutate(deleteLicitacaoTarget.id, { onSettled: () => setDeleteLicitacaoTarget(null) });
        }}
      />

      <SapDoubleConfirmDialog
        open={Boolean(deleteSimpleTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteSimpleTarget(null);
        }}
        title="Confirmar exclusão"
        description="Esta ação vai excluir o cadastro selecionado."
        finalDescription="Confirmação final: depois de continuar, o cadastro será excluído."
        details={[
          { label: "Tipo", value: deleteSimpleTarget?.kind ? normalizeText(deleteSimpleTarget.kind) : "-" },
          { label: "Nome", value: normalizeText(deleteSimpleTarget?.item?.nome) || "-" },
        ]}
        isPending={Boolean(deleteSimpleTarget?.remove?.isPending)}
        onConfirm={() => {
          if (!deleteSimpleTarget?.item?.id) return;
          deleteSimpleTarget.remove.mutate(deleteSimpleTarget.item.id, { onSettled: () => setDeleteSimpleTarget(null) });
        }}
      />

      <SapDoubleConfirmDialog
        open={Boolean(deletePedidoTarget)}
        onOpenChange={(open) => {
          if (!open) setDeletePedidoTarget(null);
        }}
        title="Confirmar desvínculo de pedido CRTI"
        description="Esta ação vai desvincular o pedido do controle de entrega."
        finalDescription="Confirmação final: depois de continuar, o pedido CRTI será desvinculado desta licitação."
        finalConfirmLabel="Desvincular pedido"
        details={[
          { label: "Licitação", value: normalizeText(deletePedidoTarget?.licitacao?.orgao) || "-" },
          { label: "Pedido", value: deletePedidoTarget?.pedido?.pedidoCrti ?? "-" },
          { label: "Cliente", value: normalizeText(deletePedidoTarget?.pedido?.cliente) || "-" },
        ]}
        isPending={deletePedido.isPending}
        onConfirm={() => {
          const pedidoId = Number(deletePedidoTarget?.pedido?.id);
          const licitacaoId = Number(deletePedidoTarget?.licitacao?.id);

          if (!pedidoId || !licitacaoId) {
            toast.error("Não foi possível identificar o pedido para desvincular.");
            return;
          }

          deletePedido.mutate(
            { id: pedidoId, licitacaoId },
            { onSuccess: () => setDeletePedidoTarget(null) },
          );
        }}
      />

      <SapDoubleConfirmDialog
        open={Boolean(deleteAdesaoTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteAdesaoTarget(null);
        }}
        title="Confirmar exclusao de adesao"
        description="Esta acao vai excluir a adesao e todos os pedidos CRTI vinculados a ela."
        finalDescription="Confirmacao final: a adesao e seus vinculos de entrega serao excluidos definitivamente."
        finalConfirmLabel="Excluir adesao"
        details={[
          { label: "Licitacao", value: normalizeText(deleteAdesaoTarget?.licitacao?.orgao) || "-" },
          { label: "Orgao aderente", value: normalizeText(deleteAdesaoTarget?.adesao?.orgaoAderente) || "-" },
          { label: "Quantidade", value: formatDecimal(deleteAdesaoTarget?.adesao?.quantidade || 0) },
          { label: "Pedidos vinculados", value: deleteAdesaoTarget?.adesao?.totalPedidos ?? 0 },
        ]}
        isPending={deleteAdesao.isPending}
        onConfirm={() => {
          const adesaoId = Number(deleteAdesaoTarget?.adesao?.id);
          const licitacaoId = Number(deleteAdesaoTarget?.licitacao?.id);
          if (!adesaoId || !licitacaoId) return toast.error("Nao foi possivel identificar a adesao para excluir.");
          deleteAdesao.mutate(
            { id: adesaoId, licitacaoId },
            { onSuccess: () => setDeleteAdesaoTarget(null) },
          );
        }}
      />

      <SapDoubleConfirmDialog
        open={Boolean(deleteAdesaoPedidoTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteAdesaoPedidoTarget(null);
        }}
        title="Confirmar desvinculo de pedido CRTI"
        description="Esta acao vai remover o pedido do controle de entrega do orgao aderente."
        finalDescription="Confirmacao final: o pedido sera desvinculado e sua quantidade retornara ao saldo da adesao."
        finalConfirmLabel="Desvincular pedido"
        details={[
          { label: "Orgao aderente", value: normalizeText(deleteAdesaoPedidoTarget?.adesao?.orgaoAderente) || "-" },
          { label: "Pedido", value: deleteAdesaoPedidoTarget?.pedido?.pedidoCrti ?? "-" },
          { label: "Cliente", value: normalizeText(deleteAdesaoPedidoTarget?.pedido?.cliente) || "-" },
          { label: "Quantidade", value: formatDecimal(deleteAdesaoPedidoTarget?.pedido?.quantidade || 0) },
        ]}
        isPending={deleteAdesaoPedido.isPending}
        onConfirm={() => {
          const pedidoId = Number(deleteAdesaoPedidoTarget?.pedido?.id);
          const adesaoId = Number(deleteAdesaoPedidoTarget?.adesao?.id);
          if (!pedidoId || !adesaoId) return toast.error("Nao foi possivel identificar o pedido para desvincular.");
          deleteAdesaoPedido.mutate(
            { id: pedidoId, adesaoId },
            { onSuccess: () => setDeleteAdesaoPedidoTarget(null) },
          );
        }}
      />
    </main>
  );
}
