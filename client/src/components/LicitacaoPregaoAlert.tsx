import { trpc } from "@/lib/trpc";
import { BellRing, Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const ALERT_WINDOW_MS = 10 * 60 * 1000;
const ALERT_REPEAT_MS = 3 * 60 * 1000;
const SEEN_KEY_PREFIX = "minasfalto_licitacao_pregao_alert";

type PregaoAlert = {
  id: number;
  data?: string | null;
  horaInicioDisputa?: string | null;
  orgao?: string | null;
  cidade?: string | null;
  item?: string | null;
};

type DueAlert = PregaoAlert & {
  disputeAt: Date;
  bucket: number;
  storageKey: string;
};

export function parseLicitacaoDisputeDate(data: unknown, hora: unknown) {
  const dateText = String(data || "").trim();
  const timeText = String(hora || "").trim();
  if (!dateText || !timeText) return null;

  const dateParts = dateText.includes("/") ? dateText.split("/") : dateText.split("-");
  const timeParts = timeText.split(":");
  if (dateParts.length !== 3 || timeParts.length < 2) return null;

  const [year, month, day] = dateText.includes("/")
    ? [Number(dateParts[2]), Number(dateParts[1]), Number(dateParts[0])]
    : [Number(dateParts[0]), Number(dateParts[1]), Number(dateParts[2])];
  const hour = Number(timeParts[0]);
  const minute = Number(timeParts[1]);
  const second = Number(timeParts[2] || 0);
  const result = new Date(year, month - 1, day, hour, minute, second, 0);

  if (
    !Number.isFinite(result.getTime())
    || result.getFullYear() !== year
    || result.getMonth() !== month - 1
    || result.getDate() !== day
    || result.getHours() !== hour
    || result.getMinutes() !== minute
  ) return null;

  return result;
}

export function getPregaoAlertBucket(disputeAt: Date, now: Date) {
  const remaining = disputeAt.getTime() - now.getTime();
  if (remaining <= 0 || remaining > ALERT_WINDOW_MS) return null;
  return Math.min(3, Math.floor((ALERT_WINDOW_MS - remaining) / ALERT_REPEAT_MS));
}

function formatDisputeDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default function LicitacaoPregaoAlert() {
  const alertsQuery = trpc.licitacoes.alertasPregao.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const [now, setNow] = useState(() => new Date());
  const [acknowledgedVersion, setAcknowledgedVersion] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  const dueAlerts = useMemo(() => {
    const result: DueAlert[] = [];
    for (const alert of (alertsQuery.data || []) as PregaoAlert[]) {
      const disputeAt = parseLicitacaoDisputeDate(alert.data, alert.horaInicioDisputa);
      if (!disputeAt) continue;
      const bucket = getPregaoAlertBucket(disputeAt, now);
      if (bucket === null) continue;
      const storageKey = `${SEEN_KEY_PREFIX}:${alert.id}:${disputeAt.getTime()}:${bucket}`;
      if (sessionStorage.getItem(storageKey)) continue;
      result.push({ ...alert, disputeAt, bucket, storageKey });
    }
    return result.sort((left, right) => left.disputeAt.getTime() - right.disputeAt.getTime());
  }, [alertsQuery.data, now, acknowledgedVersion]);

  const acknowledge = () => {
    dueAlerts.forEach((alert) => sessionStorage.setItem(alert.storageKey, "acknowledged"));
    setAcknowledgedVersion((value) => value + 1);
  };

  if (dueAlerts.length === 0) return null;

  return (
    <div className="licitacao-pregao-alert-backdrop" role="presentation">
      <section className="licitacao-pregao-alert" role="alertdialog" aria-modal="true" aria-labelledby="pregao-alert-title">
        <header>
          <BellRing size={26} aria-hidden="true" />
          <div>
            <span>Atenção</span>
            <h2 id="pregao-alert-title">Pregão prestes a iniciar</h2>
          </div>
        </header>
        <p>A disputa começa em menos de 10 minutos. Confira a plataforma e prepare o acompanhamento.</p>
        <div className="licitacao-pregao-alert-list">
          {dueAlerts.map((alert) => (
            <article key={alert.storageKey}>
              <div>
                <strong>{alert.orgao || "Licitação"}{alert.cidade ? ` - ${alert.cidade}` : ""}</strong>
                {alert.item && <small>Item: {alert.item}</small>}
              </div>
              <time dateTime={alert.disputeAt.toISOString()}><Clock3 size={14} /> {formatDisputeDate(alert.disputeAt)}</time>
            </article>
          ))}
        </div>
        <footer>
          <button type="button" className="desktop-action primary" onClick={acknowledge}>OK, estou ciente</button>
        </footer>
      </section>
    </div>
  );
}
