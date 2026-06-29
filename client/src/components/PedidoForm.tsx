import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface PedidoFormProps {
  pedido?: any;
  onSuccess?: () => void;
}

const STATUS_SAIDA_OK = "SA\u00cdDA OK";

const normalizePrioridade = (value: unknown) => value === "PRIORIDADE" ? "PRIORIDADE" : "NORMAL";

const normalizeStatus = (value: unknown) => {
  const text = String(value || "").toUpperCase();
  if (text === "CANCELADO") return "CANCELADO";
  if (text.includes("SA") && text.includes("OK")) return STATUS_SAIDA_OK;
  return "PENDENTE";
};

export default function PedidoForm({ pedido, onSuccess }: PedidoFormProps) {
  const [formData, setFormData] = useState({
    dataPedido: "",
    cliente: "",
    pedido: "",
    situacao: "Aprovado",
    qtde: 0,
    valorUnit: 0,
    totalPedido: 0,
    saldo: 0,
    percentual: 0,
    prioridade: "NORMAL",
    qtdeGranel: 0,
    qtdeTapFacil: 0,
    status: "PENDENTE",
    dataEntrega: "",
    observacoes: "",
  });

  useEffect(() => {
    if (!pedido) return;
    setFormData({
      dataPedido: pedido.dataPedido || "",
      cliente: pedido.cliente || "",
      pedido: pedido.pedido || "",
      situacao: pedido.situacao || "Aprovado",
      qtde: Number(pedido.qtde) || 0,
      valorUnit: Number(pedido.valorUnit) || 0,
      totalPedido: Number(pedido.totalPedido) || 0,
      saldo: Number(pedido.saldo) || 0,
      percentual: Number(pedido.percentual) || 0,
      prioridade: normalizePrioridade(pedido.prioridade),
      qtdeGranel: Number(pedido.qtdeGranel) || 0,
      qtdeTapFacil: Number(pedido.qtdeTapFacil) || 0,
      status: normalizeStatus(pedido.status),
      dataEntrega: pedido.dataEntrega || "",
      observacoes: pedido.observacoes || "",
    });
  }, [pedido]);

  const { mutate: createPedido, isPending: isCreating } = trpc.pedidos.create.useMutation({
    onSuccess: () => {
      toast.success("Pedido criado com sucesso!");
      onSuccess?.();
    },
    onError: (error) => toast.error(`Erro: ${error.message}`),
  });

  const { mutate: updatePedido, isPending: isUpdating } = trpc.pedidos.update.useMutation({
    onSuccess: () => {
      toast.success("Pedido atualizado com sucesso!");
      onSuccess?.();
    },
    onError: (error) => toast.error(`Erro: ${error.message}`),
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.cliente || !formData.pedido) {
      toast.error("Cliente e número do pedido são obrigatórios");
      return;
    }

    if (pedido) {
      updatePedido({
        id: pedido.id,
        data: {
          ...formData,
          prioridade: normalizePrioridade(formData.prioridade),
          status: normalizeStatus(formData.status),
        } as any,
      });
      return;
    }

    createPedido({
      ...formData,
      prioridade: normalizePrioridade(formData.prioridade),
      status: normalizeStatus(formData.status),
    } as any);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    const numeric = ["qtde", "valorUnit", "totalPedido", "saldo", "percentual", "qtdeGranel", "qtdeTapFacil"];
    setFormData((previous) => ({
      ...previous,
      [name]: numeric.includes(name) ? parseFloat(value) || 0 : value,
    }));
  };

  const setSelect = (name: string, value: string) => {
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const pending = isCreating || isUpdating;

  return (
    <form onSubmit={handleSubmit} className="desktop-form pedido-form">
      <div className="form-grid">
        <label>Nº Pedido *</label>
        <Input name="pedido" value={formData.pedido} onChange={handleChange} disabled={Boolean(pedido)} />
        <label>Data Pedido</label>
        <Input name="dataPedido" value={formData.dataPedido} onChange={handleChange} />

        <label>Cliente *</label>
        <Input name="cliente" value={formData.cliente} onChange={handleChange} className="span-3" />

        <label>Situação</label>
        <Input name="situacao" value={formData.situacao} onChange={handleChange} />
        <label>Prioridade</label>
        <Select value={formData.prioridade} onValueChange={(value) => setSelect("prioridade", value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NORMAL">NORMAL</SelectItem>
            <SelectItem value="PRIORIDADE">PRIORIDADE</SelectItem>
          </SelectContent>
        </Select>

        <label>Qtde Total</label>
        <Input name="qtde" value={formData.qtde} onChange={handleChange} />
        <label>Valor Unit (R$)</label>
        <Input name="valorUnit" value={formData.valorUnit} onChange={handleChange} />

        <label>Total Pedido (R$)</label>
        <Input name="totalPedido" value={formData.totalPedido} onChange={handleChange} />
        <label>Saldo (R$)</label>
        <Input name="saldo" value={formData.saldo} onChange={handleChange} />

        <label>Qtde A Granel</label>
        <Input name="qtdeGranel" value={formData.qtdeGranel} onChange={handleChange} />
        <label>Qtde Tap Fácil</label>
        <Input name="qtdeTapFacil" value={formData.qtdeTapFacil} onChange={handleChange} />

        <label>Status</label>
        <Select value={formData.status} onValueChange={(value) => setSelect("status", value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDENTE">PENDENTE</SelectItem>
            <SelectItem value={STATUS_SAIDA_OK}>{STATUS_SAIDA_OK}</SelectItem>
            <SelectItem value="CANCELADO">CANCELADO</SelectItem>
          </SelectContent>
        </Select>
        <label>Data Entrega</label>
        <Input name="dataEntrega" value={formData.dataEntrega} onChange={handleChange} />

        <label className="textarea-label">Observações</label>
        <Textarea name="observacoes" value={formData.observacoes} onChange={handleChange} className="span-3 desktop-textarea" />
      </div>

      <div className="desktop-form-actions">
        <button type="button" className="desktop-cancel" onClick={() => onSuccess?.()}>× Cancelar</button>
        <button type="submit" className="desktop-save" disabled={pending}>▣ Salvar</button>
      </div>
    </form>
  );
}
