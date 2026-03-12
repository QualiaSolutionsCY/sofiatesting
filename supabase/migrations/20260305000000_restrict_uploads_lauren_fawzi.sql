-- Restrict listing uploads to only Lauren and Fawzi
-- Set all agents to not be able to upload initially
UPDATE agents SET can_upload = false;

-- Re-enable for Lauren
UPDATE agents 
SET can_upload = true 
WHERE communication_email = 'listings@zyprus.com' 
   OR listing_owner_email = 'listings@zyprus.com' 
   OR full_name ILIKE '%lauren%';

-- Re-enable for Fawzi
UPDATE agents 
SET can_upload = true 
WHERE full_name ILIKE '%fawzi%';
