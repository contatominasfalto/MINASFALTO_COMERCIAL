import { describe, expect, it } from "vitest";
import { getPregaoAlertBucket, parseLicitacaoDisputeDate } from "../client/src/components/LicitacaoPregaoAlert";

describe("alerta global de pregão", () => {
  it("interpreta datas do formulário e datas brasileiras", () => {
    expect(parseLicitacaoDisputeDate("2026-08-14", "08:30")?.getTime())
      .toBe(new Date(2026, 7, 14, 8, 30).getTime());
    expect(parseLicitacaoDisputeDate("14/08/2026", "08:30:00")?.getTime())
      .toBe(new Date(2026, 7, 14, 8, 30).getTime());
  });

  it("ativa nos quatro lembretes e encerra no horário da disputa", () => {
    const disputeAt = new Date(2026, 7, 14, 8, 0);
    expect(getPregaoAlertBucket(disputeAt, new Date(2026, 7, 14, 7, 49, 59))).toBeNull();
    expect(getPregaoAlertBucket(disputeAt, new Date(2026, 7, 14, 7, 50))).toBe(0);
    expect(getPregaoAlertBucket(disputeAt, new Date(2026, 7, 14, 7, 53))).toBe(1);
    expect(getPregaoAlertBucket(disputeAt, new Date(2026, 7, 14, 7, 56))).toBe(2);
    expect(getPregaoAlertBucket(disputeAt, new Date(2026, 7, 14, 7, 59))).toBe(3);
    expect(getPregaoAlertBucket(disputeAt, disputeAt)).toBeNull();
  });

  it("rejeita datas inválidas", () => {
    expect(parseLicitacaoDisputeDate("31/02/2026", "08:00")).toBeNull();
    expect(parseLicitacaoDisputeDate("", "08:00")).toBeNull();
  });
});
