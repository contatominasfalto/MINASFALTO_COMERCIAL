process.env.NODE_ENV = "production";
process.env.LOCAL_AUTH_BYPASS = "true";

await import("../server/_core/index.ts");
