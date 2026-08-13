-- Phase 1: Better Auth, organizations, locations, memberships, RBAC,
-- bootstrap/invitations, database rate limiting and append-only auditing.

CREATE TYPE "EntityStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "LocationScope" AS ENUM ('ALL', 'SELECTED');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

CREATE TABLE "auth_user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "ban_reason" TEXT,
    "ban_expires" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "auth_user_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" UUID NOT NULL,
    "impersonated_by" TEXT,
    CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "auth_account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_verification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "auth_verification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_rate_limit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,
    CONSTRAINT "auth_rate_limit_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "auth_rate_limit_count_positive" CHECK ("count" > 0)
);

CREATE TABLE "bootstrap_token" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "consumed_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bootstrap_token_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bootstrap_token_consumption_consistent" CHECK (
      ("consumed_at" IS NULL AND "consumed_by_user_id" IS NULL)
      OR ("consumed_at" IS NOT NULL AND "consumed_by_user_id" IS NOT NULL)
    )
);

CREATE TABLE "organization" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organization_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_name_not_blank" CHECK (btrim("name") <> ''),
    CONSTRAINT "organization_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "location" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "capacity" INTEGER,
    "address_line_1" TEXT,
    "address_line_2" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country_code" CHAR(2),
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "location_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "location_name_not_blank" CHECK (btrim("name") <> ''),
    CONSTRAINT "location_timezone_not_blank" CHECK (btrim("timezone") <> ''),
    CONSTRAINT "location_capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0),
    CONSTRAINT "location_country_code_format" CHECK (
      "country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$'
    ),
    CONSTRAINT "location_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "membership" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "location_scope" "LocationScope" NOT NULL DEFAULT 'ALL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "membership_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "membership_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "permission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "permission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "permission_key_format" CHECK ("key" ~ '^[a-z][a-z0-9_.]*$')
);

CREATE TABLE "role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "role_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "role_key_format" CHECK ("key" ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT "role_name_not_blank" CHECK (btrim("name") <> '')
);

CREATE TABLE "role_permission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    CONSTRAINT "membership_role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_location" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    CONSTRAINT "membership_location_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invitation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "inviter_membership_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "accepted_by_user_id" UUID,
    "location_scope" "LocationScope" NOT NULL DEFAULT 'ALL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invitation_email_normalized" CHECK ("email" = lower(btrim("email"))),
    CONSTRAINT "invitation_status_consistent" CHECK (
      ("status" = 'PENDING' AND "accepted_at" IS NULL AND "revoked_at" IS NULL AND "accepted_by_user_id" IS NULL)
      OR ("status" = 'ACCEPTED' AND "accepted_at" IS NOT NULL AND "revoked_at" IS NULL AND "accepted_by_user_id" IS NOT NULL)
      OR ("status" = 'REVOKED' AND "accepted_at" IS NULL AND "revoked_at" IS NOT NULL AND "accepted_by_user_id" IS NULL)
    )
);

CREATE TABLE "invitation_role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    CONSTRAINT "invitation_role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invitation_location" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    CONSTRAINT "invitation_location_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "actor_user_id" UUID,
    "actor_membership_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_log_action_not_blank" CHECK (btrim("action") <> ''),
    CONSTRAINT "audit_log_target_type_not_blank" CHECK (btrim("target_type") <> ''),
    CONSTRAINT "audit_log_metadata_object" CHECK (jsonb_typeof("metadata") = 'object')
);

