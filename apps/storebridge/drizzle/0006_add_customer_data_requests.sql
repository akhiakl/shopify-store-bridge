CREATE TABLE "CustomerDataRequest" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"shop" text NOT NULL,
	"customerId" text NOT NULL,
	"dataRequestId" text NOT NULL,
	"receivedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "CustomerDataRequest_shop_dataRequestId_key" UNIQUE("shop","dataRequestId")
);
--> statement-breakpoint
ALTER TABLE "CustomerDataRequest" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "CustomerDataRequest_service_role_only" ON "CustomerDataRequest" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);