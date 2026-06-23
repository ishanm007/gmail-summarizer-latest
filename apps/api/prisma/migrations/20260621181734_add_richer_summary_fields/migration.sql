-- AlterTable
ALTER TABLE "EmailSummary" ADD COLUMN "overview" TEXT;
ALTER TABLE "EmailSummary" ADD COLUMN "priorityLevel" TEXT;
ALTER TABLE "EmailSummary" ADD COLUMN "priorityReason" TEXT;
ALTER TABLE "EmailSummary" ADD COLUMN "sentiment" TEXT DEFAULT 'NEUTRAL';
ALTER TABLE "EmailSummary" ADD COLUMN "title" TEXT;
ALTER TABLE "EmailSummary" ADD COLUMN "whyReceived" TEXT;
