import { trpc } from "@/lib/trpc";
import { effectAllows, isMasterIdentity, type PermissionAction } from "@shared/access-control";
import { useAuth } from "./useAuth";

export function usePermissions() {
  const { user } = useAuth();
  const query = trpc.auth.permissions.useQuery(undefined, { retry: false, enabled: Boolean(user) });
  const map = new Map((query.data?.permissions || []).map((item) => [`${item.resourceKey}:${item.actionKey}`, item.effect]));
  const master = isMasterIdentity(user as any);

  const effect = (resourceKey: string, actionKey: PermissionAction) => master ? "allow" as const : map.get(`${resourceKey}:${actionKey}`) || "deny";
  const can = (resourceKey: string, actionKey: PermissionAction = "access") => effectAllows(effect(resourceKey, actionKey), actionKey);
  const readOnly = (resourceKey: string) => !can(resourceKey, "create") && !can(resourceKey, "update") && !can(resourceKey, "delete");

  return { ...query, master, can, effect, readOnly };
}
