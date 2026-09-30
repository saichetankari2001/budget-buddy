-- CreateTable
CREATE TABLE "CycleCategoryBudget" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryName" TEXT NOT NULL,
    "categoryColor" TEXT NOT NULL,
    "recommendedAmount" DECIMAL(10,2) NOT NULL,
    "notifiedAt80" TIMESTAMP(3),
    "notifiedAt100" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleCategoryBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CycleCategoryBudget_cycleId_idx" ON "CycleCategoryBudget"("cycleId");

-- AddForeignKey
ALTER TABLE "CycleCategoryBudget" ADD CONSTRAINT "CycleCategoryBudget_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "MoneyCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleCategoryBudget" ADD CONSTRAINT "CycleCategoryBudget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
