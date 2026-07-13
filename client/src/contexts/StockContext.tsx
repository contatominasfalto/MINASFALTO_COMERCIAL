import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { trpc } from "@/lib/trpc";
import { isStockDateWithinPeriod } from "@/lib/stock-period";

export interface StockMovement {
  id: string;
  date: Date;
  day: number;
  weekday: string;
  initialStock: number;
  production: number;
  outputs: number;
  finalStock: number;
  bulkEntryTons: number;
  bulkOutputTons: number;
  bulkInitialTons: number;
  bulkConsumedTons: number;
  bulkFinalTons: number;
  occurrences: string;
  createdAt: Date;
}

type StockMovementInput = Omit<
  StockMovement,
  | "id"
  | "createdAt"
  | "finalStock"
  | "bulkInitialTons"
  | "bulkConsumedTons"
  | "bulkFinalTons"
>;

interface StockMovementRecord {
  id: number;
  dataMovimentacao: string;
  estoqueInicial: string | number;
  producaoSacos: string | number;
  saidaSacos: string | number;
  entradaGranelTon: string | number;
  saidaGranelTon: string | number;
  ocorrencias: string | null;
  criadoEm: Date | string;
}

interface StockContextType {
  movements: StockMovement[];
  addMovement: (data: StockMovementInput) => Promise<void>;
  updateMovement: (id: string, data: Partial<StockMovement>) => Promise<void>;
  deleteMovement: (id: string) => Promise<void>;
  getInitialStockForDate: (date: Date, excludeId?: string) => number;
  getBulkInitialTonsForDate: (date: Date, excludeId?: string) => number;
  canEditInitialStock: (id?: string | null, date?: Date) => boolean;
  getTotalByPeriod: (
    startDate: Date,
    endDate: Date,
  ) => {
    initialStock: number;
    bulkFinalTons: number;
    bulkOutputTons: number;
    production: number;
    outputs: number;
    finalStock: number;
  };
  isLoading: boolean;
}

const WEEKDAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const BAG_WEIGHT_KG = 25;
const KG_PER_TON = 1000;

const StockContext = createContext<StockContextType | undefined>(undefined);

const getTime = (date: Date) => new Date(date).getTime();

const sortByDateAsc = (items: StockMovement[]) =>
  [...items].sort((a, b) => {
    const dateDiff = getTime(a.date) - getTime(b.date);
    if (dateDiff !== 0) return dateDiff;

    return getTime(a.createdAt) - getTime(b.createdAt);
  });

const rebuildStockSequence = (items: StockMovement[]) => {
  let previousFinalStock: number | null = null;
  let previousBulkFinalTons: number | null = null;

  return sortByDateAsc(items).map((item) => {
    const date = new Date(item.date);
    const initialStock =
      previousFinalStock === null ? item.initialStock : previousFinalStock;
    const finalStock = initialStock + item.production - item.outputs;
    const bulkEntryTons = item.bulkEntryTons ?? 0;
    const bulkOutputTons = item.bulkOutputTons ?? 0;
    const bulkInitialTons = (previousBulkFinalTons ?? 0) + bulkEntryTons;
    const bulkConsumedTons = (item.production * BAG_WEIGHT_KG) / KG_PER_TON;
    const bulkFinalTons = bulkInitialTons - bulkConsumedTons - bulkOutputTons;

    previousFinalStock = finalStock;
    previousBulkFinalTons = bulkFinalTons;

    return {
      ...item,
      date,
      day: date.getDate(),
      weekday: WEEKDAYS[date.getDay()],
      initialStock,
      finalStock,
      bulkEntryTons,
      bulkOutputTons,
      bulkInitialTons,
      bulkConsumedTons,
      bulkFinalTons,
    };
  });
};

const getPreviousMovementFinalStock = (
  items: StockMovement[],
  date: Date,
  excludeId?: string,
) => {
  const selectedDayEnd = new Date(date);
  selectedDayEnd.setHours(23, 59, 59, 999);

  const previousMovements = sortByDateAsc(
    items.filter(
      (item) =>
        item.id !== excludeId && getTime(item.date) <= getTime(selectedDayEnd),
    ),
  );
  const previousMovement = previousMovements[previousMovements.length - 1];

  return previousMovement?.finalStock ?? 0;
};

const getPreviousMovementBulkFinalTons = (
  items: StockMovement[],
  date: Date,
  excludeId?: string,
) => {
  const selectedDayEnd = new Date(date);
  selectedDayEnd.setHours(23, 59, 59, 999);

  const previousMovements = sortByDateAsc(
    items.filter(
      (item) =>
        item.id !== excludeId && getTime(item.date) <= getTime(selectedDayEnd),
    ),
  );
  const previousMovement = previousMovements[previousMovements.length - 1];

  return previousMovement?.bulkFinalTons ?? 0;
};

const isFirstMovement = (
  items: StockMovement[],
  id?: string | null,
  date?: Date,
) => {
  const orderedMovements = sortByDateAsc(items);
  if (orderedMovements.length === 0) return true;

  if (id) {
    return orderedMovements[0]?.id === id;
  }

  if (!date) return false;

  return getTime(date) < getTime(orderedMovements[0].date);
};

