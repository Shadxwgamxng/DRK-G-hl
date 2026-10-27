// Tests laufen ausschließlich gegen eine separate Test-Datenbank
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://drk:drk@localhost:5432/drk_kfz_test?schema=public";
process.env.UPLOAD_DIR = process.env.TEST_UPLOAD_DIR ?? "./storage/test-uploads";
