import type { Session } from "@shopify/shopify-app-react-router/server";

/** The staff member behind an online session, as shown in the admin:
 * their name, else their email, else null (an offline session has no
 * user). */
export function staffName(session: Session): string | null {
  const user = session.onlineAccessInfo?.associated_user;
  if (!user) return null;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return name || user.email || null;
}
