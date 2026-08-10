import { beforeEach, describe, expect, it, vi } from "vitest";

const banco = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("./db", () => ({
  getMysqlPool: vi.fn(async () => banco),
}));

import { excluirFornecedor, excluirFuncionario } from "./alimentacao";

describe("exclusão segura dos cadastros de alimentação", () => {
  beforeEach(() => {
    banco.query.mockReset();
    banco.execute.mockReset();
    banco.execute.mockResolvedValue([{ affectedRows: 1 }]);
  });

  it("exclui fisicamente funcionário sem histórico", async () => {
    banco.query.mockResolvedValue([[{ total: 0 }]]);

    await expect(
      excluirFuncionario(10, "Motivo do teste", "Usuário teste")
    ).resolves.toEqual({ ok: true, tipoExclusao: "fisica" });
    expect(banco.execute).toHaveBeenCalledWith(
      "DELETE FROM alimentacao_funcionarios WHERE id=?",
      [10]
    );
  });

  it("exclui logicamente funcionário com histórico", async () => {
    banco.query.mockResolvedValue([[{ total: 2 }]]);

    await expect(
      excluirFuncionario(11, "Motivo do teste", "Usuário teste")
    ).resolves.toEqual({ ok: true, tipoExclusao: "logica" });
    expect(banco.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE alimentacao_funcionarios SET ativo=FALSE"),
      ["Usuário teste", "Motivo do teste", 11]
    );
  });

  it("exclui fisicamente fornecedor sem histórico", async () => {
    banco.query.mockResolvedValue([[{ total: 0 }]]);

    await expect(
      excluirFornecedor(20, "Motivo do teste", "Usuário teste")
    ).resolves.toEqual({ ok: true, tipoExclusao: "fisica" });
    expect(banco.execute).toHaveBeenCalledWith(
      "DELETE FROM alimentacao_fornecedores WHERE id=?",
      [20]
    );
  });

  it("exclui logicamente fornecedor com histórico", async () => {
    banco.query.mockResolvedValue([[{ total: 3 }]]);

    await expect(
      excluirFornecedor(21, "Motivo do teste", "Usuário teste")
    ).resolves.toEqual({ ok: true, tipoExclusao: "logica" });
    expect(banco.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE alimentacao_fornecedores SET ativo=FALSE"),
      ["Usuário teste", "Motivo do teste", 21]
    );
  });
});
