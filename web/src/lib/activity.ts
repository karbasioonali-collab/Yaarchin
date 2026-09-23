import "server-only";
import { db } from "@/db/client";
import { activityLog } from "@/db/schema";
import { requestMeta } from "@/lib/request";

export type ActivityInput = {
  actorUserId: string | null;
  actingAsUserId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
};

// هرگز رمز یا هش در before/after نفرستید.
export async function logActivity(a: ActivityInput): Promise<void> {
  const { ip, userAgent } = await requestMeta();
  await db.insert(activityLog).values({
    actorUserId: a.actorUserId,
    actingAsUserId: a.actingAsUserId ?? null,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    before: a.before ?? null,
    after: a.after ?? null,
    ip,
    userAgent,
  });
}
