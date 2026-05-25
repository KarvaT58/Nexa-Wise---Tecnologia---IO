CREATE TABLE "WhatsAppMediaCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "remoteJid" TEXT,
    "mediaType" TEXT,
    "mimetype" TEXT NOT NULL,
    "fileName" TEXT,
    "byteLength" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'evolution',
    "sourceUrl" TEXT,
    "lastAccessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMediaCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppMediaCache_userId_instanceName_messageId_key"
    ON "WhatsAppMediaCache"("userId", "instanceName", "messageId");

CREATE INDEX "WhatsAppMediaCache_userId_instanceName_idx"
    ON "WhatsAppMediaCache"("userId", "instanceName");

CREATE INDEX "WhatsAppMediaCache_sha256_idx"
    ON "WhatsAppMediaCache"("sha256");

CREATE INDEX "WhatsAppMediaCache_lastAccessedAt_idx"
    ON "WhatsAppMediaCache"("lastAccessedAt");

ALTER TABLE "WhatsAppMediaCache"
    ADD CONSTRAINT "WhatsAppMediaCache_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
