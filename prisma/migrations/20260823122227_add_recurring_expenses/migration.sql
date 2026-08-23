-- CreateEnum
CREATE TYPE "RecurrenceInterval" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrenceInterval" "RecurrenceInterval",
ADD COLUMN     "recurringSourceId" TEXT;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurringSourceId_fkey" FOREIGN KEY ("recurringSourceId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
