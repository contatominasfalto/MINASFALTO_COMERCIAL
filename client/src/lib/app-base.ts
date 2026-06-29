const rawBase = import.meta.env.BASE_URL || "/";
const normalizedBase = rawBase === "/" ? "" : rawBase.replace(/\/$/, "");

export const appBasePath = normalizedBase;

export const withAppBase = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${appBasePath}${normalizedPath}` || "/";
};
