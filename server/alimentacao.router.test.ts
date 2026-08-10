import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("rotas do CRUD de alimentação", () => {
  it.each([
    "salvarFuncionario",
    "excluirFuncionario",
    "salvarFornecedor",
    "excluirFornecedor",
    "salvarCusto",
    "excluirCusto",
  ])("registra alimentacao.%s", procedureName => {
    const alimentacaoRouter = appRouter._def.record.alimentacao as Record<
      string,
      unknown
    >;

    expect(alimentacaoRouter[procedureName]).toBeDefined();
  });
});
