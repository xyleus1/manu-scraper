-- CreateTable
CREATE TABLE "AlibabaManu" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "moq" TEXT,
    "about" TEXT,
    "storeLink" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlibabaManu_pkey" PRIMARY KEY ("id")
);
