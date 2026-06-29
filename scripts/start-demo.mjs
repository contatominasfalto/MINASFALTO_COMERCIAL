process.env.NODE_ENV = "production";
process.env.LOCAL_AUTH_BYPASS = process.env.LOCAL_AUTH_BYPASS || "false";
delete process.env.DATABASE_URL;

await import("../server/_core/index.ts");

