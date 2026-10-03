/** Metaobject entries synced per type, per job. Jobs run in the
 * background in time-boxed chunks (see syncWorker.server.ts), but the
 * plan, including every selected entry, is read from the source in one
 * run, so this bounds that first run. Shared with the UI, so not a
 * `.server` file. */
export const ENTRY_CAP_PER_TYPE = 1000;

/** Owners (products, collections, customers) whose value of one metafield
 * definition is synced per job. The plan lists every owner's ID in its
 * first run, so this bounds that run, same as ENTRY_CAP_PER_TYPE. */
export const VALUE_CAP_PER_DEFINITION = 1000;
