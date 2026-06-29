import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StockModal } from "@/components/StockModal";
import { useStock } from "@/contexts/StockContext";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  AlertCircle,
  Package,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  BarChart3,
  LogOut,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useLocation } from "wouter";
import minasfaltoLogo from "@/assets/minasfalto-logo.jpg";

export default function StockPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { movements, deleteMovement, isLoading, getTotalByPeriod } = useStock();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const handleEdit = (id: string) => {
    setEditId(id);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir esta movimentacao?")) {
      deleteMovement(id);
      toast.success("Movimentacao excluida com sucesso!");
    }
  };

  const handleModalSuccess = () => {
    setEditId(null);
  };

  const formatExcelNumber = (value: number) => value.toFixed(2).replace(".", ",");

  const escapeExcelValue = (value: string | number) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const handleExportExcel = () => {
    if (movements.length === 0) {
      toast.error("Nenhum lancamento para exportar.");
      return;
    }

    const totalsByDate = new Map<
      string,
      {
        date: Date;
        initialStock: number;
        production: number;
        outputs: number;
        bulkOutputTons: number;
        finalStock: number;
        bulkFinalTons: number;
        occurrences: string[];
      }
    >();

    movements.forEach((movement) => {
      const date = new Date(movement.date);
      const dateKey = format(date, "yyyy-MM-dd");
      const existing = totalsByDate.get(dateKey);

      if (!existing) {
        totalsByDate.set(dateKey, {
          date,
          initialStock: movement.initialStock,
          production: movement.production,
          outputs: movement.outputs,
          bulkOutputTons: movement.bulkOutputTons,
          finalStock: movement.finalStock,
          bulkFinalTons: movement.bulkFinalTons,
          occurrences: movement.occurrences ? [movement.occurrences] : [],
        });
        return;
      }

      existing.production += movement.production;
      existing.outputs += movement.outputs;
      existing.bulkOutputTons += movement.bulkOutputTons;
      existing.finalStock = movement.finalStock;
      existing.bulkFinalTons = movement.bulkFinalTons;

      if (movement.occurrences) {
        existing.occurrences.push(movement.occurrences);
      }
    });

    const headers = [
      "Data",
      "Estoque Inicial",
      "Producao - Sacos",
      "Saidas Tapfacil",
      "Saida a Granel (t)",
      "Estoque Final",
      "Granel Final (t)",
      "Ocorrencias",
    ];
    const rows = Array.from(totalsByDate.values()).map((item) => [
      format(item.date, "dd/MM/yyyy", { locale: ptBR }),
      formatExcelNumber(item.initialStock),
      formatExcelNumber(item.production),
      formatExcelNumber(item.outputs),
      formatExcelNumber(item.bulkOutputTons),
      formatExcelNumber(item.finalStock),
      formatExcelNumber(item.bulkFinalTons),
      item.occurrences.join(" | "),
    ]);

    const tableRows = [headers, ...rows]
      .map(
        (row, index) =>
          `<tr>${row
            .map((cell) =>
              index === 0
                ? `<th>${escapeExcelValue(cell)}</th>`
                : `<td>${escapeExcelValue(cell)}</td>`,
            )
            .join("")}</tr>`,
      )
      .join("");
    const excelContent = `
      <html>
        <head>
          <meta charset="UTF-8" />
        </head>
        <body>
          <table border="1">${tableRows}</table>
        </body>
      </html>
    `;
    const blob = new Blob([excelContent], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `relatorio-lancamentos-${format(new Date(), "yyyy-MM-dd")}.xls`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Relatorio enviado para Downloads.");
  };

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const totals = getTotalByPeriod(thirtyDaysAgo, new Date());

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Faca login para acessar</h2>
          <p className="text-muted-foreground">
            Voce precisa estar autenticado para visualizar o estoque
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="stock-page">
      <header className="stock-commercial-header">
        <div className="stock-brand-block">
          <img
            src={minasfaltoLogo}
            alt="Minasfalto"
            className="stock-brand-logo"
          />
          <div>
            <div className="stock-system-title">
              CONTROLE DE ESTOQUE
              <span>TAP FACIL 25KG E A GRANEL</span>
            </div>
            <p className="stock-system-subtitle">
              Gerencie suas movimentacoes de estoque diariamente
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="stock-exit-button"
          onClick={() => navigate("/")}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </header>

      <div className="stock-action-bar">
        <button
          type="button"
          className="stock-action stock-action-new"
          onClick={() => setModalOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Novo Lancamento
        </button>
        <button
          type="button"
          className="stock-action stock-action-export"
          onClick={handleExportExcel}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Exportar Excel
        </button>
      </div>

      <section className="stock-summary-strip">
        <div className="stock-summary-item">
          <Package className="h-4 w-4" />
          <span>Estoque Final a Granel</span>
          <strong>{totals.bulkFinalTons.toFixed(2)} t</strong>
        </div>
        <div className="stock-summary-item stock-summary-blue">
          <TrendingUp className="h-4 w-4" />
          <span>Producao - Sacos</span>
          <strong>{totals.production.toFixed(2)}</strong>
        </div>
        <div className="stock-summary-item stock-summary-red">
          <TrendingDown className="h-4 w-4" />
          <span>Saidas Tapfacil</span>
          <strong>{totals.outputs.toFixed(2)}</strong>
        </div>
        <div className="stock-summary-item stock-summary-red">
          <TrendingDown className="h-4 w-4" />
          <span>Saida a Granel</span>
          <strong>{totals.bulkOutputTons.toFixed(2)} t</strong>
        </div>
        <div className="stock-summary-item stock-summary-green">
          <BarChart3 className="h-4 w-4" />
          <span>Estoque Final</span>
          <strong>{totals.finalStock.toFixed(2)}</strong>
        </div>
      </section>

      <section className="stock-table-shell">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : movements.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <div className="text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">
                Nenhuma movimentacao cadastrada
              </p>
              <p className="text-sm text-muted-foreground">
                Comece registrando sua primeira movimentacao de estoque
              </p>
            </div>
            <Button variant="outline" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Primeira movimentacao
            </Button>
          </div>
        ) : (
          <div className="stock-table-scroll">
            <Table className="stock-data-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Est. Inicial</TableHead>
                  <TableHead className="text-right">Producao</TableHead>
                  <TableHead className="text-right">Saidas</TableHead>
                  <TableHead className="text-right">Saida Granel (t)</TableHead>
                  <TableHead className="text-right">Est. Final</TableHead>
                  <TableHead className="text-right">Granel Final (t)</TableHead>
                  <TableHead>Ocorrencias</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((item, index) => {
                  const isPositive = item.finalStock >= 0;

                  return (
                    <TableRow
                      key={item.id}
                      className={index % 2 === 0 ? "stock-row-muted" : ""}
                    >
                      <TableCell className="font-medium">
                        {format(new Date(item.date), "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                        <span className="text-xs text-muted-foreground ml-2">
                          {item.weekday}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {item.initialStock.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-blue-600">
                        {item.production.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {item.outputs.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {item.bulkOutputTons.toFixed(2)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          isPositive ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {item.finalStock.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.bulkFinalTons.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {item.occurrences && (
                          <Badge
                            variant="outline"
                            className="max-w-[150px] truncate"
                          >
                            {item.occurrences}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(item.id)}
                            className="h-8 w-8 stock-icon-button"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(item.id)}
                            className="h-8 w-8 text-red-500 hover:text-red-700 stock-icon-button"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <StockModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setEditId(null);
        }}
        onSuccess={handleModalSuccess}
        editId={editId}
      />
    </div>
  );
}
