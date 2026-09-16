CREATE UNIQUE INDEX "MoneyCycle_userId_active_unique" ON "MoneyCycle"("userId") WHERE "status" = 'ACTIVE';
