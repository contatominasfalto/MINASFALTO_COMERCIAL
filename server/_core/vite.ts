import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";

export async function setupVite(app: Express, server: Server) {
  const [{ createServer: createViteServer }, { default: viteConfig }] =
    await Promise.all([import("vite"), import("../../vite.config")]);

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express, appBasePath = "") {
  const sourceDistPath = path.resolve(import.meta.dirname, "../..", "dist", "public");
  const bundledDistPath = path.resolve(import.meta.dirname, "public");
  const distPath = fs.existsSync(sourceDistPath) ? sourceDistPath : bundledDistPath;
  const indexPath = path.resolve(distPath, "index.html");

  if (!fs.existsSync(indexPath)) {
    console.error(
      `Could not find the client build at ${indexPath}. Run npm run build before npm start.`
    );
  }

  const staticMiddleware = express.static(distPath);
  const staticErrorHandler = (error: Error, _req: Request, res: Response, next: NextFunction) => {
    console.error(`[Static] ${error.message}`);
    if (res.headersSent) return next(error);
    res.status(404).end();
  };

  if (appBasePath) {
    app.use(appBasePath, staticMiddleware, staticErrorHandler);
  }

  app.use(staticMiddleware, staticErrorHandler);

  const sendIndex = (_req: Request, res: Response) => {
    if (!fs.existsSync(indexPath)) {
      res.status(500).send("Client build not found. Run npm run build before npm start.");
      return;
    }

    res.sendFile(indexPath);
  };

  // fall through to index.html if the file doesn't exist
  if (appBasePath) {
    app.use(`${appBasePath}/*`, sendIndex);
  }

  app.use("*", sendIndex);
}
