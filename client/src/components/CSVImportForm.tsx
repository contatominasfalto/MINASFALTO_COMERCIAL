import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, AlertCircle, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function CSVImportForm({ onSuccess }: { onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [expandErrors, setExpandErrors] = useState(false);

  const { mutate: importCSV } = trpc.pedidos.importCSV.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setExpandErrors(data.erros && data.erros.length > 0);

      if (data.sucesso && (!data.erros || data.erros.length === 0)) {
        toast.success(`${data.importados} pedidos importados com sucesso!`);
        setTimeout(() => onSuccess(), 1500);
      } else if (data.sucesso && data.erros && data.erros.length > 0) {
        toast.success(`${data.importados} pedidos importados, ${data.erros.length} com erro`);
      } else {
        toast.error(`Erro na importação: ${data.mensagem}`);
      }
      setIsLoading(false);
    },
    onError: (error) => {
      toast.error(`Erro ao importar: ${error.message}`);
      setIsLoading(false);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith(".csv")) {
        toast.error("Por favor, selecione um arquivo CSV");
        return;
      }
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error("Por favor, selecione um arquivo CSV");
      return;
    }

    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const csv = e.target?.result as string;
      importCSV({ csv });
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
        <div className="flex items-center justify-center gap-3">
          <Upload className="w-5 h-5 text-gray-400" />
          <div>
            <p className="text-sm font-medium text-gray-900">
              Selecione um arquivo CSV para importar
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Formato esperado: data, cliente, pedido, situacao, qtde, valorUnit, totalPedido, saldo, percentual, prioridade, qtdeGranel, qtdeTapFacil, status, dataEntrega, observacoes
            </p>
          </div>
        </div>
        <Input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="mt-4"
        />
      </div>

      {file && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            Arquivo selecionado: <strong>{file.name}</strong>
          </p>
        </div>
      )}

      {result && (
        <div className={`p-4 border rounded-lg ${result.sucesso ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
          <div className="flex items-start gap-3">
            {result.sucesso ? (
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              <p className={`text-sm font-medium ${result.sucesso ? "text-green-900" : "text-red-900"}`}>
                {result.sucesso ? "Importação concluída!" : "Erro na importação"}
              </p>
              <p className={`text-sm mt-1 ${result.sucesso ? "text-green-800" : "text-red-800"}`}>
                {result.mensagem}
              </p>
              {result.importados > 0 && (
                <p className={`text-sm mt-2 font-semibold ${result.sucesso ? "text-green-800" : "text-red-800"}`}>
                  Pedidos importados: {result.importados}
                </p>
              )}

              {result.erros && result.erros.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setExpandErrors(!expandErrors)}
                    className={`flex items-center gap-2 text-sm font-medium ${result.sucesso ? "text-green-700 hover:text-green-900" : "text-red-700 hover:text-red-900"}`}
                  >
                    {expandErrors ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    Erros ({result.erros.length})
                  </button>

                  {expandErrors && (
                    <div className={`mt-3 space-y-2 max-h-48 overflow-y-auto p-3 rounded ${result.sucesso ? "bg-green-100" : "bg-red-100"}`}>
                      {result.erros.map((erro: string, idx: number) => (
                        <div key={idx} className={`text-xs ${result.sucesso ? "text-green-700" : "text-red-700"}`}>
                          • {erro}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={handleImport}
          disabled={!file || isLoading}
          className="sap-button-primary"
        >
          {isLoading ? "Importando..." : "Importar CSV"}
        </Button>
      </div>

      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-xs text-gray-600">
          <strong>Dica:</strong> O arquivo CSV deve conter uma linha de header com os nomes dos campos.
          Campos obrigatórios: data, cliente, pedido. Outros campos são opcionais.
        </p>
      </div>
    </div>
  );
}
