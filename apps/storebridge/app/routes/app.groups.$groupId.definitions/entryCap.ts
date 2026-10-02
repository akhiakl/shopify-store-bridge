/** Metaobject entries synced per type, per run. Sync still runs inside the
 * request (see definition-sync.md), so this bounds the work until a real
 * job queue (#110) exists. Shared with the UI, so not a `.server` file. */
export const ENTRY_CAP_PER_TYPE = 250;
