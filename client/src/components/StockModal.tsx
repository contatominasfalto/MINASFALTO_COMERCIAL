import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStock } from "@/contexts/StockContext";

const parseInputDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const stockSchema = z.object({
  date: z.date(),
  initialStock: z
    .number()
    .min(0, "Estoque inicial deve ser maior ou igual a 0"),
  bulkEntryKg: z
    .number()
    .min(0, "Entrada a granel deve ser maior ou igual a 0"),
  production: z.number().min(0, "Producao deve ser maior ou igual a 0"),
  outputs: z.number().min(0, "Saidas devem ser maior ou igual a 0"),
  bulkOutputKg: z
    .number()
    .min(0, "Saida a granel deve ser maior ou igual a 0"),
  occurrences: z.string().optional(),
});

type StockFormData = z.infer<typeof stockSchema>;

interface StockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  editId?: string | null;
}

export function StockModal({
  open,
  onOpenChange,
  onSuccess,
  editId,
}: StockModalProps) {
  const {
    movements,
    addMovement,
    updateMovement,
    getInitialStockForDate,
    getBulkInitialTonsForDate,
    canEditInitialStock,
  } = useStock();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StockFormData>({
    resolver: zodResolver(stockSchema),
    defaultValues: {
      date: new Date(),
      initialStock: 0,
      bulkEntryKg: 0,
      production: 0,
      outputs: 0,
      bulkOutputKg: 0,
      occurrences: "",
    },
  });

  const selectedDate = watch("date");
  const isInitialStockEditable = canEditInitialStock(editId, selectedDate);

  useEffect(() => {
    if (editId) {
      const item = movements.find((movement) => movement.id === editId);
      if (!item) return;

      setValue("date", new Date(item.date));
      setValue("initialStock", item.initialStock);
      setValue("bulkEntryKg", (item.bulkEntryTons ?? 0) * 1000);
      setValue("production", item.production);
      setValue("outputs", item.outputs);
      setValue("bulkOutputKg", (item.bulkOutputTons ?? 0) * 1000);
      setValue("occurrences", item.occurrences || "");
      return;
    }

    reset();
  }, [editId, movements, reset, setValue]);

  useEffect(() => {
    if (!open || editId || !selectedDate) return;

    if (!canEditInitialStock(null, selectedDate)) {
      setValue("initialStock", getInitialStockForDate(selectedDate), {
        shouldValidate: true,
      });
    }
  }, [
    canEditInitialStock,
    editId,
    getInitialStockForDate,
    open,
    selectedDate,
    setValue,
  ]);

  const onSubmit = async (data: StockFormData) => {
    setIsSubmitting(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editId) {
        const availableBags = data.initialStock + data.production;
        const bulkEntryTons = data.bulkEntryKg / 1000;
        const bulkInitialTons =
          getBulkInitialTonsForDate(data.date, editId) + bulkEntryTons;
        const bulkOutputTons = data.bulkOutputKg / 1000;
        const bulkConsumedTons = data.production * 0.025 + bulkOutputTons;

        if (data.outputs > availableBags) {
          toast.error(
            `Saida maior que o estoque disponivel. Disponivel: ${availableBags.toFixed(2)} sacos.`,
          );
          return;
        }

        if (bulkConsumedTons > bulkInitialTons) {
          toast.error(
            `Estoque a granel insuficiente. Necessario ${bulkConsumedTons.toFixed(2)} t, disponivel ${bulkInitialTons.toFixed(2)} t.`,
          );
          return;
        }

        updateMovement(editId, {
          date: data.date,
          initialStock: data.initialStock,
          production: data.production,
          outputs: data.outputs,
          bulkOutputTons,
          bulkEntryTons,
          occurrences: data.occurrences || "",
        });
        toast.success("Movimentacao atualizada com sucesso!");
      } else {
        const day = data.date.getDate();
        const weekday = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"][
          data.date.getDay()
        ];
        const initialStock = canEditInitialStock(null, data.date)
          ? data.initialStock
          : getInitialStockForDate(data.date);
        const availableBags = initialStock + data.production;
        const bulkEntryTons = data.bulkEntryKg / 1000;
        const bulkInitialTons =
          getBulkInitialTonsForDate(data.date) + bulkEntryTons;
        const bulkOutputTons = data.bulkOutputKg / 1000;
        const bulkConsumedTons = data.production * 0.025 + bulkOutputTons;

        if (data.outputs > availableBags) {
          toast.error(
            `Saida maior que o estoque disponivel. Disponivel: ${availableBags.toFixed(2)} sacos.`,
          );
          return;
        }

        if (bulkConsumedTons > bulkInitialTons) {
          toast.error(
            `Estoque a granel insuficiente. Necessario ${bulkConsumedTons.toFixed(2)} t, disponivel ${bulkInitialTons.toFixed(2)} t.`,
          );
          return;
        }

        addMovement({
          date: data.date,
          production: data.production,
          outputs: data.outputs,
          bulkOutputTons,
          initialStock,
          bulkEntryTons,
          occurrences: data.occurrences || "",
          day,
          weekday,
        });
        toast.success("Movimentacao cadastrada com sucesso!");
      }

      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error("Erro ao salvar movimentacao");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="stock-dialog">
        <DialogHeader>
          <DialogTitle>
            {editId ? "Editar Movimentacao" : "Nova Movimentacao de Estoque"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <div className="relative">
                <Input
                  type="date"
                  id="date"
                  value={selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""}
                  onChange={(event) => {
                    const date = event.target.value
                      ? parseInputDate(event.target.value)
                      : new Date();
                    setValue("date", date, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                />
              </div>
              {errors.date && (
                <p className="text-sm text-red-500">{errors.date.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="initialStock">Estoque Inicial</Label>
              <Input
                id="initialStock"
                type="number"
                step="0.01"
                disabled={!isInitialStockEditable}
                {...register("initialStock", { valueAsNumber: true })}
                placeholder="0,00"
              />
              {!isInitialStockEditable && (
                <p className="text-xs text-muted-foreground">
                  Preenchido automaticamente pelo estoque final anterior.
                </p>
              )}
              {errors.initialStock && (
                <p className="text-sm text-red-500">
                  {errors.initialStock.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="production">Producao - Sacos (25 kg)</Label>
              <Input
                id="production"
                type="number"
                step="0.01"
                {...register("production", { valueAsNumber: true })}
                placeholder="0,00"
              />
              {errors.production && (
                <p className="text-sm text-red-500">
                  {errors.production.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulkEntryKg">Entrada a Granel (kg)</Label>
              <Input
                id="bulkEntryKg"
                type="number"
                step="0.01"
                {...register("bulkEntryKg", { valueAsNumber: true })}
                placeholder="0,00"
              />
              {errors.bulkEntryKg && (
                <p className="text-sm text-red-500">
                  {errors.bulkEntryKg.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="outputs">Saidas - Sacos</Label>
              <Input
                id="outputs"
                type="number"
                step="0.01"
                {...register("outputs", { valueAsNumber: true })}
                placeholder="0,00"
              />
              {errors.outputs && (
                <p className="text-sm text-red-500">{errors.outputs.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulkOutputKg">Saida a Granel (kg)</Label>
              <Input
                id="bulkOutputKg"
                type="number"
                step="0.01"
                {...register("bulkOutputKg", { valueAsNumber: true })}
                placeholder="0,00"
              />
              {errors.bulkOutputKg && (
                <p className="text-sm text-red-500">
                  {errors.bulkOutputKg.message}
                </p>
              )}
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="occurrences">Ocorrencias</Label>
              <Textarea
                id="occurrences"
                placeholder="Ex: 50 a mais de producao por motivo de engenharia..."
                {...register("occurrences")}
                className="min-h-[80px]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Salvando..."
                : editId
                  ? "Atualizar"
                  : "Cadastrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
