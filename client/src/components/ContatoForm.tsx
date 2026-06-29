import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";

interface ContatoFormProps {
  pedido: any;
  onSuccess?: () => void;
}

export default function ContatoForm({ pedido, onSuccess }: ContatoFormProps) {
  const [tipo, setTipo] = useState("Ligação");
  const [descricao, setDescricao] = useState("");
  const [status, setStatus] = useState("manter");

  const { mutate: createContato, isPending } = trpc.contatos.create.useMutation({
    onSuccess: () => {
      toast.success("Contato registrado com sucesso!");
      onSuccess?.();
    },
    onError: (error) => toast.error(`Erro: ${error.message}`),
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!descricao.trim()) {
      toast.error("Descrição do contato é obrigatória");
      return;
    }

    createContato({
      pedidoId: pedido.id,
      pedidoNum: pedido.pedido,
      tipo: tipo as any,
      descricao: status === "manter" ? descricao : `${descricao}\nStatus sugerido: ${status}`,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="desktop-form contato-form">
      <label>Tipo de Contato:</label>
      <Select value={tipo} onValueChange={setTipo}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="Ligação">Ligação</SelectItem>
          <SelectItem value="E-mail">E-mail</SelectItem>
          <SelectItem value="WhatsApp">WhatsApp</SelectItem>
          <SelectItem value="Visita">Visita</SelectItem>
          <SelectItem value="Outro">Outro</SelectItem>
        </SelectContent>
      </Select>

      <label>Descrição do Contato:</label>
      <Textarea value={descricao} onChange={(event) => setDescricao(event.target.value)} className="desktop-textarea contato-textarea" />

      <label>Atualizar Status do Pedido (opcional):</label>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="manter">— manter atual —</SelectItem>
          <SelectItem value="PENDENTE">PENDENTE</SelectItem>
          <SelectItem value="SAÍDA OK">SAÍDA OK</SelectItem>
          <SelectItem value="CANCELADO">CANCELADO</SelectItem>
        </SelectContent>
      </Select>

      <div className="desktop-form-actions">
        <button type="button" className="desktop-cancel" onClick={() => onSuccess?.()}>× Cancelar</button>
        <button type="submit" className="desktop-save" disabled={isPending}>▣ Salvar</button>
      </div>
    </form>
  );
}
