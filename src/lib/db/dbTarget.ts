/**
 * Which database a process is actually connected to, in a form safe to log.
 *
 * On 2026-10-27 the Inngest-run background jobs and the web app were writing
 * to two different MongoDB clusters, and nothing either side logged said so —
 * it took run-by-run comparison to find out. Each connection now logs this
 * description, so two deployments can be compared from their logs alone.
 *
 * Built from the live connection, never from MONGODB_URI, so credentials
 * cannot reach a log line. The first host label is masked: the cluster domain
 * after it is what tells two clusters apart.
 */

/** The fields of a Mongoose connection this reads. */
export interface DbConnectionLike {
  host?: string | null;
  name?: string | null;
}

/** `ac-xyz9fix-shard-00-01.fx0test.mongodb.net` → `ac-x…fx0test.mongodb.net`. */
export function maskDbHost(host: string | null | undefined): string {
  if (!host) return "unknown host";
  const dot = host.indexOf(".");
  if (dot < 0) return host;
  return `${host.slice(0, Math.min(4, dot))}…${host.slice(dot + 1)}`;
}

/** `<masked host>/<database>`, e.g. `ac-x…fx0test.mongodb.net/mployedin`. */
export function describeDbTarget(connection: DbConnectionLike | null | undefined): string {
  return `${maskDbHost(connection?.host)}/${connection?.name || "(no database)"}`;
}

/**
 * A URI without a database path connects to the driver's default, `test` —
 * an empty database, so the app quietly sees no data. Warned about, never
 * refused: a deployment that relies on the default must keep running.
 */
export function isDefaultDatabase(name: string | null | undefined): boolean {
  return !name || name === "test";
}
