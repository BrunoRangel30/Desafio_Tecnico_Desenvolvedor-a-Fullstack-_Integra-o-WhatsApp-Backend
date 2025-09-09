/*
  Warnings:

  - You are about to drop the column `contact` on the `Conversation` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Conversation` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Conversation` table. All the data in the column will be lost.
  - You are about to drop the column `direction` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `from` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `generatedBy` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `timestamp` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `to` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `qrCode` on the `WhatsAppSession` table. All the data in the column will be lost.
  - The `status` column on the `WhatsAppSession` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `contactJid` to the `Conversation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fromMe` to the `Message` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Message` table without a default value. This is not possible if the table is not empty.
  - Added the required column `waId` to the `Message` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."SessionStatus" AS ENUM ('OPEN', 'CONNECTED', 'DISCONNECTED', 'CLOSED');

-- AlterTable
ALTER TABLE "public"."Conversation" DROP COLUMN "contact",
DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "contactJid" TEXT NOT NULL,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "lastMessageAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Message" DROP COLUMN "direction",
DROP COLUMN "from",
DROP COLUMN "generatedBy",
DROP COLUMN "timestamp",
DROP COLUMN "to",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fromMe" BOOLEAN NOT NULL,
ADD COLUMN     "meta" JSONB,
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "waId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."WhatsAppSession" DROP COLUMN "qrCode",
ADD COLUMN     "qr" TEXT,
ADD COLUMN     "userId" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "public"."SessionStatus" NOT NULL DEFAULT 'OPEN';

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiResponse" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "tokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AiResponse_messageId_key" ON "public"."AiResponse"("messageId");

-- AddForeignKey
ALTER TABLE "public"."WhatsAppSession" ADD CONSTRAINT "WhatsAppSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiResponse" ADD CONSTRAINT "AiResponse_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
