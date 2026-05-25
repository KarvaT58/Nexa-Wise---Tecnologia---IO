CREATE TABLE "WhatsAppMessageHidden" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "instanceName" TEXT NOT NULL,
  "remoteJid" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "keyId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WhatsAppMessageHidden_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppMessageHidden_userId_instanceName_remoteJid_messageId_key"
  ON "WhatsAppMessageHidden"("userId", "instanceName", "remoteJid", "messageId");

CREATE INDEX "WhatsAppMessageHidden_userId_instanceName_remoteJid_idx"
  ON "WhatsAppMessageHidden"("userId", "instanceName", "remoteJid");

ALTER TABLE "WhatsAppMessageHidden"
  ADD CONSTRAINT "WhatsAppMessageHidden_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
