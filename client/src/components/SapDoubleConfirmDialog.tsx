import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type ConfirmDetail = {
  label: string;
  value: ReactNode;
};

type SapDoubleConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  finalDescription: string;
  details?: ConfirmDetail[];
  confirmLabel?: string;
  finalConfirmLabel?: string;
  isPending?: boolean;
  onConfirm: () => void;
};

export default function SapDoubleConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  finalDescription,
  details = [],
  confirmLabel = "Continuar",
  finalConfirmLabel = "Confirmar exclusao",
  isPending = false,
  onConfirm,
}: SapDoubleConfirmDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  const close = () => {
    setStep(1);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setStep(1);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sap-confirm-dialog">
        <DialogHeader>
          <DialogTitle>
            <AlertTriangle size={22} />
            {title}
          </DialogTitle>
          <DialogDescription>
            {step === 1 ? description : finalDescription}
          </DialogDescription>
        </DialogHeader>

        {details.length > 0 && (
          <section className="sap-confirm-body">
            {details.map((detail) => (
              <div className="sap-confirm-info" key={detail.label}>
                <span>{detail.label}</span>
                <strong>{detail.value}</strong>
              </div>
            ))}
          </section>
        )}

        <footer className="sap-confirm-actions">
          <button type="button" onClick={close} disabled={isPending}>
            Cancelar
          </button>
          {step === 1 ? (
            <button
              type="button"
              className="sap-confirm-primary"
              onClick={() => setStep(2)}
              disabled={isPending}
            >
              {confirmLabel}
            </button>
          ) : (
            <button
              type="button"
              className="sap-confirm-danger"
              onClick={onConfirm}
              disabled={isPending}
            >
              {isPending ? "Processando..." : finalConfirmLabel}
            </button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
