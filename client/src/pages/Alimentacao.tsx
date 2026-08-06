import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  BarChart3,
  Download,
  Plus,
  Save,
  Trash2,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./alimentacao.css";

const moeda = (v: unknown) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const hoje = () => new Date().toISOString().slice(0, 10);
type Tab = "painel" | "lancamentos" | "cadastros" | "relatorios";

export default function Alimentacao() {
  const [, nav] = useLocation();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<Tab>("painel");
  const cad = trpc.alimentacao.cadastros.useQuery();
  const painel = trpc.alimentacao.painel.useQuery();
  const [filtros, setFiltros] = useState<any>({ inicio: "", fim: "" });
  const rel = trpc.alimentacao.relatorio.useQuery(
    Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)) as any,
    { enabled: tab === "relatorios" }
  );
  const invalidar = async () => {
    await Promise.all([
      utils.alimentacao.cadastros.invalidate(),
      utils.alimentacao.painel.invalidate(),
      utils.alimentacao.relatorio.invalidate(),
    ]);
  };
  return (
    <main className="food-page">
      <header className="food-header">
        <div>
          <Utensils />
          <div>
            <h1>CONTROLE DE ALIMENTAÇÃO</h1>
            <small>Gestão de refeições e custos operacionais</small>
          </div>
        </div>
        <button onClick={() => nav("/")}>
          <ArrowLeft size={15} /> Voltar
        </button>
      </header>
      <nav className="food-tabs">
        {(
          [
            ["painel", "Painel"],
            ["lancamentos", "Lançamentos"],
            ["cadastros", "Cadastros"],
            ["relatorios", "Relatórios"],
          ] as const
        ).map(([k, l]) => (
          <button
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
            key={k}
          >
            {l}
          </button>
        ))}
      </nav>
      {tab === "painel" && <Painel data={painel.data} />}{" "}
      {tab === "lancamentos" && (
        <Lancamentos cad={cad.data} concluir={invalidar} />
      )}{" "}
      {tab === "cadastros" && (
        <Cadastros data={cad.data} concluir={invalidar} />
      )}{" "}
      {tab === "relatorios" && (
        <Relatorios
          cad={cad.data}
          rows={(rel.data || []) as any[]}
          filtros={filtros}
          setFiltros={setFiltros}
        />
      )}
    </main>
  );
}

