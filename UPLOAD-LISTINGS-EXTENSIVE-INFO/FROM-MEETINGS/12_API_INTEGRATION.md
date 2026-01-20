# API & System Integration

## Overview

This document covers the technical integration between Sophia and the Zypress platform, including API endpoints, authentication, and system fields.

---

## AUTHENTICATION

### Account
- **Account Name:** Sophia AI / AI Test
- **Server:** Development server (dev) for testing, Production for live
- **Authentication:** Username/password based login

### Access Requirements
- Must be logged in to access draft dashboard
- Must have permissions to create draft properties
- Must have permissions to view all agent accounts (for autocomplete)

---

## KEY SYSTEM ENDPOINTS

### Property Upload
- Properties are created via the Zypress CMS/Dashboard
- Can be done via direct UI interaction or API

### Draft Dashboard
- Location: My Draft Properties section
- Shows all draft properties assigned to the logged-in reviewer
- Allows: Publish, Edit, Delete actions

### Search/Dashboard
- Used for duplicate checking
- Supports: Phone number, name, address, reference searches
- Robust phone number matching (handles various formats)

---

## API FIELD MAPPING

### Listing Reviewer Fields

| Field Name | Type | Description |
|------------|------|-------------|
| listing_reviewer_1 | Email (autocomplete) | Primary reviewer email |
| listing_reviewer_2 | Email (autocomplete) | Secondary reviewer email (optional) |
| listing_owner | Email (autocomplete) | Agent account where property is assigned |
| listing_instructor | Email (autocomplete) | Person who requested upload |

**Notes:**
- Multiple reviewers separated by comma
- Autocomplete suggests from registered agent emails
- One person only for listing_instructor

### AI-Specific Fields

| Field Name | Type | Description |
|------------|------|-------------|
| ai_generated | Boolean/Checkbox | Tick when Sophia uploads |
| ai_message | Text | Notes from AI (duplicates, concerns) |
| potential_duplicate | Boolean/Checkbox | Tick if duplicate suspected |

### Draft Reference Fields

| Field Name | Type | Description |
|------------|------|-------------|
| draft_own_reference | Text | Property reference code |
| own_reference | Text | Same as draft_own_reference after publish |

---

## PROPERTY TYPE REFERENCES

The API uses specific references for property types. Must match exactly:

| Property Type | API Reference |
|---------------|---------------|
| Apartment | apartment |
| House | house |
| Villa | villa |
| Land | land |
| Commercial | commercial |
| Office | office |

---

## LOCATION REFERENCES

Locations must reference existing entities in the system:
- Paphos region locations
- Limassol region locations
- Larnaca region locations
- Nicosia region locations
- Famagusta region locations

The API provides autocomplete for valid locations.

---

## IMAGE UPLOAD

### Method
- Drag and drop to gallery section
- Or file upload dialog

### Accepted Formats
- JPEG/JPG
- PNG
- WebP (may require conversion)

### Size Limits
- Check system limits
- Compress if needed

### Order
- First uploaded = first displayed
- Reorder via drag and drop

---

## REQUIRED VS OPTIONAL FIELDS

### Required (Validation Fails Without):
- Price
- Property Type
- Location
- Listing Owner
- At least 1 image

### Required for Quality:
- Listing Reviewer 1
- Listing Instructor
- AI Generated checkbox
- Bedrooms/Bathrooms (for residential)
- Description

### Optional:
- Listing Reviewer 2 (depends on rules)
- AI Message
- Potential Duplicate checkbox
- Registration number
- Plot size

---

## ERROR HANDLING

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 403 Forbidden | Access denied to draft dashboard | Check account permissions |
| Validation Failed | Missing required field | Fill all required fields |
| JSON API Exception | Malformed request | Check data format |
| Image Upload Failed | File too large or wrong format | Compress/convert image |
| Location Not Found | Invalid location reference | Use autocomplete to get valid location |

### Retry Logic
- If upload fails, check error message
- Correct the issue
- Retry upload
- Do not create duplicate attempts

---

## INTEGRATION POINTS

### Telegram Bot
- Receives upload requests
- Processes messages and attachments
- Interacts with Zypress via API/UI

### WhatsApp
- Same functionality as Telegram
- Different interface

### Email
- Can receive upload requests via email
- Process attachments and text content

### Back Office Dashboard
- Monitoring Sophia's actions
- Viewing chat history
- Tracking leads and uploads

---

## RATE LIMITS & PERFORMANCE

### Considerations
- Don't spam API with rapid requests
- Wait for responses before sending next request
- Image uploads take longer than text fields

### Typical Timing
- Property creation: 2-5 seconds
- Image upload: 5-15 seconds per image
- Search: 1-3 seconds

---

## POSTMAN DOCUMENTATION

API documentation is maintained in Postman:
- Endpoint definitions
- Request/response examples
- Authentication setup

Developer (Denys) maintains this documentation.

---

## TESTING

### Dev Server
- Use for all testing
- `dev9.zypress.com` or similar
- Separate from production data

### Test Accounts
- AI Test account for development
- Sophia AI account for production

### Test Checklist
- [ ] Can log in
- [ ] Can access add property page
- [ ] Can see all form fields
- [ ] Can see draft dashboard
- [ ] Can search for duplicates
- [ ] Can upload images
- [ ] Can save draft
- [ ] Draft appears in reviewer dashboard

---

## DATA FLOW

```
[User Message]
     ↓
[Sophia AI Processing]
     ↓
[Extract Property Data]
     ↓
[Format for API]
     ↓
[Zypress API/Dashboard]
     ↓
[Create Draft Record]
     ↓
[Notify Reviewers]
     ↓
[Appear in Draft Dashboard]
```

---

## SECURITY NOTES

- Never expose API credentials in logs
- Owner details (name, phone) are sensitive data
- Session tokens expire - handle re-authentication
- All communications should be secure (HTTPS)

---

## MAINTENANCE

### When System Changes
If Zypress developers update the system:
- Check for new fields
- Verify existing fields still work
- Update documentation

### Reporting Issues
Contact Denys (developer) for:
- API access issues
- New field requests
- Bug reports
- Documentation updates
