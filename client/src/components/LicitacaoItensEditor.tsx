import { useState } from "react";
import SapDoubleConfirmDialog from "./SapDoubleConfirmDialog";
import { itemPreenchido, novoLicitacaoItem, valorTotalItem, type LicitacaoItem } from "@shared/licitacao-itens";

const moeda = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const campos = [
  ["qtdeSc", "Qtde Sacos", "0.001"],
  ["valorUnit", "Valor Unitário", "0.01"],
  ["lanceLimite", "Lance Limite", "0.01"],
  ["valorAdjudicado", "Valor Adjudicado", "0.01"],
  ["qtdeTn", "Qtde Tonelada", "0.001"],
] as const;

export default function LicitacaoItensEditor({ itens, onChange, valorContrato, historico }: {
  itens: LicitacaoItem[];
  onChange: (itens: LicitacaoItem[]) => void;
  valorContrato: number;
  historico?: string;
}) {
  const [abertos, setAbertos] = useState<Record<number, boolean>>({ 1: true });
  const [reduzirPara, setReduzirPara] = useState<number | null>(null);
  const ajustarQuantidade = (quantidade: number) => {
    onChange(Array.from({ length: quantidade }, (_, index) => itens[index] || novoLicitacaoItem(index + 1)));
    if (quantidade > itens.length) setAbertos(current => ({ ...current,
      ...Object.fromEntries(Array.from({ length: quantidade - itens.length }, (_, i) => [itens.length + i + 1, true])),
    }));
    setReduzirPara(null);
  };
  const alterar = (index: number, patch: Partial<LicitacaoItem>) => onChange(itens.map((item, i) => i === index ? { ...item, ...patch } : item));

  return <section className="licitacao-itens-editor" aria-label="Itens da licitação">
    <div className="licitacao-form-grid">
      <label className="licitacao-field"><span>Item (quantidade)</span>
        <select value={itens.length} onChange={event => {
          const quantidade = Number(event.target.value);
          if (quantidade < itens.length && itens.slice(quantidade).some(itemPreenchido)) setReduzirPara(quantidade);
          else ajustarQuantidade(quantidade);
        }}>
          {[1, 2, 3, 4, 5].map(numero => <option key={numero} value={numero}>{numero}</option>)}
        </select>
      </label>
      <label className="licitacao-field licitacao-readonly licitacao-itens-total"><span>Valor Inicial Contrato</span>
        <strong aria-live="polite">{moeda(valorContrato)}</strong>
      </label>
    </div>
    {historico && <p className="licitacao-itens-aviso">{historico}</p>}
    {itens.map((item, index) => <section className="licitacao-item-panel" key={item.numero}>
      <button type="button" className="licitacao-group-header" aria-expanded={Boolean(abertos[item.numero])}
        aria-controls={`licitacao-item-${item.numero}`} onClick={() => setAbertos(current => ({ ...current, [item.numero]: !current[item.numero] }))}>
        <span aria-hidden="true">{abertos[item.numero] ? "−" : "+"}</span>
        <strong>Item {item.numero}<small>{item.tipo}</small></strong>
        <b>{moeda(valorTotalItem(item))}</b>
      </button>
      <div id={`licitacao-item-${item.numero}`} hidden={!abertos[item.numero]} className="licitacao-group-body">
        <div className="licitacao-form-grid">
          <label className="licitacao-field"><span>Tipo</span><input value={item.tipo} maxLength={120}
            onChange={event => alterar(index, { tipo: event.target.value.toUpperCase() })} /></label>
          {campos.map(([key, label, step]) => <label key={key} className="licitacao-field"><span>{label}</span>
            <input type="number" min="0" step={step} value={item[key]} onChange={event => alterar(index, { [key]: event.target.value === "" ? 0 : Number(event.target.value) })} />
          </label>)}
          <label className="licitacao-field licitacao-readonly"><span>Valor Total</span><strong aria-live="polite">{moeda(valorTotalItem(item))}</strong>
            <small>Qtde Sacos × Valor Unitário</small></label>
        </div>
      </div>
    </section>)}
    <SapDoubleConfirmDialog open={reduzirPara !== null} onOpenChange={open => { if (!open) setReduzirPara(null); }}
      title="Reduzir quantidade de itens"
      description="Os últimos itens contêm dados. Confirme se deseja removê-los deste formulário."
      finalDescription="Os itens removidos serão excluídos da licitação somente ao clicar em Salvar. Cancelar a edição preserva o cadastro."
      details={[{ label: "Itens a remover", value: itens.slice(reduzirPara ?? itens.length).map(item => item.numero).join(", ") }]}
      finalConfirmLabel="Remover do formulário" onConfirm={() => { if (reduzirPara !== null) ajustarQuantidade(reduzirPara); }} />
  </section>;
}