function Painel({ data }: any) {
  const m = data?.metricas || {};
  return (
    <section className="food-content">
      <div className="food-cards">
        {[
          ["Lançamentos", m.lancamentos || 0],
          ["Refeições", m.refeicoes || 0],
          ["Custo total", moeda(m.custoTotal)],
          ["Média por refeição", moeda(m.media)],
          ["Funcionários atendidos", m.funcionariosAtivos || 0],
          ["Custos operacionais", moeda(m.custosOperacionais)],
        ].map(([l, v]) => (
          <article>
            <small>{l}</small>
            <strong>{v}</strong>
          </article>
        ))}
      </div>
      <div className="food-panels">
        <article>
          <h2>
            <BarChart3 /> Evolução mensal
          </h2>
          {(data?.evolucao || []).map((x: any) => (
            <div className="rank">
              <span>{x.mes}</span>
              <b>{moeda(x.total)}</b>
            </div>
          ))}
        </article>
        <article>
          <h2>Ranking de funcionários</h2>
          {(data?.ranking || []).map((x: any, i: number) => (
            <div className="rank">
              <span>
                {i + 1}. {x.nome}
              </span>
              <b>{moeda(x.total)}</b>
            </div>
          ))}
        </article>
        <article>
          <h2>Ranking de fornecedores</h2>
          {(data?.fornecedores || []).map((x: any, i: number) => (
            <div className="rank">
              <span>
                {i + 1}. {x.nome}
              </span>
              <b>{moeda(x.total)}</b>
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}

function Lancamentos({ cad, concluir }: any) {
  const api = trpc.useUtils();
  const historico = trpc.alimentacao.relatorio.useQuery({});
  const ativos = (cad?.funcionarios || []).filter((x: any) => x.ativo);
  const forns = (cad?.fornecedores || []).filter((x: any) => x.ativo);
  const [form, setForm] = useState<any>({
    fornecedorId: "",
    numeroNota: "",
    tipo: "almoco",
    dataRefeicao: hoje(),
    valorExtra: 0,
    observacao: "",
  });
  const [itens, setItens] = useState<any[]>([]);
  const [func, setFunc] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const criar = trpc.alimentacao.criarLancamento.useMutation({
    onSuccess: async () => {
      toast.success("Lançamento salvo.");
      setItens([]);
      setForm({ ...form, numeroNota: "", valorExtra: 0, observacao: "" });
      await concluir();
    },
    onError: e => toast.error(e.message),
  });
  const excluir = trpc.alimentacao.excluirLancamento.useMutation({
    onSuccess: async () => {
      toast.success("Lançamento excluído.");
      await historico.refetch();
      await concluir();
    },
    onError: e => toast.error(e.message),
  });
  const atualizar = trpc.alimentacao.atualizarLancamento.useMutation({
    onSuccess: async () => {
      toast.success("Lançamento atualizado.");
      setEditandoId(null);
      setItens([]);
      await historico.refetch();
      await concluir();
    },
    onError: e => toast.error(e.message),
  });
  const editar = async (id: number) => {
    const dados = await api.alimentacao.obterLancamento.fetch({ id });
    setEditandoId(id);
    setForm({
      fornecedorId: String(dados.fornecedorId),
      numeroNota: dados.numeroNota || "",
      tipo: dados.tipo,
      dataRefeicao: dados.dataRefeicao,
      valorExtra: Number(dados.valorExtra),
      observacao: dados.observacao || "",
    });
    setItens(
      (dados.itens as any[]).map(x => ({
        ...x,
        quantidade: Number(x.quantidade),
        valorUnitario: Number(x.valorUnitario),
      }))
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const confirmarExclusao = (id: number) => {
    const motivo = window.prompt("Informe o motivo da exclusão:");
    if (!motivo?.trim()) return;
    if (
      window.confirm(
        "Confirma a exclusão deste lançamento? Esta ação ficará registrada na auditoria."
      )
    )
      excluir.mutate({ id, motivo: motivo.trim() });
  };
  const fornecedor = forns.find((x: any) => x.id === Number(form.fornecedorId));
  const add = () => {
    const f = ativos.find((x: any) => x.id === Number(func));
    if (!f || itens.some(x => x.funcionarioId === f.id)) return;
    setItens([
      ...itens,
      {
        funcionarioId: f.id,
        nome: f.nome,
        quantidade: 1,
        valorUnitario: Number(fornecedor?.valorRefeicao || 0),
      },
    ]);
  };
  return (
    <section className="food-content food-launch">
      <div className="food-form">
        <h2>Novo lançamento em grupo</h2>
        <label>
          Fornecedor
          <select
            value={form.fornecedorId}
            onChange={e => {
              const id = e.target.value;
              setForm({ ...form, fornecedorId: id });
              const p = forns.find((x: any) => x.id === Number(id));
              setItens(
                itens.map(i => ({
                  ...i,
                  valorUnitario: Number(p?.valorRefeicao || 0),
                }))
              );
            }}
          >
            <option value="">Selecione</option>
            {forns.map((x: any) => (
              <option value={x.id}>{x.nome}</option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Data
            <input
              type="date"
              value={form.dataRefeicao}
              onChange={e => setForm({ ...form, dataRefeicao: e.target.value })}
            />
          </label>
          <label>
            Tipo
            <select
              value={form.tipo}
              onChange={e => setForm({ ...form, tipo: e.target.value })}
            >
              <option value="cafe">Café</option>
              <option value="almoco">Almoço</option>
              <option value="jantar">Jantar</option>
              <option value="lanche">Lanche</option>
            </select>
          </label>
        </div>
        <label>
          Número da nota
          <input
            value={form.numeroNota}
            onChange={e => setForm({ ...form, numeroNota: e.target.value })}
          />
        </label>
        <label>
          Custo extra do grupo
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.valorExtra}
            onChange={e =>
              setForm({ ...form, valorExtra: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Observação
          <textarea
            value={form.observacao}
            onChange={e => setForm({ ...form, observacao: e.target.value })}
          />
        </label>
        <button
          className="primary"
          disabled={!form.fornecedorId || !itens.length || criar.isPending}
          onClick={() => {
            const data = {
              ...form,
              fornecedorId: Number(form.fornecedorId),
              itens: itens.map(({ nome, ...i }) => i),
            };
            if (editandoId) atualizar.mutate({ id: editandoId, data });
            else criar.mutate({ ...data, token: crypto.randomUUID() });
          }}
        >
          <Save /> {editandoId ? "Atualizar grupo" : "Salvar grupo"}
        </button>
      </div>
      <div className="food-items">
        <h2>Funcionários e quantidades</h2>
        <div className="add-row">
          <select value={func} onChange={e => setFunc(e.target.value)}>
            <option value="">Selecione um funcionário</option>
            {ativos.map((x: any) => (
              <option value={x.id}>
                {x.nome} — {x.setor}
              </option>
            ))}
          </select>
          <button onClick={add}>
            <Plus /> Incluir
          </button>
        </div>
        {itens.map((x, i) => (
          <div className="item-row">
            <b>{x.nome}</b>
            <input
              aria-label={`Quantidade de ${x.nome}`}
              type="number"
              min="1"
              value={x.quantidade}
              onChange={e =>
                setItens(
                  itens.map((a, j) =>
                    j === i ? { ...a, quantidade: Number(e.target.value) } : a
                  )
                )
              }
            />
            <input
              aria-label={`Valor de ${x.nome}`}
              type="number"
              min="0"
              step=".01"
              value={x.valorUnitario}
              onChange={e =>
                setItens(
                  itens.map((a, j) =>
                    j === i
                      ? { ...a, valorUnitario: Number(e.target.value) }
                      : a
                  )
                )
              }
            />
            <strong>{moeda(x.quantidade * x.valorUnitario)}</strong>
            <button
              aria-label="Remover"
              onClick={() => setItens(itens.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </button>
          </div>
        ))}
        <footer>
          Total do grupo:{" "}
          <b>
            {moeda(
              itens.reduce(
                (s, x) => s + x.quantidade * x.valorUnitario,
                Number(form.valorExtra)
              )
            )}
          </b>
        </footer>
      </div>
      <div className="food-history table-wrap">
        <h2>Histórico de lançamentos</h2>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Funcionário</th>
              <th>Fornecedor</th>
              <th>Tipo</th>
              <th>Quantidade</th>
              <th>Valor</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {(historico.data || []).map((x: any) => (
              <tr key={`${x.id}-${x.funcionario}`}>
                <td>{x.dataRefeicao}</td>
                <td>{x.funcionario}</td>
                <td>{x.fornecedor}</td>
                <td>{x.tipo}</td>
                <td>{x.quantidade}</td>
                <td>{moeda(x.valorTotal)}</td>
                <td>
                  <button onClick={() => void editar(x.id)}>Editar</button>
                  <button
                    aria-label="Excluir lançamento"
                    onClick={() => confirmarExclusao(x.id)}
                  >
                    <Trash2 />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cadastros({ data, concluir }: any) {
  const [fn, setFn] = useState<any>({ nome: "", setor: "", ativo: true });
  const [fo, setFo] = useState<any>({
    nome: "",
    valorRefeicao: 0,
    ativo: true,
  });
  const [cu, setCu] = useState<any>({
    descricao: "",
    categoria: "Operacional",
    valor: 0,
    dataCusto: hoje(),
  });
  const mf = trpc.alimentacao.salvarFuncionario.useMutation({
    onSuccess: async () => {
      setFn({ nome: "", setor: "", ativo: true });
      await concluir();
      toast.success("Funcionário salvo.");
    },
  });
  const mo = trpc.alimentacao.salvarFornecedor.useMutation({
    onSuccess: async () => {
      setFo({ nome: "", valorRefeicao: 0, ativo: true });
      await concluir();
      toast.success("Fornecedor salvo.");
    },
  });
  const mc = trpc.alimentacao.criarCusto.useMutation({
    onSuccess: async () => {
      setCu({ ...cu, descricao: "", valor: 0 });
      await concluir();
      toast.success("Custo salvo.");
    },
  });
  return (
    <section className="food-content">
      <div className="food-panels cad-panels">
        <article>
          <h2>Funcionário</h2>
          <label>
            Nome
            <input
              value={fn.nome}
              onChange={e => setFn({ ...fn, nome: e.target.value })}
            />
          </label>
          <label>
            Setor
            <input
              value={fn.setor}
              onChange={e => setFn({ ...fn, setor: e.target.value })}
            />
          </label>
          <button className="primary" onClick={() => mf.mutate(fn)}>
            Salvar
          </button>
          {(data?.funcionarios || []).map((x: any) => (
            <div className="rank">
              <span>
                {x.nome}
                <small>{x.setor}</small>
              </span>
              <button onClick={() => mf.mutate({ ...x, ativo: !x.ativo })}>
                {x.ativo ? "Inativar" : "Ativar"}
              </button>
            </div>
          ))}
        </article>
        <article>
          <h2>Fornecedor</h2>
          <label>
            Nome
            <input
              value={fo.nome}
              onChange={e => setFo({ ...fo, nome: e.target.value })}
            />
          </label>
          <label>
            Valor da refeição
            <input
              type="number"
              step=".01"
              value={fo.valorRefeicao}
              onChange={e =>
                setFo({ ...fo, valorRefeicao: Number(e.target.value) })
              }
            />
          </label>
          <button className="primary" onClick={() => mo.mutate(fo)}>
            Salvar
          </button>
          {(data?.fornecedores || []).map((x: any) => (
            <div className="rank">
              <span>
                {x.nome}
                <small>{moeda(x.valorRefeicao)}</small>
              </span>
              <button
                onClick={() =>
                  mo.mutate({
                    ...x,
                    valorRefeicao: Number(x.valorRefeicao),
                    ativo: !x.ativo,
                  })
                }
              >
                {x.ativo ? "Inativar" : "Ativar"}
              </button>
            </div>
          ))}
        </article>
        <article>
          <h2>Custo extra</h2>
          <label>
            Descrição
            <input
              value={cu.descricao}
              onChange={e => setCu({ ...cu, descricao: e.target.value })}
            />
          </label>
          <label>
            Categoria
            <input
              value={cu.categoria}
              onChange={e => setCu({ ...cu, categoria: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              Valor
              <input
                type="number"
                step=".01"
                value={cu.valor}
                onChange={e => setCu({ ...cu, valor: Number(e.target.value) })}
              />
            </label>
            <label>
              Data
              <input
                type="date"
                value={cu.dataCusto}
                onChange={e => setCu({ ...cu, dataCusto: e.target.value })}
              />
            </label>
          </div>
          <button className="primary" onClick={() => mc.mutate(cu)}>
            Salvar
          </button>
          {(data?.custos || []).map((x: any) => (
            <div className="rank">
              <span>
                {x.descricao}
                <small>{x.categoria}</small>
              </span>
              <b>{moeda(x.valor)}</b>
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}

function Relatorios({ cad, rows, filtros, setFiltros }: any) {
  const [rascunho, setRascunho] = useState<any>({ ...filtros });
  const [tipoRelatorio, setTipoRelatorio] = useState("funcionario");
  const configuracoes: Record<
    string,
    {
      titulo: string;
      rotulo: string;
      chave: (row: any) => string;
      modo: "quantidade" | "total";
    }
  > = {
    funcionario: {
      titulo: "Alimentações por funcionário",
      rotulo: "Funcionário",
      chave: row => row.funcionario,
      modo: "quantidade",
    },
    fornecedor: {
      titulo: "Custo por fornecedor",
      rotulo: "Fornecedor",
      chave: row => row.fornecedor,
      modo: "total",
    },
    mensal: {
      titulo: "Custo mensal com alimentação",
      rotulo: "Mês",
      chave: row => String(row.dataRefeicao).slice(0, 7),
      modo: "total",
    },
    setor: {
      titulo: "Custo por setor",
      rotulo: "Setor",
      chave: row => row.setor,
      modo: "total",
    },
    tipo: {
      titulo: "Custo por tipo de alimentação",
      rotulo: "Tipo",
      chave: row => row.tipo,
      modo: "total",
    },
  };
  const config = configuracoes[tipoRelatorio];
  const dados = useMemo(() => {
    const grupos = new Map<
      string,
      { nome: string; quantidade: number; total: number }
    >();
    rows.forEach((row: any) => {
      const nome = config.chave(row) || "Não informado";
      const atual = grupos.get(nome) || { nome, quantidade: 0, total: 0 };
      atual.quantidade += Number(row.quantidade || 0);
      atual.total += Number(row.valorTotal || 0);
      grupos.set(nome, atual);
    });
    return Array.from(grupos.values()).sort(
      (a, b) => b[config.modo] - a[config.modo]
    );
  }, [rows, tipoRelatorio]);
  const totalQuantidade = useMemo(
    () => dados.reduce((s, x) => s + x.quantidade, 0),
    [dados]
  );
  const totalValor = useMemo(
    () => dados.reduce((s, x) => s + x.total, 0),
    [dados]
  );
  const aplicarFiltros = (event: React.FormEvent) => {
    event.preventDefault();
    if (rascunho.inicio && rascunho.fim && rascunho.inicio > rascunho.fim) {
      toast.error("A data inicial não pode ser posterior à data final.");
      return;
    }
    setFiltros(
      Object.fromEntries(
        Object.entries(rascunho).filter(
          ([, value]) => value !== "" && value !== undefined
        )
      )
    );
  };
  const nomeFiltro = (lista: any[], id: unknown) =>
    lista.find(x => x.id === Number(id))?.nome || "Todos";
  const resumoFiltros = `Período: ${filtros.inicio || "início"} até ${filtros.fim || "hoje"} | Fornecedor: ${nomeFiltro(cad?.fornecedores || [], filtros.fornecedorId)} | Funcionário: ${nomeFiltro(cad?.funcionarios || [], filtros.funcionarioId)} | Setor: ${filtros.setor || "Todos"} | Tipo: ${filtros.tipo || "Todos"}`;
  const tabelaHtml = dados
    .map(
      x =>
        `<tr><td>${x.nome}</td><td>${x.quantidade}</td><td>${x.total.toFixed(2)}</td></tr>`
    )
    .join("");
  const exportar = () => {
    const html = `<meta charset="utf-8"><h2>${config.titulo}</h2><p>${resumoFiltros}</p><table><tr><th>${config.rotulo}</th><th>Quantidade</th><th>Total</th></tr>${tabelaHtml}<tr><th>Total geral</th><th>${totalQuantidade}</th><th>${totalValor.toFixed(2)}</th></tr></table>`;
    const url = URL.createObjectURL(
      new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "relatorio-alimentacao.xls";
    a.click();
    URL.revokeObjectURL(url);
  };
  const imprimir = () => {
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("O navegador bloqueou a janela de impressão.");
      return;
    }
    const max = Math.max(...dados.map(x => x[config.modo]), 1);
    const barras = dados
      .map(
        x =>
          `<div style="display:grid;grid-template-columns:220px 1fr 100px;gap:8px;margin:5px 0"><span>${x.nome}</span><div style="background:#e8eef4"><div style="width:${Math.max(1, (x[config.modo] / max) * 100)}%;height:16px;background:#e2a514"></div></div><b>${config.modo === "total" ? moeda(x.total) : x.quantidade}</b></div>`
      )
      .join("");
    w.document.write(
      `<meta charset="utf-8"><title>${config.titulo}</title><style>body{font:12px Arial;color:#08233e;padding:24px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #9db3c8;padding:7px;text-align:left}th{background:#dce9f4}</style><h1>${config.titulo}</h1><p>${resumoFiltros}</p><h3>Total: ${moeda(totalValor)} | Alimentações: ${totalQuantidade}</h3><section>${barras}</section><table><tr><th>${config.rotulo}</th><th>Quantidade</th><th>Total</th></tr>${tabelaHtml}</table>`
    );
    w.document.close();
    w.focus();
    w.print();
  };
  return (
    <section className="food-content report-page">
      <form className="report-filters" onSubmit={aplicarFiltros}>
        <label>
          Tipo de relatório
          <select
            value={tipoRelatorio}
            onChange={e => setTipoRelatorio(e.target.value)}
          >
            <option value="funcionario">Alimentações por funcionário</option>
            <option value="fornecedor">Custo por fornecedor</option>
            <option value="mensal">Custo mensal</option>
            <option value="setor">Custo por setor</option>
            <option value="tipo">Custo por tipo</option>
          </select>
        </label>
        <label>
          Início
          <input
            type="date"
            value={rascunho.inicio || ""}
            onChange={e => setRascunho({ ...rascunho, inicio: e.target.value })}
          />
        </label>
        <label>
          Fim
          <input
            type="date"
            value={rascunho.fim || ""}
            onChange={e => setRascunho({ ...rascunho, fim: e.target.value })}
          />
        </label>
        <label>
          Fornecedor
          <select
            value={rascunho.fornecedorId || ""}
            onChange={e =>
              setRascunho({
                ...rascunho,
                fornecedorId: Number(e.target.value) || undefined,
              })
            }
          >
            <option value="">Todos</option>
            {(cad?.fornecedores || []).map((x: any) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Funcionário
          <select
            value={rascunho.funcionarioId || ""}
            onChange={e =>
              setRascunho({
                ...rascunho,
                funcionarioId: Number(e.target.value) || undefined,
              })
            }
          >
            <option value="">Todos</option>
            {(cad?.funcionarios || []).map((x: any) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Setor
          <select
            value={rascunho.setor || ""}
            onChange={e =>
              setRascunho({ ...rascunho, setor: e.target.value || undefined })
            }
          >
            <option value="">Todos</option>
            {Array.from(
              new Set(
                (cad?.funcionarios || []).map((x: any) => String(x.setor))
              )
            )
              .sort()
              .map((setor: any) => (
                <option key={setor} value={setor}>
                  {setor}
                </option>
              ))}
          </select>
        </label>
        <label>
          Tipo
          <select
            value={rascunho.tipo || ""}
            onChange={e =>
              setRascunho({ ...rascunho, tipo: e.target.value || undefined })
            }
          >
            <option value="">Todos</option>
            <option value="cafe">Café</option>
            <option value="almoco">Almoço</option>
            <option value="jantar">Jantar</option>
            <option value="lanche">Lanche</option>
          </select>
        </label>
        <div className="report-actions">
          <button className="primary" type="submit">
            Gerar relatório
          </button>
          <button type="button" onClick={exportar}>
            <Download /> Excel
          </button>
          <button type="button" onClick={imprimir}>
            <Download /> PDF/Imprimir
          </button>
        </div>
      </form>
      <div className="report-metrics">
        <article>
          <small>Total de alimentações</small>
          <strong>{totalQuantidade.toLocaleString("pt-BR")}</strong>
        </article>
        <article>
          <small>Valor total</small>
          <strong>{moeda(totalValor)}</strong>
        </article>
        <article>
          <small>{config.rotulo}s listados</small>
          <strong>{dados.length}</strong>
        </article>
      </div>
      <section className="report-chart">
        <h2>{config.titulo}</h2>
        <p>{resumoFiltros}</p>
        <div className="chart-scroll">
          <div
            style={{ minWidth: Math.max(760, dados.length * 58), height: 360 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dados}
                margin={{ top: 20, right: 20, left: 20, bottom: 90 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="nome"
                  angle={-45}
                  textAnchor="end"
                  interval={0}
                  height={90}
                />
                <YAxis
                  tickFormatter={value =>
                    config.modo === "total"
                      ? `R$ ${Number(value).toLocaleString("pt-BR")}`
                      : Number(value).toLocaleString("pt-BR")
                  }
                />
                <Tooltip
                  formatter={(value: any) =>
                    config.modo === "total"
                      ? moeda(value)
                      : Number(value).toLocaleString("pt-BR")
                  }
                />
                <Bar
                  dataKey={config.modo}
                  name={config.modo === "total" ? "Valor" : "Quantidade"}
                  fill="#d99b00"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
      <section className="report-data">
        <h2>Dados do relatório</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{config.rotulo}</th>
                <th>Qtd.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {dados.length ? (
                dados.map(x => (
                  <tr key={x.nome}>
                    <td>{x.nome}</td>
                    <td>{x.quantidade.toLocaleString("pt-BR")}</td>
                    <td>{moeda(x.total)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>Sem dados no período selecionado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
