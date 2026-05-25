-- CreateEnum
CREATE TYPE "WhatsAppCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELED', 'FAILED');

-- CreateEnum
CREATE TYPE "WhatsAppCampaignMessageType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "WhatsAppCampaignJobStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED', 'CANCELED');

-- CreateEnum
CREATE TYPE "WhatsAppCampaignAudienceMode" AS ENUM ('ALL', 'FILTER', 'CUSTOM');

-- CreateTable
CREATE TABLE "ContactOptOut" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppCampaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WhatsAppCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "audienceMode" "WhatsAppCampaignAudienceMode" NOT NULL DEFAULT 'ALL',
    "selectedInstanceNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "includedLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selectedContactIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minDelaySeconds" INTEGER NOT NULL DEFAULT 45,
    "maxDelaySeconds" INTEGER NOT NULL DEFAULT 120,
    "dailyLimit" INTEGER NOT NULL DEFAULT 120,
    "scheduledAt" TIMESTAMP(3),
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recurrenceTime" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "optOutText" TEXT NOT NULL DEFAULT 'Responda PARAR para nao receber mais mensagens.',
    "safetyMaxErrors" INTEGER NOT NULL DEFAULT 10,
    "activeRunKey" TEXT,
    "preparedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppCampaignMessage" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "WhatsAppCampaignMessageType" NOT NULL DEFAULT 'TEXT',
    "text" TEXT NOT NULL,
    "caption" TEXT,
    "media" TEXT,
    "mimetype" TEXT,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppCampaignMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppCampaignJob" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "messageId" TEXT,
    "runKey" TEXT NOT NULL DEFAULT 'initial',
    "instanceName" TEXT NOT NULL,
    "instanceDisplayName" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "status" "WhatsAppCampaignJobStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppCampaignJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppCampaignEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "jobId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppCampaignEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactOptOut_number_idx" ON "ContactOptOut"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ContactOptOut_userId_number_key" ON "ContactOptOut"("userId", "number");

-- CreateIndex
CREATE INDEX "WhatsAppCampaign_status_idx" ON "WhatsAppCampaign"("status");

-- CreateIndex
CREATE INDEX "WhatsAppCampaign_userId_idx" ON "WhatsAppCampaign"("userId");

-- CreateIndex
CREATE INDEX "WhatsAppCampaign_scheduledAt_idx" ON "WhatsAppCampaign"("scheduledAt");

-- CreateIndex
CREATE INDEX "WhatsAppCampaignMessage_campaignId_idx" ON "WhatsAppCampaignMessage"("campaignId");

-- CreateIndex
CREATE INDEX "WhatsAppCampaignJob_campaignId_idx" ON "WhatsAppCampaignJob"("campaignId");

-- CreateIndex
CREATE INDEX "WhatsAppCampaignJob_runKey_idx" ON "WhatsAppCampaignJob"("runKey");

-- CreateIndex
CREATE INDEX "WhatsAppCampaignJob_status_scheduledAt_idx" ON "WhatsAppCampaignJob"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "WhatsAppCampaignJob_instanceName_idx" ON "WhatsAppCampaignJob"("instanceName");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppCampaignJob_campaignId_contactNumber_runKey_key" ON "WhatsAppCampaignJob"("campaignId", "contactNumber", "runKey");

-- CreateIndex
CREATE INDEX "WhatsAppCampaignEvent_campaignId_idx" ON "WhatsAppCampaignEvent"("campaignId");

-- CreateIndex
CREATE INDEX "WhatsAppCampaignEvent_jobId_idx" ON "WhatsAppCampaignEvent"("jobId");

-- CreateIndex
CREATE INDEX "WhatsAppCampaignEvent_type_idx" ON "WhatsAppCampaignEvent"("type");

-- AddForeignKey
ALTER TABLE "ContactOptOut" ADD CONSTRAINT "ContactOptOut_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppCampaign" ADD CONSTRAINT "WhatsAppCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppCampaignMessage" ADD CONSTRAINT "WhatsAppCampaignMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "WhatsAppCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppCampaignJob" ADD CONSTRAINT "WhatsAppCampaignJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "WhatsAppCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppCampaignJob" ADD CONSTRAINT "WhatsAppCampaignJob_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WhatsAppCampaignMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppCampaignEvent" ADD CONSTRAINT "WhatsAppCampaignEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "WhatsAppCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppCampaignEvent" ADD CONSTRAINT "WhatsAppCampaignEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "WhatsAppCampaignJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
