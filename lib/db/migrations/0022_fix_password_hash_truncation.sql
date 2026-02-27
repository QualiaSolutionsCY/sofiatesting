-- Fix password hash column truncation (WA-001)
-- Bcrypt hashes are 60 chars but future hash formats may be longer
ALTER TABLE "User" ALTER COLUMN "password" TYPE varchar(255);
