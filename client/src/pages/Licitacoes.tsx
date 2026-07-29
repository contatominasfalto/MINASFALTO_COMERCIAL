import { trpc } from "@/lib/trpc";
import { withAppBase } from "@/lib/app-base";
import minasfaltoLogo from "@/assets/minasfalto-logo.jpg";
import {
  ArrowLeft,
  ExternalLink,
  Link2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const defaultStatus = ["Pendente", "Encerrado", "Documentacao Separada", "Adjudicado"];
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

function SimpleModal({
  title,
  children,
  onClose,
  wide = false,
  menu = false,
  delivery = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  menu?: boolean;
  delivery?: boolean;
}) {
  return (
    <div className="desktop-modal-backdrop licitacao-modal-backdrop">
      <section className={delivery ? "licitacao-modal licitacao-modal-delivery" : wide ? "licitacao-modal licitacao-modal-wide" : menu ? "licitacao-modal licitacao-modal-menu" : "licitacao-modal"}>
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

export default function Licitacoes() {
  const utils = trpc.useUtils();
  const [modal, setModal] = useState<ActiveModal>("menu");
  const [panelTab, setPanelTab] = useState<PanelTab>("geral");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("data");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [editingLicitacao, setEditingLicitacao] = useState<Licitacao | null>(null);
  const [licitacaoForm, setLicitacaoForm] = useState<any>(emptyLicitacao);
  const [cidadeMode, setCidadeMode] = useState("lista");
  const [simpleEdit, setSimpleEdit] = useState<any>(null);
  const [simpleForm, setSimpleForm] = useState<any>({ nome: "", link: "" });
  const [selectedLicitacao, setSelectedLicitacao] = useState<Licitacao | null>(null);
  const [pedidoForm, setPedidoForm] = useState<any>({ pedidoCrti: "", cliente: "", dataPedido: "", statusPedido: "", quantidade: 0, valorTotal: 0, observacoes: "" });
  const [pedidoEdit, setPedidoEdit] = useState<any>(null);
  const [openEntregaGroups, setOpenEntregaGroups] = useState<Record<number, boolean>>({});
  const [ataForm, setAtaForm] = useState<any>({ vendedorId: null, vendedorNome: "NA", validadeAta: "", quantidadeOriginal: 0, observacoes: "" });

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
  const invalidateAll = () => {
    void utils.licitacoes.list.invalidate();
    void utils.licitacoes.opcoes.invalidate();
    void utils.licitacoes.pedidosCrti.list.invalidate();
    void utils.licitacoes.ata.get.invalidate();
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
  const createPedido = trpc.licitacoes.pedidosCrti.create.useMutation({
    onSuccess: () => {
      toast.success("Pedido vinculado.");
      setPedidoForm({ pedidoCrti: "", cliente: "", dataPedido: "", statusPedido: "", quantidade: 0, valorTotal: 0, observacoes: "" });
      invalidateAll();
    },
    onError: (error) => toast.error(`Erro ao vincular pedido: ${error.message}`),
  });
  const updatePedido = trpc.licitacoes.pedidosCrti.update.useMutation({
    onSuccess: () => {
      toast.success("Pedido atualizado.");
      setPedidoEdit(null);
      invalidateAll();
    },
    onError: (error) => toast.error(`Erro ao atualizar pedido: ${error.message}`),
  });
  const deletePedido = trpc.licitacoes.pedidosCrti.delete.useMutation({ onSuccess: () => { toast.success("Pedido removido."); invalidateAll(); } });

  const statuses = [...defaultStatus, ...(opcoes.data?.status || []).map((item: any) => item.nome)].filter((value, index, arr) => value && arr.indexOf(value) === index);
  const vendedores = opcoes.data?.vendedores || [];
  const plataformas = opcoes.data?.plataformas || [];
  const rows = useMemo(() => {
    const data = [...(licitacoes.data || [])];
    return data.sort((left, right) => {
      const a = String(left[sortKey] ?? "");
      const b = String(right[sortKey] ?? "");
      const result = a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
      return sortDirection === "asc" ? result : -result;
    });
  }, [licitacoes.data, sortKey, sortDirection]);

  const sortBy = (key: string) => {
    if (sortKey === key) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const openLicitacaoForm = (licitacao?: Licitacao) => {
    setEditingLicitacao(licitacao || null);
    setLicitacaoForm(licitacao ? { ...emptyLicitacao, ...licitacao } : emptyLicitacao);
    setCidadeMode(licitacao?.cidade && !cidadesMg.includes(licitacao.cidade) ? "outra" : "lista");
    setModal("licitacao");
  };

  const submitLicitacao = () => {
    const payload = {
      ...licitacaoForm,
      orgao: normalizeText(licitacaoForm.orgao),
      cidade: normalizeText(licitacaoForm.cidade),
      item: normalizeText(licitacaoForm.item),
      tipo: normalizeText(licitacaoForm.tipo),
      regiao: normalizeText(licitacaoForm.regiao),
    };
    if (editingLicitacao) updateLicitacao.mutate({ id: editingLicitacao.id, data: payload });
    else createLicitacao.mutate(payload);
  };

  const openAta = (licitacao: Licitacao) => {
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
                    <button className="mini-icon-button danger" onClick={() => remove.mutate(item.id)}><Trash2 size={14} /></button>
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

      <section className="desktop-tabs">
        <button className={panelTab === "geral" ? "active" : ""} onClick={() => setPanelTab("geral")}>PAINEL PRINCIPAL</button>
        <button className={panelTab === "adjudicadas" ? "active" : ""} onClick={() => setPanelTab("adjudicadas")}>ADJUDICADOS</button>
      </section>

      <section className="desktop-grid-frame licitacao-grid-frame">
        <div className="desktop-table-scroll">
          <table className="desktop-table licitacao-table">
            <thead>
              <tr>
                {[
                  ["data", "Data"],
                  ["orgao", "Orgao"],
                  ["cidade", "Cidade"],
                  ["status", "Status"],
                  ["item", "Item"],
                  ["tipo", "Tipo"],
                  ["qtdeSc", "Qtde SC"],
                  ["valorUnit", "Valor Unit"],
                  ["lanceLimite", "Lance Limite"],
                  ["valorAdjudicado", "Valor Adjudicado"],
                  ["qtdeTn", "Qtde TN"],
                  ["valorInicialContrato", "Valor Inicial Contrato"],
                  ["kmDistancia", "KM"],
                  ["potencialCliente", "Potencial"],
                  ["regiao", "Regiao"],
                ].map(([key, label]) => <th key={key} onClick={() => sortBy(key)}>{label}</th>)}
                {panelTab === "adjudicadas" && (
                  <>
                    <th>Status Contrato</th>
                    <th>Ata Vendedor</th>
                    <th>Ata</th>
                  </>
                )}
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {licitacoes.isLoading ? (
                <tr><td colSpan={panelTab === "adjudicadas" ? 19 : 16} className="desktop-empty">Carregando licitacoes...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={panelTab === "adjudicadas" ? 19 : 16} className="desktop-empty">Nenhuma licitacao encontrada</td></tr>
              ) : rows.map((licitacao) => (
                <tr key={licitacao.id}>
                  <td>{formatDateBR(licitacao.data)}</td>
                  <td title={licitacao.orgao}>{normalizeText(licitacao.orgao)}</td>
                  <td>{normalizeText(licitacao.cidade)}</td>
                  <td>{normalizeText(licitacao.status)}</td>
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
                    <button className="mini-icon-button danger" onClick={() => deleteLicitacao.mutate(licitacao.id)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            <TextField label="Hora Inicio da Disputa" type="time" value={licitacaoForm.horaInicioDisputa} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, horaInicioDisputa: value }))} />
            <TextField label="Item" value={licitacaoForm.item} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, item: normalizeText(value) }))} />
            <TextField label="Tipo" value={licitacaoForm.tipo} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, tipo: normalizeText(value) }))} />
            <TextField label="Qtde SC" type="number" value={licitacaoForm.qtdeSc} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, qtdeSc: Number(value) }))} />
            <TextField label="Valor Unit" type="number" value={licitacaoForm.valorUnit} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, valorUnit: Number(value) }))} />
            <TextField label="Lance Limite" type="number" value={licitacaoForm.lanceLimite} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, lanceLimite: Number(value) }))} />
            <TextField label="Valor Adjudicado" type="number" value={licitacaoForm.valorAdjudicado} onChange={(value) => setLicitacaoForm((current: any) => ({ ...current, valorAdjudicado: Number(value) }))} />
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
        <SimpleModal title={`Controle de Ata - ${selectedLicitacao.orgao}`} onClose={() => setModal(null)} wide>
          <section className="licitacao-form-grid licitacao-form-grid-compact">
            <SelectField label="Vendedor" value={ataForm.vendedorId || "NA"} onChange={(value) => {
              const vendedor = vendedores.find((item: any) => String(item.id) === value);
              setAtaForm((current: any) => ({ ...current, vendedorId: vendedor?.id || null, vendedorNome: vendedor?.nome || "NA" }));
            }}>
              <option value="NA">NA</option>
              {vendedores.map((vendedor: any) => <option key={vendedor.id} value={vendedor.id}>{normalizeText(vendedor.nome)}</option>)}
            </SelectField>
            <TextField label="Validade Ata" type="date" value={ataForm.validadeAta || ata.data?.validadeAta || ""} onChange={(value) => setAtaForm((current: any) => ({ ...current, validadeAta: value }))} />
            <TextField label="Quantidade Original" type="number" value={ataForm.quantidadeOriginal} onChange={(value) => setAtaForm((current: any) => ({ ...current, quantidadeOriginal: Number(value) }))} />
            <label className="licitacao-field licitacao-readonly"><span>Limite Individual (50%)</span><strong>{formatDecimal(numberValue(ataForm.quantidadeOriginal) * 0.5)}</strong></label>
            <label className="licitacao-field licitacao-readonly"><span>Limite Coletivo (200%)</span><strong>{formatDecimal(numberValue(ataForm.quantidadeOriginal) * 2)}</strong></label>
          </section>
          <label className="licitacao-field">
            <span>Observacoes</span>
            <textarea value={ataForm.observacoes} onChange={(event) => setAtaForm((current: any) => ({ ...current, observacoes: normalizeText(event.target.value) }))} />
          </label>
          <footer className="licitacao-modal-actions">
            <button className="desktop-action primary" onClick={() => saveAta.mutate({ ...ataForm, licitacaoId: selectedLicitacao.id })}><Save size={14} /> Salvar Ata</button>
          </footer>
        </SimpleModal>
      )}

      {modal === "entrega" && (
        <SimpleModal title="Vincular Pedido CRTI Controle de Entrega" onClose={() => setModal(null)} delivery>
          <section className="licitacao-delivery-list">
            {(adjudicadas.data || []).map((licitacao: any) => {
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
                      <small>{statusEntrega}</small>
                    </strong>
                    <b>Saldo: {formatDecimal(saldoEntrega)}</b>
                  </button>
                  {isOpen && (
                    <div className="licitacao-group-body">
                      <section className="licitacao-delivery-form">
                        <TextField label="Codigo Pedido CRTI" value={pedidoForm.pedidoCrti} onChange={(value) => setPedidoForm((current: any) => ({ ...current, pedidoCrti: value }))} />
                        <button className="desktop-action primary" onClick={() => {
                          const codigoPedido = String(pedidoForm.pedidoCrti || "").trim();
                          if (!codigoPedido) {
                            toast.error("Informe o codigo do pedido CRTI.");
                            return;
                          }
                          const payload = { ...pedidoForm, pedidoCrti: codigoPedido, licitacaoId: licitacao.id, cliente: normalizeText(pedidoForm.cliente), observacoes: normalizeText(pedidoForm.observacoes) };
                          if (pedidoEdit) updatePedido.mutate({ id: pedidoEdit.id, data: payload });
                          else createPedido.mutate(payload);
                          setSelectedLicitacao(licitacao);
                        }}><Save size={14} /> Salvar</button>
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
                                  <td className="num">{formatDecimal(pedidosCrti.data?.saldoEntrega || 0)}</td>
                                  <td>
                                    <button className="mini-icon-button" onClick={() => { setPedidoEdit(pedido); setPedidoForm(pedido); }}><Pencil size={14} /></button>
                                    <button className="mini-icon-button danger" onClick={() => deletePedido.mutate({ id: pedido.id, licitacaoId: licitacao.id })}><Trash2 size={14} /></button>
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
    </main>
  );
}
