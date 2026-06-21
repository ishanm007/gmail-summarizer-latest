-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EmailSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "title" TEXT,
    "overview" TEXT,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'PERSONAL',
    "actionItems" TEXT,
    "keyDates" TEXT,
    "keyTakeaways" TEXT,
    "importantDetails" TEXT,
    "keyNumbers" TEXT,
    "people" TEXT,
    "companies" TEXT,
    "links" TEXT,
    "priorityLevel" TEXT NOT NULL DEFAULT 'LOW',
    "priorityReason" TEXT,
    "whyReceived" TEXT,
    "sentiment" TEXT,
    "date" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_EmailSummary" ("actionItems", "category", "createdAt", "date", "from", "gmailMessageId", "id", "keyDates", "sentiment", "snippet", "subject", "summary", "userId") SELECT "actionItems", "category", "createdAt", "date", "from", "gmailMessageId", "id", "keyDates", "sentiment", "snippet", "subject", "summary", "userId" FROM "EmailSummary";
DROP TABLE "EmailSummary";
ALTER TABLE "new_EmailSummary" RENAME TO "EmailSummary";
CREATE UNIQUE INDEX "EmailSummary_userId_gmailMessageId_key" ON "EmailSummary"("userId", "gmailMessageId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
