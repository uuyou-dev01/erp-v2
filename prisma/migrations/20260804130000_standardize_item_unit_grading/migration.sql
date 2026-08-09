ALTER TABLE "item_units"
ADD COLUMN IF NOT EXISTS "conditionType" TEXT NOT NULL DEFAULT 'USED',
ADD COLUMN IF NOT EXISTS "functionStatus" TEXT NOT NULL DEFAULT 'UNTESTED';

ALTER TABLE "quick_entries"
ADD COLUMN IF NOT EXISTS "conditionGrade" TEXT,
ADD COLUMN IF NOT EXISTS "functionStatus" TEXT;

UPDATE "item_units"
SET
  "conditionType" = CASE
    WHEN UPPER(COALESCE("conditionGrade", '')) IN ('NEW', '新品', '全新') THEN 'NEW'
    ELSE 'USED'
  END,
  "conditionGrade" = CASE UPPER(COALESCE("conditionGrade", ''))
    WHEN 'NEW' THEN NULL
    WHEN '新品' THEN NULL
    WHEN '全新' THEN NULL
    WHEN 'LIKE_NEW' THEN 'S'
    WHEN 'EXCELLENT' THEN 'A'
    WHEN 'GOOD' THEN 'B'
    WHEN 'FAIR' THEN 'C'
    WHEN 'POOR' THEN 'D'
    WHEN 'DEFECTIVE' THEN 'D'
    WHEN 'S' THEN 'S'
    WHEN 'A' THEN 'A'
    WHEN 'B' THEN 'B'
    WHEN 'C' THEN 'C'
    WHEN 'D' THEN 'D'
    ELSE 'UNASSESSED'
  END,
  "functionStatus" = CASE
    WHEN UPPER(COALESCE("conditionGrade", '')) IN ('NEW', '新品', '全新') THEN 'NORMAL'
    ELSE 'UNTESTED'
  END;

UPDATE "quick_entries"
SET
  "conditionGrade" = CASE
    WHEN "conditionType" ~* '(中古|二手|used|瑕疵|非统一|混合)' THEN 'UNASSESSED'
    ELSE NULL
  END,
  "functionStatus" = CASE
    WHEN "conditionType" ~* '(中古|二手|used|瑕疵|非统一|混合)' THEN 'UNTESTED'
    ELSE 'NORMAL'
  END;
