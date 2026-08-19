import { describe, expect, it } from "vitest";
import { buildLicitacaoDocumentPath, validateLicitacaoDocumentPath } from "./licitacao-documentos";

describe("pastas de documentos de licitações", () => {
  it("gera o caminho no ano e padrão usados pela Minasfalto", () => {
    expect(buildLicitacaoDocumentPath("2026-09-02", "CARMO DO CAJURU"))
      .toBe("\\\\SERVIDOR\\Dados\\Minasfalto_Licitacoes\\2026\\2026.09.02_Carmo_do Cajuru");
  });

  it("rejeita caminhos fora da raiz autorizada", () => {
    expect(() => validateLicitacaoDocumentPath("C:\\Windows")).toThrow(/dentro de/i);
  });
});
