-- AlterTable
ALTER TABLE "ConversationMessage" ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ConversationMessage_readAt_idx" ON "ConversationMessage"("readAt");
