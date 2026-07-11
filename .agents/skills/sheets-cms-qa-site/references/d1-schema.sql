-- D1 schema for the sheets-driven QA site.
-- Apply locally with: pnpm wrangler d1 execute <db-name> --local --file=references/d1-schema.sql
-- Apply to production with: pnpm wrangler d1 migrations apply <db-name> --remote

CREATE TABLE companies (
  slug TEXT PRIMARY KEY,        -- from 設定.識別子
  name TEXT NOT NULL,           -- 会社名
  postal_code TEXT,             -- 郵便番号
  address TEXT,                 -- 住所
  phone TEXT,                   -- 電話番号
  email TEXT,                   -- メールアドレス
  contact_person TEXT,          -- 担当者名
  is_active INTEGER DEFAULT 1,  -- 公開
  updated_at TEXT
);

CREATE TABLE common_qa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,       -- カテゴリ
  question TEXT NOT NULL,       -- 質問
  answer TEXT NOT NULL,         -- 回答
  display_order INTEGER DEFAULT 0, -- 表示順
  is_active INTEGER DEFAULT 1   -- 公開
);

CREATE TABLE company_qa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_slug TEXT NOT NULL REFERENCES companies(slug),
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);
CREATE INDEX idx_company_qa_slug ON company_qa(company_slug);

-- Note: there is no display_order column on `companies`. This system routes
-- by query parameter (?id=<slug>) and never lists organizations against each
-- other, so there is nothing to sort. Do not add one speculatively.
