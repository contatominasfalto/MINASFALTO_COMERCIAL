import { trpc } from "@/lib/trpc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";

interface HistoricoModalProps {
  pedido: any;
}

export default function HistoricoModal({ pedido }: HistoricoModalProps) {
  const { data: historico = [], isLoading: historicoLoading } = trpc.historico.listByPedido.useQuery(pedido.id);
  const { data: contatos = [], isLoading: contatosLoading } = trpc.contatos.listByPedido.useQuery(pedido.id);

  const formatDate = (dateString: string) => {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(dateString));
    } catch {
      return dateString;
    }
  };

  return (
    <Tabs defaultValue="contatos" className="desktop-history">
      <TabsList>
        <TabsTrigger value="contatos">☎ Contatos / Observações</TabsTrigger>
        <TabsTrigger value="historico">◊ Alterações do Sistema</TabsTrigger>
      </TabsList>

      <TabsContent value="contatos">
        <div className="history-table-wrap">
          {contatosLoading ? (
            <Spinner />
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Usuário</th>
                  <th>Tipo</th>
                  <th>Descrição</th>
                </tr>
              </thead>
              <tbody>
                {contatos.length === 0 ? (
                  <tr><td colSpan={4}>Nenhum contato registrado</td></tr>
                ) : (
                  contatos.map((item: any) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.dataContato)}</td>
                      <td>{item.usuario}</td>
                      <td>{item.tipo}</td>
                      <td>{item.descricao}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </TabsContent>

      <TabsContent value="historico">
        <div className="history-table-wrap">
          {historicoLoading ? (
            <Spinner />
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Usuário</th>
                  <th>Campo</th>
                  <th>Anterior</th>
                  <th>Novo</th>
                </tr>
              </thead>
              <tbody>
                {historico.length === 0 ? (
                  <tr><td colSpan={5}>Nenhuma alteração registrada</td></tr>
                ) : (
                  historico.map((item: any) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.dataHora)}</td>
                      <td>{item.usuario}</td>
                      <td>{item.campo}</td>
                      <td>{item.valorAnterior}</td>
                      <td>{item.valorNovo}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
