import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRightLeft,
  BarChart3,
  ChevronDown,
  Download,
  PackageSearch,
  Pencil,
  Plus,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
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
  numero: `COT-${new Date().getFullYear()}-`,
  titulo: "",
  dataOrcamento: new Date().toISOString().slice(0, 10),
  status: "EM_COTACAO",
  observacoes: "",
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

type SearchOption = {
  value: string;
  label: string;
  detail?: string;
};

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
    | "historico"
  >("orcamentos");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const detail = trpc.compras.obterOrcamento.useQuery(
    { id: editingId || 1 },
    { enabled: Boolean(editingId && open) }
  );
  const refresh = () => utils.compras.painel.invalidate();
  const saveOptions = {
    onSuccess: () => {
      toast.success("Orçamento salvo com sucesso.");
      setOpen(false);
      setEditingId(null);
      refresh();
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
  useEffect(() => {
    if (!detail.data) return;
    const o: any = detail.data.orcamento;
    const offers: any[] = detail.data.ofertas as any[];
    setForm({
      numero: o.numero,
      titulo: o.titulo,
      dataOrcamento: String(o.data_orcamento).slice(0, 10),
      status: o.status,
      observacoes: o.observacoes || "",
      fornecedorEscolhidoId: o.fornecedor_escolhido_id || null,
      valorCotado: Number(o.valor_cotado || 0),
      valorNegociado: Number(o.valor_negociado || 0),
      valorPago: Number(o.valor_pago || 0),
      itens: (detail.data.itens as any[]).map(i => ({
        ...i,
        quantidade: Number(i.quantidade),
        ofertas: offers
          .filter(x => x.itemId === i.id)
          .map(x => ({
            ...x,
            valorUnitario: Number(x.valorUnitario),
            prazoEntrega: x.prazoEntrega || "",
            condicaoPagamento: x.condicaoPagamento || "",
            selecionada: Boolean(x.selecionada),
          })),
      })),
    });
  }, [detail.data]);
  const suggestedTotal = useMemo(
    () =>
      form.itens.reduce((sum, item) => {
        const values = item.ofertas
          .map(o => Number(o.valorUnitario || 0) * Number(item.quantidade || 0))
          .filter(v => v > 0);
        return sum + (values.length ? Math.min(...values) : 0);
      }, 0),
    [form.itens]
  );
  const activeSuppliers = useMemo(
    () => ((data?.fornecedores as any[]) || []).filter(f => f.ativo),
    [data?.fornecedores]
  );
  const activeMaterials = useMemo(
    () => ((data?.materiais as any[]) || []).filter(m => m.ativo),
    [data?.materiais]
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
  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  };
  const openEdit = (id: number) => {
    setEditingId(id);
    setOpen(true);
  };
  const submit = () => {
    if (
      !form.numero.trim() ||
      !form.titulo.trim() ||
      form.itens.some(i => !i.materialId || !i.descricao.trim())
    )
      return toast.error(
        "Preencha número, objeto da cotação e selecione o material de todos os itens."
      );

    if (
      form.itens.some(item =>
        item.ofertas.some(oferta => !Number(oferta.fornecedorId))
      )
    ) {
      return toast.error(
        "Selecione um fornecedor em todas as propostas ou remova a proposta vazia."
      );
    }

    if (
      form.itens.some(item => {
        const ids = item.ofertas.map(oferta => Number(oferta.fornecedorId));
        return new Set(ids).size !== ids.length;
      })
    ) {
      return toast.error(
        "O mesmo fornecedor não pode aparecer duas vezes no mesmo item."
      );
    }

    const payload = {
      ...form,
      valorCotado: form.valorCotado || suggestedTotal,
    };
    editingId
      ? updateQuote.mutate({ ...payload, id: editingId } as any)
      : createQuote.mutate(payload as any);
  };
  const exportCsv = () => {
    const rows = [
      [
        "Número",
        "Data",
        "Título",
        "Status",
        "Fornecedor escolhido",
        "Valor cotado",
        "Valor negociado",
        "Valor pago",
      ],
      ...((data?.orcamentos || []) as any[]).map(o => [
        o.numero,
        o.dataOrcamento,
        o.titulo,
        STATUS[o.status],
        o.fornecedorEscolhido || "",
        o.valorCotado,
        o.valorNegociado,
        o.valorPago,
      ]),
    ];
    const blob = new Blob(
      [
        "\ufeff" +
          rows
            .map(r =>
              r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";")
            )
            .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "controle-compras.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <main className="compras-page">
      <header>
        <div>
          <ShoppingCart />
          <h1>
            CONTROLE DE COMPRAS
            <small>Cotações, comparativos e histórico de aquisições</small>
          </h1>
        </div>
        <button onClick={() => navigate("/")}>← Voltar</button>
      </header>
      <nav>
        {[
          ["orcamentos", "Orçamentos", BarChart3],
          ["fornecedores", "Fornecedores", Users],
          ["fornecedor_item", "Fornecedor Item", Users],
          ["materiais", "Materiais", PackageSearch],
          ["historico", "Carga histórica", Download],
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
      </nav>
      {tab === "orcamentos" && (
        <section>
          <div className="compras-toolbar">
            <button className="primary" onClick={openNew}>
              <Plus size={16} />
              Novo orçamento
            </button>
            <button onClick={exportCsv}>
              <Download size={16} />
              Excel
            </button>
          </div>
          <div className="compras-cards">
            <article>
              <span>Orçamentos</span>
              <b>{data?.orcamentos.length || 0}</b>
            </article>
            <article>
              <span>Valor cotado</span>
              <b>
                {money(
                  ((data?.orcamentos as any[]) || []).reduce(
                    (s, o) => s + Number(o.valorCotado || 0),
                    0
                  )
                )}
              </b>
            </article>
            <article>
              <span>Valor pago</span>
              <b>
                {money(
                  ((data?.orcamentos as any[]) || []).reduce(
                    (s, o) => s + Number(o.valorPago || 0),
                    0
                  )
                )}
              </b>
            </article>
          </div>
          <div className="compras-table">
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Data</th>
                  <th>Objeto da cotação</th>
                  <th>Status</th>
                  <th>Itens</th>
                  <th>Fornecedor escolhido</th>
                  <th>Cotado</th>
                  <th>Negociado</th>
                  <th>Pago</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={10}>Carregando...</td>
                  </tr>
                ) : ((data?.orcamentos || []) as any[]).length === 0 ? (
                  <tr>
                    <td colSpan={10} className="compras-empty">
                      Nenhum orçamento cadastrado. Os fornecedores e materiais
                      da planilha ficam disponíveis após a execução da carga
                      histórica no servidor.
                    </td>
                  </tr>
                ) : (
                  ((data?.orcamentos || []) as any[]).map(o => (
                    <tr key={o.id}>
                      <td>{o.numero}</td>
                      <td>
                        {String(o.dataOrcamento).split("-").reverse().join("/")}
                      </td>
                      <td>{o.titulo}</td>
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
        </section>
      )}
      {tab === "fornecedores" && (
        <Cadastro
          tipo="fornecedor"
          categoriaFornecedor="NOTA"
          items={((data?.fornecedores || []) as any[]).filter(
            fornecedor => fornecedor.fornecedorNota
          )}
          refresh={refresh}
        />
      )}{" "}
      {tab === "fornecedor_item" && (
        <Cadastro
          tipo="fornecedor"
          categoriaFornecedor="ITEM"
          items={((data?.fornecedores || []) as any[]).filter(
            fornecedor => fornecedor.fornecedorItem
          )}
          refresh={refresh}
        />
      )}{" "}
      {tab === "materiais" && (
        <Cadastro
          tipo="material"
          items={data?.materiais || []}
          refresh={refresh}
        />
      )}{" "}
      {tab === "historico" && (
        <section className="compras-table">
          <h2>Cargas da planilha</h2>
          <table>
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Data</th>
                <th>Status</th>
                <th>Resumo</th>
              </tr>
            </thead>
            <tbody>
              {((data?.historico || []) as any[]).map(x => (
                <tr key={x.id}>
                  <td>{x.arquivo}</td>
                  <td>{new Date(x.criadoEm).toLocaleString("pt-BR")}</td>
                  <td>{x.status}</td>
                  <td>{x.resumo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {open && (
        <div className="compras-overlay">
          <div className="compras-modal">
            <button className="close" onClick={() => setOpen(false)}>
              <X />
            </button>
            <div className="compras-modal-heading">
              <span className="compras-modal-kicker">Controle de Compras</span>
              <h2>{editingId ? "Editar orçamento" : "Cadastrar orçamento"}</h2>
              <p>
                Registre a cotação, selecione os materiais cadastrados e compare
                as propostas recebidas.
              </p>
            </div>
            <h3 className="compras-section-title">Dados gerais</h3>
            <div className="form-grid">
              <label>
                Número do orçamento
                <input
                  value={form.numero}
                  onChange={e => setForm({ ...form, numero: e.target.value })}
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
              <label className="wide">
                Objeto da cotação
                <input
                  value={form.titulo}
                  onChange={e => setForm({ ...form, titulo: e.target.value })}
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
              {["valorCotado", "valorNegociado", "valorPago"].map(k => (
                <label key={k}>
                  {
                    (
                      {
                        valorCotado: "Valor cotado",
                        valorNegociado: "Valor negociado",
                        valorPago: "Valor pago",
                      } as any
                    )[k]
                  }
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={(form as any)[k]}
                    onChange={e =>
                      setForm({ ...form, [k]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
            <h3 className="compras-section-title">
              Itens e propostas de fornecedores
            </h3>
            <p className="compras-section-help">
              Selecione um material do cadastro, informe a quantidade e registre
              uma ou mais propostas para comparação.
            </p>
            {form.itens.map((item, idx) => (
              <div className="compra-item" key={idx}>
                <div className="compra-item-title">
                  <strong>Item {idx + 1}</strong>
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
                          unidade: material.unidade || item.unidade || "UN",
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
                    <input
                      aria-label={`Unidade do item ${idx + 1}`}
                      value={item.unidade}
                      readOnly
                      title="Unidade definida no cadastro do material"
                    />
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
                    <span>Fornecedor do item</span>
                    <span>Valor unitário</span>
                    <span>Prazo de entrega</span>
                    <span>Ação</span>
                  </div>
                )}
                {item.ofertas.map((oferta: any, oi: number) => (
                  <div className="oferta" key={oi}>
                    <SearchableSelect
                      value={String(oferta.fornecedorId || "")}
                      options={itemSupplierOptions}
                      placeholder="Selecione o fornecedor"
                      searchPlaceholder="Pesquisar fornecedor..."
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
                    <input
                      type="number"
                      placeholder="Valor unitário"
                      value={oferta.valorUnitario}
                      onChange={e => {
                        const itens = [...form.itens];
                        item.ofertas[oi] = {
                          ...oferta,
                          valorUnitario: Number(e.target.value),
                        };
                        itens[idx] = { ...item };
                        setForm({ ...form, itens });
                      }}
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
                  disabled={
                    itemSupplierOptions.length === 0
                  }
                  title={
                    itemSupplierOptions.length > 0
                      ? "Adicionar proposta de fornecedor"
                      : "Cadastre ou importe ao menos um fornecedor"
                  }
                  onClick={() => {
                    const primeiroFornecedor = itemSupplierOptions[0];
                    if (!primeiroFornecedor) {
                      toast.error(
                        "Cadastre um fornecedor ou aplique a carga histórica antes de adicionar propostas."
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
                          prazoEntrega: "",
                          condicaoPagamento: "",
                          selecionada: false,
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

function Cadastro({
  tipo,
  items,
  refresh,
  categoriaFornecedor = "NOTA",
}: {
  tipo: "fornecedor" | "material";
  items: any[];
  refresh: () => void;
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
    onSuccess: () => {
      toast.success("Cadastro inativado.");
      setTarget(null);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const transfer = trpc.compras.atualizarClassificacaoFornecedor.useMutation({
    onSuccess: () => {
      toast.success(
        categoriaFornecedor === "NOTA"
          ? "Fornecedor movido para Fornecedor Item."
          : "Fornecedor movido para Fornecedores."
      );
      setTransferTarget(null);
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
            ? "Cadastro de fornecedores do item"
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
            else
              form.id
                ? updateM.mutate(payload)
                : createM.mutate(payload);
          }}
        >
          <Save size={15} />
          Salvar
        </button>
      </div>
      <div className="compras-table">
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
            {items.map(x => (
              <tr key={x.id}>
                {Object.keys(blank)
                  .filter(k => k !== "ativo")
                  .map(k => (
                    <td>{x[k] || "—"}</td>
                  ))}
                <td>{x.origemPlanilha ? "Planilha" : "Sistema"}</td>
                <td>
                  <button
                    onClick={() =>
                      setForm({
                        ...blank,
                        ...x,
                        ativo: Boolean(x.ativo),
                        ...(tipo === "fornecedor"
                          ? {
                              documento: x.documento ?? "",
                              telefone: x.telefone ?? "",
                              email: x.email ?? "",
                              endereco: x.endereco ?? "",
                            }
                          : {
                              categoria: x.categoria ?? "",
                              unidade: x.unidade ?? "",
                            }),
                      })
                    }
                  >
                    <Pencil size={15} />
                  </button>
                  {tipo === "fornecedor" && (
                    <button
                      title={
                        categoriaFornecedor === "NOTA"
                          ? "Mover para Fornecedor Item"
                          : "Mover para Fornecedores"
                      }
                      aria-label={
                        categoriaFornecedor === "NOTA"
                          ? "Mover para Fornecedor Item"
                          : "Mover para Fornecedores"
                      }
                      onClick={() => setTransferTarget(x)}
                    >
                      <ArrowRightLeft size={15} />
                    </button>
                  )}
                  <button onClick={() => setTarget(x)}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SapDoubleConfirmDialog
        open={Boolean(transferTarget)}
        onOpenChange={o => !o && setTransferTarget(null)}
        title="Confirmar transferência de fornecedor"
        description="O cadastro será movido para a outra lista de fornecedores sem alterar seu histórico."
        finalDescription="Confirma a transferência? Orçamentos já vinculados continuarão preservados."
        details={
          transferTarget
            ? [
                { label: "Fornecedor", value: transferTarget.nome },
                {
                  label: "Destino",
                  value:
                    categoriaFornecedor === "NOTA"
                      ? "Fornecedor Item"
                      : "Fornecedores da nota",
                },
              ]
            : []
        }
        onConfirm={() =>
          transfer.mutate({
            id: transferTarget.id,
            tipoFornecedor:
              categoriaFornecedor === "NOTA" ? "ITEM" : "NOTA",
          })
        }
        isPending={transfer.isPending}
      />
      <SapDoubleConfirmDialog
        open={Boolean(target)}
        onOpenChange={o => !o && setTarget(null)}
        title="Confirmar inativação"
        description="O cadastro deixará de aparecer em novas cotações."
        finalDescription="Confirma a inativação? O histórico será mantido."
        details={
          target
            ? [{ label: "Cadastro", value: target.nome || target.descricao }]
            : []
        }
        onConfirm={() =>
          del.mutate({
            tipo,
            id: target.id,
            motivo: "Inativação confirmada em duas etapas",
          })
        }
        isPending={del.isPending}
      />
    </section>
  );
}
