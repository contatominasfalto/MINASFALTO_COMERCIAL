import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

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

interface StockContextType {
  movements: StockMovement[];
  addMovement: (data: StockMovementInput) => void;
  updateMovement: (id: string, data: Partial<StockMovement>) => void;
  deleteMovement: (id: string) => void;
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

const STORAGE_KEY = "stock_movements";
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const BAG_WEIGHT_KG = 25;
const KG_PER_TON = 1000;
const LEGACY_BULK_ENTRY_KG_THRESHOLD = 1000;

const StockContext = createContext<StockContextType | undefined>(undefined);

const generateId = () => Math.random().toString(36).substring(2, 15);
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
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const storedMovements = localStorage.getItem(STORAGE_KEY);

      if (storedMovements) {
        const parsed = JSON.parse(storedMovements);
        const withDates = parsed.map((item: StockMovement) => ({
          ...item,
          date: new Date(item.date),
          createdAt: new Date(item.createdAt),
          bulkEntryTons:
            (item.bulkEntryTons ?? 0) > LEGACY_BULK_ENTRY_KG_THRESHOLD
              ? (item.bulkEntryTons ?? 0) / KG_PER_TON
              : (item.bulkEntryTons ?? 0),
          bulkInitialTons: item.bulkInitialTons ?? 0,
          bulkOutputTons: item.bulkOutputTons ?? 0,
          bulkConsumedTons: item.bulkConsumedTons ?? 0,
          bulkFinalTons: item.bulkFinalTons ?? 0,
        }));

        setMovements(rebuildStockSequence(withDates));
      }
    } catch (error) {
      console.error("Erro ao carregar dados do localStorage:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(movements));
    }
  }, [movements, isLoading]);

  const addMovement = useCallback((data: StockMovementInput) => {
    const newMovement: StockMovement = {
      ...data,
      id: generateId(),
      finalStock: data.initialStock + data.production - data.outputs,
      bulkInitialTons: data.bulkEntryTons,
      bulkConsumedTons: (data.production * BAG_WEIGHT_KG) / KG_PER_TON,
      bulkFinalTons:
        data.bulkEntryTons -
        (data.production * BAG_WEIGHT_KG) / KG_PER_TON -
        data.bulkOutputTons,
      createdAt: new Date(),
    };

    setMovements((prev) => rebuildStockSequence([...prev, newMovement]));
  }, []);

  const updateMovement = useCallback(
    (id: string, data: Partial<StockMovement>) => {
      setMovements((prev) =>
        rebuildStockSequence(
          prev.map((item) => {
            if (item.id !== id) return item;
            return { ...item, ...data };
          }),
        ),
      );
    },
    [],
  );

  const deleteMovement = useCallback((id: string) => {
    setMovements((prev) =>
      rebuildStockSequence(prev.filter((item) => item.id !== id)),
    );
  }, []);

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
        const itemDate = new Date(item.date);
        return itemDate >= startDate && itemDate <= endDate;
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
