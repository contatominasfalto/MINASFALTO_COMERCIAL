import "dotenv/config";
import mysql from "mysql2/promise";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL nao configurada.");
  process.exit(1);
}

let connection;

try {
  connection = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    connectTimeout: Number.parseInt(process.env.MYSQL_CONNECT_TIMEOUT_MS || "8000", 10),
  });

  await connection.query(`
    CREATE TABLE IF NOT EXISTS sincronizacaoCrti (
      id int AUTO_INCREMENT NOT NULL,
      pedidoId int NULL,
      pedidoNum varchar(50) NOT NULL,
      tipoPedido varchar(100) NULL,
      statusCrti varchar(50) NULL,
      statusLocal varchar(20) NULL,
      dataImportacao timestamp DEFAULT CURRENT_TIMESTAMP,
      dataUltimaSincronizacao timestamp NULL,
      PRIMARY KEY (id),
      INDEX sincronizacao_pedidoNum_idx (pedidoNum)
    )
  `);

  const [userProfileColumns] = await connection.query("SHOW COLUMNS FROM users LIKE 'profile'");
  if (userProfileColumns.length === 0) {
    await connection.query(
      "ALTER TABLE users ADD profile enum('admfull','comercial','subcomercial','gerencia','diretoria') DEFAULT 'comercial'",
    );
  }

  await connection.query("ALTER TABLE pedidos MODIFY status varchar(20) DEFAULT 'PENDENTE'");
  await connection.query("ALTER TABLE sincronizacaoCrti MODIFY statusLocal varchar(20) NULL");
  await connection.query("ALTER TABLE contatos MODIFY tipo varchar(30) DEFAULT 'Ligação'");
  await connection.query("UPDATE pedidos SET status = 'SAÍDA OK' WHERE status = '' OR status LIKE 'SA%DA OK'");

  console.log("Schema MySQL reparado com sucesso.");
} catch (error) {
  console.error("Falha ao reparar schema MySQL.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await connection?.end();
}
