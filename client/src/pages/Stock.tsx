import { useMemo, useRef, useState } from "react";
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
import SapDoubleConfirmDialog from "@/components/SapDoubleConfirmDialog";
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
  ArrowLeft,
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
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const stockTableRef = useRef<HTMLDivElement>(null);

  const visibleMovements = useMemo(() => {
    const multiplier = sortDirection === "asc" ? 1 : -1;
    return [...movements].sort((left: any, right: any) => {
      const leftValue = sortColumn === "date" ? new Date(left.date).getTime() : left[sortColumn];
      const rightValue = sortColumn === "date" ? new Date(right.date).getTime() : right[sortColumn];

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * multiplier;
      }

      return String(leftValue ?? "").localeCompare(String(rightValue ?? ""), "pt-BR", {
        numeric: true,
        sensitivity: "base",
      }) * multiplier;
    });
  }, [movements, sortColumn, sortDirection]);

  const selectedMovement = visibleMovements.find((item) => item.id === selectedMovementId)
    ?? visibleMovements[0]
    ?? null;

  const formatStockNumber = (value: number) => value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  };

  const sortIndicator = (column: string) => sortColumn === column
    ? (sortDirection === "asc" ? "▲" : "▼")
    : "";

  const handleTableKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!visibleMovements.length) return;
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) return;

    event.preventDefault();
    if (event.key === "Enter") {
      if (selectedMovement) handleEdit(selectedMovement.id);
      return;
    }

    const currentIndex = visibleMovements.findIndex((item) => item.id === selectedMovement?.id);
    const startIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = event.key === "ArrowDown" || event.key === "ArrowRight"
      ? Math.min(startIndex + 1, visibleMovements.length - 1)
      : Math.max(startIndex - 1, 0);
    const nextMovement = visibleMovements[nextIndex];
    setSelectedMovementId(nextMovement.id);
    requestAnimationFrame(() => {
      stockTableRef.current
        ?.querySelector<HTMLTableRowElement>(`tr[data-movement-id="${nextMovement.id}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  };

  const handleEdit = (id: string) => {
    setEditId(id);
    setModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMovement(deleteTarget.id);
      toast.success("Movimentacao excluida com sucesso!");
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao excluir movimentacao.");
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
        bulkEntryTons: number;
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
          bulkEntryTons: movement.bulkEntryTons,
          finalStock: movement.finalStock,
          bulkFinalTons: movement.bulkFinalTons,
          occurrences: movement.occurrences ? [movement.occurrences] : [],
        });
        return;
      }

      existing.production += movement.production;
      existing.outputs += movement.outputs;
      existing.bulkOutputTons += movement.bulkOutputTons;
      existing.bulkEntryTons += movement.bulkEntryTons;
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
      "Entrada a Granel (t)",
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
      formatExcelNumber(item.bulkEntryTons),
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
              TAP FACIL 25 KG E A GRANEL
            </div>
            <p className="stock-system-subtitle">
              Gerencie suas movimentacoes de estoque diariamente
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="stock-exit-button"
          onClick={() => navigate("/comercial")}
        >
          <ArrowLeft size={16} />
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
          <>
          <div
            className="stock-table-scroll keyboard-table-scroll"
            ref={stockTableRef}
            tabIndex={0}
            role="grid"
            aria-label="Movimentações de estoque"
            onKeyDown={handleTableKeyDown}
          >
            <Table className="stock-data-table">
              <TableHeader>
                <TableRow>
                  <TableHead onClick={() => handleSort("date")}>Data <span className="table-sort-indicator">{sortIndicator("date")}</span></TableHead>
                  <TableHead className="text-center" onClick={() => handleSort("initialStock")}>Est. Inicial <span className="table-sort-indicator">{sortIndicator("initialStock")}</span></TableHead>
                  <TableHead className="text-center" onClick={() => handleSort("production")}>Produção <span className="table-sort-indicator">{sortIndicator("production")}</span></TableHead>
                  <TableHead className="text-center" onClick={() => handleSort("outputs")}>Saídas <span className="table-sort-indicator">{sortIndicator("outputs")}</span></TableHead>
                  <TableHead className="text-center" onClick={() => handleSort("bulkOutputTons")}>Saída Granel (t) <span className="table-sort-indicator">{sortIndicator("bulkOutputTons")}</span></TableHead>
                  <TableHead className="text-center" onClick={() => handleSort("bulkEntryTons")}>Entrada Granel (t) <span className="table-sort-indicator">{sortIndicator("bulkEntryTons")}</span></TableHead>
                  <TableHead className="text-center" onClick={() => handleSort("finalStock")}>Est. Final <span className="table-sort-indicator">{sortIndicator("finalStock")}</span></TableHead>
                  <TableHead className="text-center" onClick={() => handleSort("bulkFinalTons")}>Granel Final (t) <span className="table-sort-indicator">{sortIndicator("bulkFinalTons")}</span></TableHead>
                  <TableHead onClick={() => handleSort("occurrences")}>Ocorrências <span className="table-sort-indicator">{sortIndicator("occurrences")}</span></TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMovements.map((item) => {
                  return (
                    <TableRow
                      key={item.id}
                      data-movement-id={item.id}
                      className={selectedMovement?.id === item.id ? "selected" : ""}
                      onClick={() => setSelectedMovementId(item.id)}
                      onDoubleClick={() => handleEdit(item.id)}
                    >
                      <TableCell className="font-medium">
                        {format(new Date(item.date), "dd/MM/yyyy", {
                          locale: ptBR,
                        })}{" "}
                        <span className="text-xs text-muted-foreground ml-2">
                          {item.weekday}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {formatStockNumber(item.initialStock)}
                      </TableCell>
                      <TableCell className="text-center">
                        {formatStockNumber(item.production)}
                      </TableCell>
                      <TableCell className="text-center">
                        {formatStockNumber(item.outputs)}
                      </TableCell>
                      <TableCell className="text-center">
                        {formatStockNumber(item.bulkOutputTons)}
                      </TableCell>
                      <TableCell className="text-center">
                        {formatStockNumber(item.bulkEntryTons)}
                      </TableCell>
                      <TableCell className="text-center">
                        {formatStockNumber(item.finalStock)}
                      </TableCell>
                      <TableCell className="text-center">
                        {formatStockNumber(item.bulkFinalTons)}
                      </TableCell>
                      <TableCell>
                        {item.occurrences || ""}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(item.id)}
                            className="stock-icon-button"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(item)}
                            className="stock-icon-button"
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
          <div className="stock-table-statusbar">
            <span>{visibleMovements.length} lançamento(ões) exibido(s)</span>
            <span>Use as setas para navegar e Enter para editar</span>
            <strong>Usuário: {user?.name ?? "admfull"}</strong>
          </div>
          </>
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

      <SapDoubleConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Confirmar exclusão de movimentação"
        description="Esta ação vai excluir a movimentação selecionada do estoque."
        finalDescription="Confirmação final: depois de continuar, a movimentação será excluída."
        details={[
          { label: "Data", value: deleteTarget?.date ? format(new Date(deleteTarget.date), "dd/MM/yyyy", { locale: ptBR }) : "-" },
          { label: "Produção", value: deleteTarget?.production?.toFixed ? deleteTarget.production.toFixed(2) : "-" },
          { label: "Saídas", value: deleteTarget?.outputs?.toFixed ? deleteTarget.outputs.toFixed(2) : "-" },
        ]}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