export function StockProvider({ children }: { children: React.ReactNode }) {
  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.estoque.list.useQuery();
  const createMutation = trpc.estoque.create.useMutation();
  const updateMutation = trpc.estoque.update.useMutation();
  const deleteMutation = trpc.estoque.delete.useMutation();

  const movements = useMemo(
    () => rebuildStockSequence((data as StockMovementRecord[]).map((item) => ({
      id: String(item.id),
      date: new Date(`${item.dataMovimentacao}T12:00:00`),
      day: 0,
      weekday: "",
      initialStock: Number(item.estoqueInicial),
      production: Number(item.producaoSacos),
      outputs: Number(item.saidaSacos),
      finalStock: 0,
      bulkEntryTons: Number(item.entradaGranelTon),
      bulkOutputTons: Number(item.saidaGranelTon),
      bulkInitialTons: 0,
      bulkConsumedTons: 0,
      bulkFinalTons: 0,
      occurrences: item.ocorrencias || "",
      createdAt: new Date(item.criadoEm),
    }))),
    [data],
  );

  const toIsoDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const addMovement = useCallback(async (data: StockMovementInput) => {
    await createMutation.mutateAsync({
      dataMovimentacao: toIsoDate(data.date),
      estoqueInicial: data.initialStock,
      producaoSacos: data.production,
      saidaSacos: data.outputs,
      entradaGranelTon: data.bulkEntryTons,
      saidaGranelTon: data.bulkOutputTons,
      ocorrencias: data.occurrences,
    });
    await utils.estoque.list.invalidate();
  }, [createMutation, utils]);

  const updateMovement = useCallback(async (id: string, data: Partial<StockMovement>) => {
    await updateMutation.mutateAsync({
      id: Number(id),
      data: {
        ...(data.date ? { dataMovimentacao: toIsoDate(data.date) } : {}),
        ...(data.initialStock !== undefined ? { estoqueInicial: data.initialStock } : {}),
        ...(data.production !== undefined ? { producaoSacos: data.production } : {}),
        ...(data.outputs !== undefined ? { saidaSacos: data.outputs } : {}),
        ...(data.bulkEntryTons !== undefined ? { entradaGranelTon: data.bulkEntryTons } : {}),
        ...(data.bulkOutputTons !== undefined ? { saidaGranelTon: data.bulkOutputTons } : {}),
        ...(data.occurrences !== undefined ? { ocorrencias: data.occurrences } : {}),
      },
    });
    await utils.estoque.list.invalidate();
  }, [updateMutation, utils]);

  const deleteMovement = useCallback(async (id: string) => {
    await deleteMutation.mutateAsync(Number(id));
    await utils.estoque.list.invalidate();
  }, [deleteMutation, utils]);

  const getInitialStockForDate = useCallback(
    (date: Date, excludeId?: string) =>
      getPreviousMovementFinalStock(movements, date, excludeId),
    [movements],
  );

  const getBulkInitialTonsForDate = useCallback(
    (date: Date, excludeId?: string) =>
      getPreviousMovementBulkFinalTons(movements, date, excludeId),
    [movements],
  );

  const canEditInitialStock = useCallback(
    (id?: string | null, date?: Date) => isFirstMovement(movements, id, date),
    [movements],
  );

  const getTotalByPeriod = useCallback(
    (startDate: Date, endDate: Date) => {
      const filtered = movements.filter((item) => {
        return isStockDateWithinPeriod(item.date, startDate, endDate);
      });
      const orderedMovements = sortByDateAsc(filtered);
      const lastMovement = orderedMovements[orderedMovements.length - 1];

      const totals = filtered.reduce(
        (acc, item) => ({
          initialStock: acc.initialStock + item.initialStock,
          production: acc.production + item.production,
          outputs: acc.outputs + item.outputs,
          bulkOutputTons: acc.bulkOutputTons + item.bulkOutputTons,
          finalStock: 0,
          bulkFinalTons: 0,
        }),
        {
          initialStock: 0,
          bulkFinalTons: 0,
          bulkOutputTons: 0,
          production: 0,
          outputs: 0,
          finalStock: 0,
        },
      );

      return {
        ...totals,
        finalStock: lastMovement?.finalStock ?? 0,
        bulkFinalTons: lastMovement?.bulkFinalTons ?? 0,
      };
    },
    [movements],
  );

  const value = {
    movements,
    addMovement,
    updateMovement,
    deleteMovement,
    getInitialStockForDate,
    getBulkInitialTonsForDate,
    canEditInitialStock,
    getTotalByPeriod,
    isLoading,
  };

  return (
    <StockContext.Provider value={value}>{children}</StockContext.Provider>
  );
}

export function useStock() {
  const context = useContext(StockContext);
  if (context === undefined) {
    throw new Error("useStock must be used within a StockProvider");
  }
  return context;
}
