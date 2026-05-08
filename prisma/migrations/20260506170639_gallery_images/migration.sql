-- CreateTable
CREATE TABLE "GalleryImage" (
    "id" TEXT NOT NULL,
    "scheduledGroupId" TEXT NOT NULL,
    "moduleId" TEXT,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GalleryImage_scheduledGroupId_moduleId_sortOrder_idx" ON "GalleryImage"("scheduledGroupId", "moduleId", "sortOrder");

-- AddForeignKey
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_scheduledGroupId_fkey" FOREIGN KEY ("scheduledGroupId") REFERENCES "ScheduledGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
