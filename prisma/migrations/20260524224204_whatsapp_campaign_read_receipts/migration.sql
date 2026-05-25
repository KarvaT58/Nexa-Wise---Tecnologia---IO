-- AlterTable
ALTER TABLE "WhatsAppCampaignJob" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "readMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "remoteMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
