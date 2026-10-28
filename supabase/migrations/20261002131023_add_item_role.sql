-- ============================================================
-- item
-- ============================================================
CREATE TABLE "item" (
    "id"       uuid              NOT NULL DEFAULT gen_random_uuid(),
    "title"    character varying NOT NULL,
    "public"   boolean           NOT NULL,
    "isFolder" boolean           NOT NULL,
    "user_id"  uuid              NOT NULL,
    "folder"   uuid              NOT NULL,
    "order"    integer           NOT NULL,
    "item"     text              NOT NULL,
    "created"  TIMESTAMP         NOT NULL DEFAULT now(),
    "updated"  TIMESTAMP         NOT NULL DEFAULT now(),
    CONSTRAINT "PK_item_id" PRIMARY KEY ("id")
);

CREATE INDEX "IDX_item_public"   ON "item" ("public");
CREATE INDEX "IDX_item_isFolder" ON "item" ("isFolder");
CREATE INDEX "IDX_item_user_id"  ON "item" ("user_id");
CREATE INDEX "IDX_item_folder"   ON "item" ("folder");
CREATE INDEX "IDX_item_order"    ON "item" ("order");
CREATE INDEX "IDX_item_created"  ON "item" ("created");
CREATE INDEX "IDX_item_updated"  ON "item" ("updated");

-- ============================================================
-- role
-- ============================================================
CREATE TABLE "role" (
    "id"         uuid              NOT NULL DEFAULT gen_random_uuid(),
    "title"      character varying NOT NULL,
    "item"       uuid,
    "render"     uuid,
    "owner"      uuid              NOT NULL,
    "user_id"    uuid              NOT NULL,
    "permission" character varying NOT NULL,
    "created"    TIMESTAMP         NOT NULL DEFAULT now(),
    "updated"    TIMESTAMP         NOT NULL DEFAULT now(),
    CONSTRAINT "PK_role_id" PRIMARY KEY ("id")
);

CREATE INDEX "IDX_role_item"       ON "role" ("item");
CREATE INDEX "IDX_role_render"     ON "role" ("render");
CREATE INDEX "IDX_role_owner"      ON "role" ("owner");
CREATE INDEX "IDX_role_user_id"    ON "role" ("user_id");
CREATE INDEX "IDX_role_permission" ON "role" ("permission");
CREATE INDEX "IDX_role_created"    ON "role" ("created");
CREATE INDEX "IDX_role_updated"    ON "role" ("updated");