ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "SyncGroupTarget" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "SyncGroup" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "Session_service_role_only" ON "Session" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Store_service_role_only" ON "Store" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "SyncGroupTarget_service_role_only" ON "SyncGroupTarget" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "SyncGroup_service_role_only" ON "SyncGroup" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);