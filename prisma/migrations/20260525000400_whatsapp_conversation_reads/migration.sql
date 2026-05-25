CREATE TABLE "WhatsAppConversationRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadMessageId" TEXT,
    "lastReadMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConversationRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppConversationRead_userId_instanceName_remoteJid_key" ON "WhatsAppConversationRead"("userId", "instanceName", "remoteJid");
CREATE INDEX "WhatsAppConversationRead_userId_lastReadAt_idx" ON "WhatsAppConversationRead"("userId", "lastReadAt");

ALTER TABLE "WhatsAppConversationRead"
ADD CONSTRAINT "WhatsAppConversationRead_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
