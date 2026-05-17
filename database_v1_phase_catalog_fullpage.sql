-- Phase: Catalog Full Page Template Support
-- 1. Adds slogan column to company_settings for use in catalog print templates
-- 2. Adds catalog_link and location_image columns to billboards table
-- 3. Adds catalog_link column to products table

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS slogan TEXT;

ALTER TABLE billboards ADD COLUMN IF NOT EXISTS catalog_link TEXT;
ALTER TABLE billboards ADD COLUMN IF NOT EXISTS location_image TEXT;

ALTER TABLE products ADD COLUMN IF NOT EXISTS catalog_link TEXT;
