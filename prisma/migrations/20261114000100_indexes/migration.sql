-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Account_providerId_accountId_idx" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "Entry_status_scheduledFor_idx" ON "Entry"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "Entry_collectionId_status_publishedAt_idx" ON "Entry"("collectionId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Entry_collectionId_status_updatedAt_idx" ON "Entry"("collectionId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Entry_collectionId_updatedAt_idx" ON "Entry"("collectionId", "updatedAt");

-- CreateIndex
CREATE INDEX "Entry_stageId_idx" ON "Entry"("stageId");

-- CreateIndex
CREATE INDEX "Entry_updatedAt_idx" ON "Entry"("updatedAt");

-- CreateIndex
CREATE INDEX "EntryTag_tagId_idx" ON "EntryTag"("tagId");

-- CreateIndex
CREATE INDEX "MediaAsset_folder_createdAt_idx" ON "MediaAsset"("folder", "createdAt");

-- CreateIndex
CREATE INDEX "EditorialTask_dueDate_idx" ON "EditorialTask"("dueDate");

-- CreateIndex
CREATE INDEX "EditorialTask_entryId_idx" ON "EditorialTask"("entryId");

-- CreateIndex
CREATE INDEX "EditorialTask_assigneeId_idx" ON "EditorialTask"("assigneeId");

-- CreateIndex
CREATE INDEX "ActivityLog_entryId_createdAt_idx" ON "ActivityLog"("entryId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_isActive_idx" ON "WebhookEndpoint"("isActive");