CREATE UNIQUE INDEX "auth_user_email_key" ON "auth_user"("email");
CREATE UNIQUE INDEX "auth_user_email_normalized_key" ON "auth_user"(lower(btrim("email")));
CREATE UNIQUE INDEX "auth_session_token_key" ON "auth_session"("token");
CREATE INDEX "auth_session_user_id_idx" ON "auth_session"("user_id");
CREATE INDEX "auth_session_expires_at_idx" ON "auth_session"("expires_at");
CREATE INDEX "auth_account_user_id_idx" ON "auth_account"("user_id");
CREATE UNIQUE INDEX "auth_account_provider_id_account_id_key" ON "auth_account"("provider_id", "account_id");
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification"("identifier");
CREATE INDEX "auth_verification_expires_at_idx" ON "auth_verification"("expires_at");
CREATE UNIQUE INDEX "bootstrap_token_token_hash_key" ON "bootstrap_token"("token_hash");
CREATE INDEX "bootstrap_token_expires_at_idx" ON "bootstrap_token"("expires_at");
CREATE INDEX "organization_status_idx" ON "organization"("status");
CREATE INDEX "location_organization_id_status_idx" ON "location"("organization_id", "status");
CREATE UNIQUE INDEX "location_id_organization_id_key" ON "location"("id", "organization_id");
CREATE INDEX "membership_organization_id_status_idx" ON "membership"("organization_id", "status");
CREATE INDEX "membership_user_id_status_idx" ON "membership"("user_id", "status");
CREATE UNIQUE INDEX "membership_organization_id_user_id_key" ON "membership"("organization_id", "user_id");
CREATE UNIQUE INDEX "membership_id_organization_id_key" ON "membership"("id", "organization_id");
CREATE UNIQUE INDEX "permission_key_key" ON "permission"("key");
CREATE INDEX "role_organization_id_idx" ON "role"("organization_id");
CREATE UNIQUE INDEX "role_organization_id_key_key" ON "role"("organization_id", "key");
CREATE UNIQUE INDEX "role_id_organization_id_key" ON "role"("id", "organization_id");
CREATE INDEX "role_permission_permission_id_idx" ON "role_permission"("permission_id");
CREATE UNIQUE INDEX "role_permission_role_id_permission_id_key" ON "role_permission"("role_id", "permission_id");
CREATE INDEX "role_permission_organization_id_idx" ON "role_permission"("organization_id");
CREATE INDEX "membership_role_role_id_idx" ON "membership_role"("role_id");
CREATE UNIQUE INDEX "membership_role_membership_id_role_id_key" ON "membership_role"("membership_id", "role_id");
CREATE INDEX "membership_role_organization_id_idx" ON "membership_role"("organization_id");
CREATE INDEX "membership_location_location_id_idx" ON "membership_location"("location_id");
CREATE UNIQUE INDEX "membership_location_membership_id_location_id_key" ON "membership_location"("membership_id", "location_id");
CREATE INDEX "membership_location_organization_id_idx" ON "membership_location"("organization_id");
CREATE UNIQUE INDEX "invitation_token_hash_key" ON "invitation"("token_hash");
CREATE INDEX "invitation_organization_id_status_idx" ON "invitation"("organization_id", "status");
CREATE INDEX "invitation_email_status_idx" ON "invitation"("email", "status");
CREATE INDEX "invitation_expires_at_idx" ON "invitation"("expires_at");
CREATE UNIQUE INDEX "invitation_id_organization_id_key" ON "invitation"("id", "organization_id");
CREATE INDEX "invitation_role_role_id_idx" ON "invitation_role"("role_id");
CREATE UNIQUE INDEX "invitation_role_invitation_id_role_id_key" ON "invitation_role"("invitation_id", "role_id");
CREATE INDEX "invitation_role_organization_id_idx" ON "invitation_role"("organization_id");
CREATE INDEX "invitation_location_location_id_idx" ON "invitation_location"("location_id");
CREATE UNIQUE INDEX "invitation_location_invitation_id_location_id_key" ON "invitation_location"("invitation_id", "location_id");
CREATE INDEX "invitation_location_organization_id_idx" ON "invitation_location"("organization_id");
CREATE INDEX "audit_log_organization_id_created_at_idx" ON "audit_log"("organization_id", "created_at");
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log"("actor_user_id");

ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bootstrap_token" ADD CONSTRAINT "bootstrap_token_consumed_by_user_id_fkey" FOREIGN KEY ("consumed_by_user_id") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "location" ADD CONSTRAINT "location_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership" ADD CONSTRAINT "membership_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role" ADD CONSTRAINT "role_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_organization_id_fkey" FOREIGN KEY ("role_id", "organization_id") REFERENCES "role"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_role" ADD CONSTRAINT "membership_role_membership_id_organization_id_fkey" FOREIGN KEY ("membership_id", "organization_id") REFERENCES "membership"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_role" ADD CONSTRAINT "membership_role_role_id_organization_id_fkey" FOREIGN KEY ("role_id", "organization_id") REFERENCES "role"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_location" ADD CONSTRAINT "membership_location_membership_id_organization_id_fkey" FOREIGN KEY ("membership_id", "organization_id") REFERENCES "membership"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_location" ADD CONSTRAINT "membership_location_location_id_organization_id_fkey" FOREIGN KEY ("location_id", "organization_id") REFERENCES "location"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_membership_id_organization_id_fkey" FOREIGN KEY ("inviter_membership_id", "organization_id") REFERENCES "membership"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_role" ADD CONSTRAINT "invitation_role_invitation_id_organization_id_fkey" FOREIGN KEY ("invitation_id", "organization_id") REFERENCES "invitation"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_role" ADD CONSTRAINT "invitation_role_role_id_organization_id_fkey" FOREIGN KEY ("role_id", "organization_id") REFERENCES "role"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_location" ADD CONSTRAINT "invitation_location_invitation_id_organization_id_fkey" FOREIGN KEY ("invitation_id", "organization_id") REFERENCES "invitation"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_location" ADD CONSTRAINT "invitation_location_location_id_organization_id_fkey" FOREIGN KEY ("location_id", "organization_id") REFERENCES "location"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_membership_id_organization_id_fkey" FOREIGN KEY ("actor_membership_id", "organization_id") REFERENCES "membership"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Audit rows are immutable even for application roles that can otherwise write.
CREATE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_or_delete
BEFORE UPDATE OR DELETE ON "audit_log"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
