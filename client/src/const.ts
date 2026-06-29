export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { withAppBase } from "@/lib/app-base";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  if (!oauthPortalUrl || !appId) {
    console.warn(
      "OAuth is not configured. Set VITE_OAUTH_PORTAL_URL and VITE_APP_ID to enable login redirects."
    );
    return withAppBase("/");
  }

  const redirectUri = `${window.location.origin}${withAppBase("/api/oauth/callback")}`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
