CREATE TABLE "WhatsAppMessagePin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "keyId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppMessagePin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppMessagePin_userId_instanceName_remoteJid_messageId_key" ON "WhatsAppMessagePin"("userId", "instanceName", "remoteJid", "messageId");

CREATE INDEX "WhatsAppMessagePin_userId_instanceName_remoteJid_expiresAt_idx" ON "WhatsAppMessagePin"("userId", "instanceName", "remoteJid", "expiresAt");

ALTER TABLE "WhatsAppMessagePin" ADD CONSTRAINT "WhatsAppMessagePin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
