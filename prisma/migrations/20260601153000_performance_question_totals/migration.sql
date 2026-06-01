ALTER TABLE "Performance" ADD COLUMN "questoes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Performance" ADD COLUMN "instituicao" TEXT;
ALTER TABLE "Performance" ADD COLUMN "observacoes" TEXT;
UPDATE "Performance" SET "questoes" = "acertos" + "erros" WHERE "questoes" = 0;
