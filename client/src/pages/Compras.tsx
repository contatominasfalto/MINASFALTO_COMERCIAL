import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  BarChart3,
  Download,
  PackageSearch,
  Pencil,
  Plus,
  Save,
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

export default function Compras() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.compras.painel.useQuery();
  const [tab, setTab] = useState<
    "orcamentos" | "fornecedores" | "materiais" | "historico"
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
      form.itens.some(i => !i.descricao.trim())
    )
      return toast.error("Preencha número, título e todos os itens.");

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
          items={data?.fornecedores || []}
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
            <h2>{editingId ? "Editar" : "Novo"} orçamento</h2>
            <div className="form-grid">
              <label>
                Número
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
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value })}
                >
                  {Object.entries(STATUS).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v as string}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fornecedor escolhido
                <select
                  value={form.fornecedorEscolhidoId || ""}
                  onChange={e =>
                    setForm({
                      ...form,
                      fornecedorEscolhidoId: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                >
                  <option value="">Selecione</option>
                  {((data?.fornecedores as any[]) || [])
                    .filter(f => f.ativo)
                    .map(f => (
                      <option value={f.id}>{f.nome}</option>
                    ))}
                </select>
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
            <h3>Itens e propostas</h3>
            {form.itens.map((item, idx) => (
              <div className="compra-item" key={idx}>
                <div>
                  <input
                    placeholder="Material / serviço"
                    value={item.descricao}
                    onChange={e => {
                      const itens = [...form.itens];
                      itens[idx] = { ...item, descricao: e.target.value };
                      setForm({ ...form, itens });
                    }}
                  />
                  <input
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
                  <input
                    value={item.unidade}
                    onChange={e => {
                      const itens = [...form.itens];
                      itens[idx] = { ...item, unidade: e.target.value };
                      setForm({ ...form, itens });
                    }}
                  />
                  <button
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
                {item.ofertas.map((oferta: any, oi: number) => (
                  <div className="oferta" key={oi}>
                    <select
                      value={oferta.fornecedorId}
                      onChange={e => {
                        const itens = [...form.itens];
                        item.ofertas[oi] = {
                          ...oferta,
                          fornecedorId: Number(e.target.value),
                        };
                        itens[idx] = { ...item };
                        setForm({ ...form, itens });
                      }}
                    >
                      <option value="">Fornecedor</option>
                      {((data?.fornecedores as any[]) || [])
                        .filter(f => f.ativo)
                        .map(f => (
                          <option value={f.id}>{f.nome}</option>
                        ))}
                    </select>
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
                  disabled={!((data?.fornecedores as any[]) || []).some(
                    fornecedor => fornecedor.ativo
                  )}
                  title={
                    ((data?.fornecedores as any[]) || []).some(
                      fornecedor => fornecedor.ativo
                    )
                      ? "Adicionar proposta de fornecedor"
                      : "Cadastre ou importe ao menos um fornecedor"
                  }
                  onClick={() => {
                    const primeiroFornecedor = (
                      (data?.fornecedores as any[]) || []
                    ).find(fornecedor => fornecedor.ativo);
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
                          fornecedorId: Number(primeiroFornecedor.id),
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
}: {
  tipo: "fornecedor" | "material";
  items: any[];
  refresh: () => void;
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
  return (
    <section className="cadastro">
      <h2>
        Cadastro de {tipo === "fornecedor" ? "fornecedores" : "materiais"}
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
            if (tipo === "fornecedor") form.id ? updateF.mutate(form) : createF.mutate(form);
            else form.id ? updateM.mutate(form) : createM.mutate(form);
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
                  <button onClick={() => setForm(x)}>
                    <Pencil size={15} />
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
