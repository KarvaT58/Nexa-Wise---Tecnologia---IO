CREATE TABLE "WhatsAppMessageFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "keyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessageFavorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppMessageFavorite_userId_instanceName_remoteJid_messageId_key" ON "WhatsAppMessageFavorite"("userId", "instanceName", "remoteJid", "messageId");

CREATE INDEX "WhatsAppMessageFavorite_userId_idx" ON "WhatsAppMessageFavorite"("userId");

CREATE INDEX "WhatsAppMessageFavorite_instanceName_remoteJid_idx" ON "WhatsAppMessageFavorite"("instanceName", "remoteJid");

ALTER TABLE "WhatsAppMessageFavorite" ADD CONSTRAINT "WhatsAppMessageFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
