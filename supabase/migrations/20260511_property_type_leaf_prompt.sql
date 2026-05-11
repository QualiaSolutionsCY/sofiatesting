-- Update property_upload prompt to guide agents toward specific leaf property types
-- instead of generic categories like "apartment" or "building" which map to
-- non-selectable parent nodes on the Zyprus edit page.
--
-- This migration updates ONLY the Property Type line in the Required Fields section.
-- The file fallback (prompts/behaviors/property-upload.ts) has already been updated.

UPDATE sophia_prompts
SET content = REPLACE(
  content,
  '2. **Property Type** - apartment, house, villa, maisonette, bungalow, penthouse, townhouse, studio, residential building',
  '2. **Property Type** - Use the SPECIFIC sub-type, not a generic category. The Zyprus system requires a leaf type:
   - **Apartments:** flat, penthouse, studio, entire floor apartment (if agent just says "apartment", ask: "Is it a flat, penthouse, studio, or entire floor apartment?")
   - **Houses:** detached house, semi-detached house, bungalow, townhouse (if agent just says "house", ask: "Is it a detached house, semi-detached, bungalow, or townhouse?")
   - **Buildings:** residential building, commercial building, mixed-use building, hotel (if agent just says "building", ask: "Is it a residential, commercial, mixed-use building, or hotel?")
   - **Other:** office, shop, industrial
   - villa and maisonette are also accepted (villa maps to detached house, maisonette maps to flat)'
),
updated_at = NOW()
WHERE key = 'property_upload'
  AND is_active = true
  AND is_current = true;
