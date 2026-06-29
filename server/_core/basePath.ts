export function getAppBasePath() {
  const rawBasePath = process.env.VITE_BASE_PATH || process.env.APP_BASE_PATH || "";
  const normalized = rawBasePath.trim().replace(/\/+$/, "");
  if (!normalized || normalized === "/") return "";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

