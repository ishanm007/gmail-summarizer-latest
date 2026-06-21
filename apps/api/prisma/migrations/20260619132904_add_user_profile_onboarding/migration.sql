/*
  Warnings:

  - You are about to drop the `Account` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `overview` on the `EmailSummary` table. All the data in the column will be lost.
  - You are about to drop the column `priorityLevel` on the `EmailSummary` table. All the data in the column will be lost.
  - You are about to drop the column `priorityReason` on the `EmailSummary` table. All the data in the column will be lost.
  - You are about to drop the column `sentiment` on the `EmailSummary` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `EmailSummary` table. All the data in the column will be lost.
  - You are about to drop the column `whyReceived` on the `EmailSummary` table. All the data in the column will be lost.
  - You are about to drop the column `aiConsent` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `refreshToken` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Account_provider_providerAccountId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Account";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'NOT_SET',
    "roleLabel" TEXT,
    "organizationName" TEXT,
    "businessName" TEXT,
    "priorities" TEXT NOT NULL DEFAULT '[]',
    "newsletterPreference" TEXT NOT NULL DEFAULT 'PERSONAL',
    "workDomains" TEXT NOT NULL DEFAULT '[]',
    "studyDomains" TEXT NOT NULL DEFAULT '[]',
    "newsletterDomains" TEXT NOT NULL DEFAULT '[]',
    "ignoredDomains" TEXT NOT NULL DEFAULT '[]',
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DailyUsage" ("count", "date", "id", "userId") SELECT "count", "date", "id", "userId" FROM "DailyUsage";
DROP TABLE "DailyUsage";
ALTER TABLE "new_DailyUsage" RENAME TO "DailyUsage";
CREATE UNIQUE INDEX "DailyUsage_userId_date_key" ON "DailyUsage"("userId", "date");
CREATE TABLE "new_EmailSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT,
    "urgency" TEXT,
    "date" TEXT,
    "actionItems" TEXT,
    "keyDates" TEXT,
    "keyTakeaways" TEXT,
    "importantDetails" TEXT,
    "keyNumbers" TEXT,
    "people" TEXT,
    "companies" TEXT,
    "links" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_EmailSummary" ("actionItems", "category", "companies", "createdAt", "date", "from", "gmailMessageId", "id", "importantDetails", "keyDates", "keyNumbers", "keyTakeaways", "links", "people", "snippet", "subject", "summary", "updatedAt", "userId") SELECT "actionItems", "category", "companies", "createdAt", "date", "from", "gmailMessageId", "id", "importantDetails", "keyDates", "keyNumbers", "keyTakeaways", "links", "people", "snippet", "subject", "summary", "updatedAt", "userId" FROM "EmailSummary";
DROP TABLE "EmailSummary";
ALTER TABLE "new_EmailSummary" RENAME TO "EmailSummary";
CREATE UNIQUE INDEX "EmailSummary_userId_gmailMessageId_key" ON "EmailSummary"("userId", "gmailMessageId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "plan") SELECT "createdAt", "email", "id", "plan" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");
