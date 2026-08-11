import { describe, expect, it, vi } from "vitest";
import { ensureLicitacaoAdesoesSchema } from "./db";

describe("schema de adesoes de licitacao", () => {
  it("cria a tabela automaticamente e apenas uma vez por processo", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([[{ Field: "alertaVencimento" }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{}, []]);
    const pool = { query } as any;

    await Promise.all([
      ensureLicitacaoAdesoesSchema(pool),
      ensureLicitacaoAdesoesSchema(pool),
    ]);

    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[0][0]).toContain("CREATE TABLE IF NOT EXISTS licitacao_adesoes");
    expect(query.mock.calls[1][0]).toContain("CREATE TABLE IF NOT EXISTS licitacao_adesao_pedidos_crti");
    expect(query.mock.calls[2][0]).toContain("SHOW COLUMNS FROM licitacao_atas");
    expect(query.mock.calls[3][0]).toContain("SHOW COLUMNS FROM licitacao_pedidos_crti");
    expect(query.mock.calls[4][0]).toContain("ALTER TABLE licitacao_pedidos_crti ADD COLUMN origem");
  });
});
