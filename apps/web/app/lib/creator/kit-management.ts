/**
 * Soft delete and restore of a personal kit. Only its owner (session or
 * unscoped key) or the admin may; anyone else gets the kit API's unknown-kit
 * `404 not_found`. The owner's publisher must still be active and owned
 * (`403 kit.publisher_not_owned`, as on every kit write). A kit the admin
 * deleted can only be restored by the admin (`403 restore.admin_deleted`). Both changes bump
 * the kit generation, so a kit write racing them fails its compare-and-set.
 */
import { kitNotFound } from "~/lib/personal-kits/kit-http";
import { findKitRecord, requireActivePublisher } from "~/lib/personal-kits/kit-store";
import type { KitRow } from "~/lib/personal-kits/kit-store";
import type { RequestActor } from "~/lib/releases/release-state-http";
import { restoreDeleted, softDelete } from "./owner-audit";
import type { LifecycleSubject } from "./owner-audit";

async function managedKit(db: D1Database, name: string, actor: RequestActor): Promise<KitRow> {
  const kit = await findKitRecord(db, name);
  if (kit === null) throw kitNotFound();
  if (actor.kind === "admin") return kit;
  if (kit.owner_user_id !== actor.id) throw kitNotFound();
  await requireActivePublisher(db, kit, actor.id);
  return kit;
}

const lifecycleSubject = (kit: KitRow): LifecycleSubject => ({
  kind: "kit",
  table: "personal_kits",
  id: kit.id,
  name: kit.name,
  deletedAt: kit.deleted_at === null ? null : Number(kit.deleted_at),
  extraSet: ", generation = generation + 1",
});

export async function deleteKit(db: D1Database, name: string, actor: RequestActor, now: Date) {
  const kit = await managedKit(db, name, actor);
  const { deletedAt, restoreDeadline } = await softDelete(db, lifecycleSubject(kit), actor, now);
  return { kit: name, deletedAt: new Date(deletedAt).toISOString(), restoreDeadline: new Date(restoreDeadline).toISOString() };
}

export async function restoreKit(db: D1Database, name: string, actor: RequestActor, now: Date) {
  const kit = await managedKit(db, name, actor);
  const { restoredAt } = await restoreDeleted(db, lifecycleSubject(kit), actor, now);
  return { kit: name, restoredAt: new Date(restoredAt).toISOString(), generation: Number(kit.generation) + 1 };
}
