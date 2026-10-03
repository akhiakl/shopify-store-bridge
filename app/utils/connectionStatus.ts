/** `Connection.status` → badge label and tone, shared by Connected
 * stores and a connection's own pages. */
export const CONNECTION_STATUS = {
  PENDING: { label: "Waiting for approval", tone: "warning" },
  APPROVED: { label: "Connected", tone: "success" },
  DECLINED: { label: "Declined", tone: "critical" },
} as const;
