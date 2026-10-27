-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'DISABLED', 'LOCKED');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('READY', 'LIMITED', 'NOT_READY', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "CheckType" AS ENUM ('ROUTINE', 'SHIFT_START', 'AFTER_MISSION', 'EXTENDED', 'OTHER');

-- CreateEnum
CREATE TYPE "CheckOutcome" AS ENUM ('OK', 'DEFECTS');

-- CreateEnum
CREATE TYPE "CheckResultValue" AS ENUM ('OK', 'DEFECT', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "IntervalUnit" AS ENUM ('DAYS', 'MONTHS', 'YEARS');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('RECEIPT', 'ISSUE', 'WRITE_OFF', 'PROVISION', 'REFILL', 'RETURN', 'CORRECTION');

-- CreateEnum
CREATE TYPE "MovementReason" AS ENUM ('EXPIRED', 'USED', 'DAMAGED', 'LOST', 'OTHER');

-- CreateEnum
CREATE TYPE "RefillStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'PROVIDED', 'REFILLED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DefectCategory" AS ENUM ('VEHICLE_TECH', 'BODY', 'ELECTRICAL', 'TIRES', 'MEDICAL_DEVICES', 'MATERIAL', 'HYGIENE', 'EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DefectSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DefectStatus" AS ENUM ('NEW', 'REVIEWED', 'IN_PROGRESS', 'WAITING_PARTS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CommentKind" AS ENUM ('COMMENT', 'STATUS_CHANGE', 'MEASURE', 'ASSIGNMENT');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('PHOTO', 'DOCUMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "position" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "roleId" TEXT NOT NULL,
    "allowMultipleVehicles" BOOLEAN NOT NULL DEFAULT false,
    "canPerformChecks" BOOLEAN NOT NULL DEFAULT false,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedReason" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "radioCallSign" TEXT,
    "internalNumber" TEXT NOT NULL,
    "licensePlate" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "buildYear" INTEGER,
    "firstRegistration" DATE,
    "mileage" INTEGER,
    "location" TEXT,
    "responsibleUserId" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'READY',
    "statusReason" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "checkIntervalDays" INTEGER NOT NULL DEFAULT 7,
    "imageId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleStatusChange" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "fromStatus" "VehicleStatus" NOT NULL,
    "toStatus" "VehicleStatus" NOT NULL,
    "reason" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checklist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "vehicleTypeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleCheck" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "checklistId" TEXT,
    "checklistName" TEXT NOT NULL,
    "checkType" "CheckType" NOT NULL DEFAULT 'ROUTINE',
    "performedById" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "mileage" INTEGER,
    "remarks" TEXT,
    "outcome" "CheckOutcome" NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amendments" JSONB NOT NULL DEFAULT '[]',
    "clientRef" TEXT,
    "offlineCreatedAt" TIMESTAMP(3),

    CONSTRAINT "VehicleCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleCheckResult" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "checklistItemId" TEXT,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "result" "CheckResultValue" NOT NULL,
    "note" TEXT,

    CONSTRAINT "VehicleCheckResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionType" (
    "id" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultIntervalValue" INTEGER,
    "defaultIntervalUnit" "IntervalUnit",
    "defaultReminderDays" INTEGER[] DEFAULT ARRAY[30, 14, 7]::INTEGER[],
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "InspectionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "lastDate" DATE,
    "intervalValue" INTEGER,
    "intervalUnit" "IntervalUnit",
    "assignedToId" TEXT,
    "workshop" TEXT,
    "estimatedCost" DECIMAL(10,2),
    "remarks" TEXT,
    "reminderDays" INTEGER[] DEFAULT ARRAY[30, 14, 7]::INTEGER[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "title" TEXT NOT NULL,
    "performedAt" DATE NOT NULL,
    "performedBy" TEXT,
    "workshop" TEXT,
    "cost" DECIMAL(10,2),
    "mileage" INTEGER,
    "passed" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isMedication" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MaterialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "articleNumber" TEXT,
    "categoryId" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'Stück',
    "manufacturer" TEXT,
    "batchTracked" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "imageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleMaterialStock" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "targetQuantity" INTEGER NOT NULL,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "currentQuantity" INTEGER NOT NULL DEFAULT 0,
    "compartment" TEXT,
    "refillLocationId" TEXT,
    "remarks" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleMaterialStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageLocation" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StorageLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseStock" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialBatch" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "vehicleStockId" TEXT,
    "warehouseStockId" TEXT,
    "batchNumber" TEXT,
    "expiryDate" DATE,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "reason" "MovementReason",
    "materialId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "fromVehicleStockId" TEXT,
    "toVehicleStockId" TEXT,
    "fromWarehouseStockId" TEXT,
    "toWarehouseStockId" TEXT,
    "batchId" TEXT,
    "batchNumber" TEXT,
    "expiryDate" DATE,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "refillRequestId" TEXT,
    "clientRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefillRequest" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "vehicleStockId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "requestedQuantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefillStatus" NOT NULL DEFAULT 'OPEN',
    "reportedById" TEXT NOT NULL,
    "providedQuantity" INTEGER,
    "providedById" TEXT,
    "providedAt" TIMESTAMP(3),
    "refilledQuantity" INTEGER,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefillRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Defect" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "DefectCategory" NOT NULL,
    "severity" "DefectSeverity" NOT NULL,
    "status" "DefectStatus" NOT NULL DEFAULT 'NEW',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedById" TEXT NOT NULL,
    "mileage" INTEGER,
    "assignedToId" TEXT,
    "dueDate" DATE,
    "affectsReadiness" BOOLEAN NOT NULL DEFAULT false,
    "measures" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "vehicleCheckId" TEXT,
    "checkItemLabel" TEXT,
    "clientRef" TEXT,
    "offlineCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Defect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefectComment" (
    "id" TEXT NOT NULL,
    "defectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "CommentKind" NOT NULL DEFAULT 'COMMENT',
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DefectComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vehicleId" TEXT,
    "defectId" TEXT,
    "vehicleCheckId" TEXT,
    "inspectionId" TEXT,
    "maintenanceRecordId" TEXT,
    "stockMovementId" TEXT,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "vehicleId" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleType_name_key" ON "VehicleType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_internalNumber_key" ON "Vehicle"("internalNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_licensePlate_key" ON "Vehicle"("licensePlate");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_imageId_key" ON "Vehicle"("imageId");

-- CreateIndex
CREATE INDEX "Vehicle_status_idx" ON "Vehicle"("status");

-- CreateIndex
CREATE INDEX "Vehicle_typeId_idx" ON "Vehicle"("typeId");

-- CreateIndex
CREATE INDEX "Vehicle_archivedAt_idx" ON "Vehicle"("archivedAt");

-- CreateIndex
CREATE INDEX "VehicleStatusChange_vehicleId_createdAt_idx" ON "VehicleStatusChange"("vehicleId", "createdAt");

-- CreateIndex
CREATE INDEX "VehicleAssignment_vehicleId_idx" ON "VehicleAssignment"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleAssignment_userId_vehicleId_key" ON "VehicleAssignment"("userId", "vehicleId");

-- CreateIndex
CREATE INDEX "Checklist_vehicleTypeId_idx" ON "Checklist"("vehicleTypeId");

-- CreateIndex
CREATE INDEX "ChecklistItem_checklistId_sortOrder_idx" ON "ChecklistItem"("checklistId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCheck_clientRef_key" ON "VehicleCheck"("clientRef");

-- CreateIndex
CREATE INDEX "VehicleCheck_vehicleId_performedAt_idx" ON "VehicleCheck"("vehicleId", "performedAt");

-- CreateIndex
CREATE INDEX "VehicleCheckResult_checkId_idx" ON "VehicleCheckResult"("checkId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionType_key_key" ON "InspectionType"("key");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionType_name_key" ON "InspectionType"("name");

-- CreateIndex
CREATE INDEX "Inspection_vehicleId_dueDate_idx" ON "Inspection"("vehicleId", "dueDate");

-- CreateIndex
CREATE INDEX "Inspection_dueDate_idx" ON "Inspection"("dueDate");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_vehicleId_performedAt_idx" ON "MaintenanceRecord"("vehicleId", "performedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCategory_name_key" ON "MaterialCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Material_imageId_key" ON "Material"("imageId");

-- CreateIndex
CREATE INDEX "Material_categoryId_idx" ON "Material"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_name_articleNumber_key" ON "Material"("name", "articleNumber");

-- CreateIndex
CREATE INDEX "VehicleMaterialStock_materialId_idx" ON "VehicleMaterialStock"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleMaterialStock_vehicleId_materialId_key" ON "VehicleMaterialStock"("vehicleId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_name_key" ON "Warehouse"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StorageLocation_warehouseId_name_key" ON "StorageLocation"("warehouseId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseStock_materialId_locationId_key" ON "WarehouseStock"("materialId", "locationId");

-- CreateIndex
CREATE INDEX "MaterialBatch_vehicleStockId_idx" ON "MaterialBatch"("vehicleStockId");

-- CreateIndex
CREATE INDEX "MaterialBatch_warehouseStockId_idx" ON "MaterialBatch"("warehouseStockId");

-- CreateIndex
CREATE INDEX "MaterialBatch_expiryDate_idx" ON "MaterialBatch"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_clientRef_key" ON "StockMovement"("clientRef");

-- CreateIndex
CREATE INDEX "StockMovement_materialId_createdAt_idx" ON "StockMovement"("materialId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_fromVehicleStockId_idx" ON "StockMovement"("fromVehicleStockId");

-- CreateIndex
CREATE INDEX "StockMovement_toVehicleStockId_idx" ON "StockMovement"("toVehicleStockId");

-- CreateIndex
CREATE INDEX "StockMovement_refillRequestId_idx" ON "StockMovement"("refillRequestId");

-- CreateIndex
CREATE INDEX "RefillRequest_status_idx" ON "RefillRequest"("status");

-- CreateIndex
CREATE INDEX "RefillRequest_vehicleId_status_idx" ON "RefillRequest"("vehicleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Defect_clientRef_key" ON "Defect"("clientRef");

-- CreateIndex
CREATE INDEX "Defect_vehicleId_status_idx" ON "Defect"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "Defect_severity_status_idx" ON "Defect"("severity", "status");

-- CreateIndex
CREATE INDEX "DefectComment_defectId_createdAt_idx" ON "DefectComment"("defectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_vehicleId_idx" ON "Attachment"("vehicleId");

-- CreateIndex
CREATE INDEX "Attachment_defectId_idx" ON "Attachment"("defectId");

-- CreateIndex
CREATE INDEX "Attachment_vehicleCheckId_idx" ON "Attachment"("vehicleCheckId");

-- CreateIndex
CREATE INDEX "Attachment_inspectionId_idx" ON "Attachment"("inspectionId");

-- CreateIndex
CREATE INDEX "Attachment_maintenanceRecordId_idx" ON "Attachment"("maintenanceRecordId");

-- CreateIndex
CREATE INDEX "Attachment_stockMovementId_idx" ON "Attachment"("stockMovementId");

-- CreateIndex
CREATE INDEX "Attachment_uploadedById_createdAt_idx" ON "Attachment"("uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_vehicleId_createdAt_idx" ON "AuditLog"("vehicleId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "VehicleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleStatusChange" ADD CONSTRAINT "VehicleStatusChange_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleStatusChange" ADD CONSTRAINT "VehicleStatusChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "VehicleType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCheck" ADD CONSTRAINT "VehicleCheck_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCheck" ADD CONSTRAINT "VehicleCheck_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCheck" ADD CONSTRAINT "VehicleCheck_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCheckResult" ADD CONSTRAINT "VehicleCheckResult_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "VehicleCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCheckResult" ADD CONSTRAINT "VehicleCheckResult_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "InspectionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MaterialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleMaterialStock" ADD CONSTRAINT "VehicleMaterialStock_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleMaterialStock" ADD CONSTRAINT "VehicleMaterialStock_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleMaterialStock" ADD CONSTRAINT "VehicleMaterialStock_refillLocationId_fkey" FOREIGN KEY ("refillLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseStock" ADD CONSTRAINT "WarehouseStock_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseStock" ADD CONSTRAINT "WarehouseStock_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialBatch" ADD CONSTRAINT "MaterialBatch_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialBatch" ADD CONSTRAINT "MaterialBatch_vehicleStockId_fkey" FOREIGN KEY ("vehicleStockId") REFERENCES "VehicleMaterialStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialBatch" ADD CONSTRAINT "MaterialBatch_warehouseStockId_fkey" FOREIGN KEY ("warehouseStockId") REFERENCES "WarehouseStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_fromVehicleStockId_fkey" FOREIGN KEY ("fromVehicleStockId") REFERENCES "VehicleMaterialStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toVehicleStockId_fkey" FOREIGN KEY ("toVehicleStockId") REFERENCES "VehicleMaterialStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_fromWarehouseStockId_fkey" FOREIGN KEY ("fromWarehouseStockId") REFERENCES "WarehouseStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toWarehouseStockId_fkey" FOREIGN KEY ("toWarehouseStockId") REFERENCES "WarehouseStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MaterialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_refillRequestId_fkey" FOREIGN KEY ("refillRequestId") REFERENCES "RefillRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_vehicleStockId_fkey" FOREIGN KEY ("vehicleStockId") REFERENCES "VehicleMaterialStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_providedById_fkey" FOREIGN KEY ("providedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_vehicleCheckId_fkey" FOREIGN KEY ("vehicleCheckId") REFERENCES "VehicleCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectComment" ADD CONSTRAINT "DefectComment_defectId_fkey" FOREIGN KEY ("defectId") REFERENCES "Defect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectComment" ADD CONSTRAINT "DefectComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_defectId_fkey" FOREIGN KEY ("defectId") REFERENCES "Defect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_vehicleCheckId_fkey" FOREIGN KEY ("vehicleCheckId") REFERENCES "VehicleCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_maintenanceRecordId_fkey" FOREIGN KEY ("maintenanceRecordId") REFERENCES "MaintenanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────── 
-- ─────────── Zusätzliche Integritätsregeln (nicht in Prisma-Schema abbildbar) ───────────

-- Höchstens eine aktive Nachfüllanforderung je Fahrzeugbestand (verhindert Doppelmeldungen)
CREATE UNIQUE INDEX "RefillRequest_one_active_per_stock"
  ON "RefillRequest" ("vehicleStockId")
  WHERE "status" IN ('OPEN', 'IN_PROGRESS', 'PROVIDED');

-- Bestände dürfen niemals negativ werden
ALTER TABLE "VehicleMaterialStock" ADD CONSTRAINT "VehicleMaterialStock_quantities_nonneg"
  CHECK ("currentQuantity" >= 0 AND "targetQuantity" >= 0 AND "minQuantity" >= 0);
ALTER TABLE "WarehouseStock" ADD CONSTRAINT "WarehouseStock_quantities_nonneg"
  CHECK ("quantity" >= 0 AND "minQuantity" >= 0);
ALTER TABLE "MaterialBatch" ADD CONSTRAINT "MaterialBatch_quantity_nonneg" CHECK ("quantity" >= 0);
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_quantity_pos" CHECK ("requestedQuantity" >= 0);

-- Eine Charge gehört genau einem Bestand (Fahrzeug XOR Lager)
ALTER TABLE "MaterialBatch" ADD CONSTRAINT "MaterialBatch_single_holder"
  CHECK (("vehicleStockId" IS NULL) <> ("warehouseStockId" IS NULL));

-- Eine Lagerbewegung braucht eine Menge ungleich 0
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_quantity_nonzero" CHECK ("quantity" <> 0);

-- Ein Anhang ist höchstens einem Datensatz zugeordnet
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_single_owner" CHECK (
  (("vehicleId" IS NOT NULL)::int + ("defectId" IS NOT NULL)::int + ("vehicleCheckId" IS NOT NULL)::int
   + ("inspectionId" IS NOT NULL)::int + ("maintenanceRecordId" IS NOT NULL)::int
   + ("stockMovementId" IS NOT NULL)::int) <= 1
);

-- Änderungsprotokoll, Lagerbewegungen und abgeschlossene Kontrollergebnisse sind unveränderlich
CREATE OR REPLACE FUNCTION drk_prevent_modification() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Datensätze in % sind unveränderlich (revisionssicher)', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_immutable"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION drk_prevent_modification();

CREATE TRIGGER "StockMovement_immutable"
  BEFORE UPDATE OR DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION drk_prevent_modification();

CREATE TRIGGER "VehicleCheckResult_immutable"
  BEFORE UPDATE OR DELETE ON "VehicleCheckResult"
  FOR EACH ROW EXECUTE FUNCTION drk_prevent_modification();

-- Bei Kontrollen dürfen nur Nachträge (amendments) ergänzt werden
CREATE OR REPLACE FUNCTION drk_vehicle_check_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Abgeschlossene Fahrzeugkontrollen dürfen nicht gelöscht werden'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."vehicleId" IS DISTINCT FROM OLD."vehicleId"
     OR NEW."performedById" IS DISTINCT FROM OLD."performedById"
     OR NEW."performedAt" IS DISTINCT FROM OLD."performedAt"
     OR NEW."mileage" IS DISTINCT FROM OLD."mileage"
     OR NEW."remarks" IS DISTINCT FROM OLD."remarks"
     OR NEW."outcome" IS DISTINCT FROM OLD."outcome"
     OR NEW."checkType" IS DISTINCT FROM OLD."checkType"
     OR NEW."completedAt" IS DISTINCT FROM OLD."completedAt" THEN
    RAISE EXCEPTION 'Abgeschlossene Fahrzeugkontrollen sind unveränderlich – bitte Nachtrag verwenden'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "VehicleCheck_guard"
  BEFORE UPDATE OR DELETE ON "VehicleCheck"
  FOR EACH ROW EXECUTE FUNCTION drk_vehicle_check_guard();
