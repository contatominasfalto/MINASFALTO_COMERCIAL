import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isDemo = process.argv.includes("--demo");

function getNpmInvocation(args) {
  if (process.platform === "win32") {
    return ["cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`]];
  }

  return ["npm", args];
}

function runNpm(args, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n==> ${label}`);

    const command = getNpmInvocation(args);
    const child = spawn(command[0], command[1], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${label} interrompido pelo sinal ${signal}.`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${label} falhou com codigo ${code ?? "desconhecido"}.`));
        return;
      }

      resolve();
    });
  });
}

function openBrowser(url) {
  const command = process.platform === "win32"
    ? ["explorer.exe", [url]]
    : process.platform === "darwin"
      ? ["open", [url]]
      : ["xdg-open", [url]];

  const browser = spawn(command[0], command[1], {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
  });

  browser.unref();
}

async function startServer() {
  const modeLabel = isDemo ? " em modo demonstrativo" : "";
  console.log(`\n==> Iniciando o Minasfalto Controle Comercial${modeLabel}`);
  console.log("Mantenha esta janela aberta enquanto estiver usando o sistema.");
  console.log("Para encerrar, pressione Ctrl+C.\n");

  const command = getNpmInvocation(["run", isDemo ? "start:demo" : "start:local"]);
  const child = spawn(command[0], command[1], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  let browserOpened = false;
  const writeOutput = (stream, chunk) => {
    const output = chunk.toString();
    stream.write(output);

    if (!browserOpened) {
      const match = output.match(/Server running on (http:\/\/localhost:\d+(?:\/[^\s]*)?)/);
      if (match) {
        browserOpened = true;
        openBrowser(match[1]);
      }
    }
  };

  child.stdout.on("data", chunk => writeOutput(process.stdout, chunk));
  child.stderr.on("data", chunk => writeOutput(process.stderr, chunk));

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        resolve();
        return;
      }

      if (code !== 0) {
        reject(new Error(`Servidor encerrado com codigo ${code ?? "desconhecido"}.`));
        return;
      }

      resolve();
    });
  });
}

try {
  if (!isDemo) {
    await runNpm(["run", "env:check"], "Validando configuracao");
    await runNpm(["run", "db:test"], "Testando conexao com o MySQL");
  } else {
    console.log("\n==> Modo demonstrativo: usando dados temporarios sem MySQL");
  }
  await runNpm(["run", "build"], "Compilando a aplicacao");
  await startServer();
} catch (error) {
  console.error(`\nERRO: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
