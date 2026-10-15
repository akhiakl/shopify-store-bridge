/** "Requested by A · Approved by B": who acted on a connection, from
 * what was recorded (#69). Null when nothing was. */
export function staffNote(connection: {
  status: string;
  requestedBy: string | null;
  respondedBy: string | null;
}): string | null {
  const parts: string[] = [];
  if (connection.requestedBy)
    parts.push(`Requested by ${connection.requestedBy}`);
  if (connection.respondedBy) {
    const verb = connection.status === "DECLINED" ? "Declined" : "Approved";
    parts.push(`${verb} by ${connection.respondedBy}`);
  }
  return parts.length ? parts.join(" · ") : null;
}
