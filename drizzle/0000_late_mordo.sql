CREATE TYPE "public"."SyncGroupTargetStatus" AS ENUM('PENDING', 'APPROVED', 'DECLINED');--> statement-breakpoint
CREATE TABLE "Session" (
	"id" text PRIMARY KEY NOT NULL,
	"shop" text NOT NULL,
	"state" text NOT NULL,
	"isOnline" boolean DEFAULT false NOT NULL,
	"scope" text,
	"expires" timestamp,
	"accessToken" text NOT NULL,
	"userId" bigint,
	"firstName" text,
	"lastName" text,
	"email" text,
	"accountOwner" boolean,
	"locale" text,
	"collaborator" boolean,
	"emailVerified" boolean,
	"refreshToken" text,
	"refreshTokenExpires" timestamp
);
--> statement-breakpoint
CREATE TABLE "Store" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"shop" text NOT NULL,
	"name" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Store_shop_unique" UNIQUE("shop")
);
--> statement-breakpoint
CREATE TABLE "SyncGroupTarget" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"groupId" text NOT NULL,
	"storeId" text NOT NULL,
	"status" "SyncGroupTargetStatus" DEFAULT 'PENDING' NOT NULL,
	"requestedAt" timestamp DEFAULT now() NOT NULL,
	"respondedAt" timestamp,
	"authTokenHash" text,
	"authTokenExpiresAt" timestamp,
	CONSTRAINT "SyncGroupTarget_authTokenHash_unique" UNIQUE("authTokenHash")
);
--> statement-breakpoint
CREATE TABLE "SyncGroup" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text,
	"sourceId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "SyncGroupTarget" ADD CONSTRAINT "SyncGroupTarget_groupId_SyncGroup_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."SyncGroup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SyncGroupTarget" ADD CONSTRAINT "SyncGroupTarget_storeId_Store_id_fk" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SyncGroup" ADD CONSTRAINT "SyncGroup_sourceId_Store_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."Store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "SyncGroupTarget_groupId_storeId_key" ON "SyncGroupTarget" USING btree ("groupId","storeId");