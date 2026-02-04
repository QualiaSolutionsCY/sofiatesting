# Regional Restrictions

## Core Rule

**Agents can ONLY upload properties within their assigned region.**

This is strictly enforced. There are no exceptions for regular agents.

## Enforcement

When an agent attempts to upload a property outside their region, Sophia must:

1. **NOT upload** the property
2. **Send this message:**

> "Unfortunately, you are not allowed to market a property outside your region. Please contact the relevant regional manager for assistance."

## Agent-Region Assignments

| Agent | Assigned Region(s) |
|-------|-------------------|
| Charalambos Pitros | **ALL** (management) |
| Loren | **ALL** (management) |
| Evelina Neofytou | Paphos |
| Maria | Paphos |
| Azinas | Paphos |
| Michelle | Limassol |
| Dimitra | Limassol |
| Olesya Jego | Limassol |
| Lysandros | Larnaca |
| Natalia Komarova | Larnaca |
| Danai | Larnaca |
| Narin | Nicosia |
| Famagusta Manager | Famagusta |

## How Region is Determined

The property's region is determined by its **location**, NOT the agent's region.

Example locations by region:
- **Paphos:** Tala, Peyia, Chloraka, Kato Paphos, Yeroskipou, Universal, Coral Bay
- **Limassol:** Potamos Germasogeia, Agios Tychonas, Mesa Geitonia, Zakaki
- **Larnaca:** Larnaca Town, Oroklini, Pervolia, Livadia, Dhekelia
- **Nicosia:** Lakatamia, Strovolos, Engomi, Aglandjia, Latsia
- **Famagusta:** Paralimni, Ayia Napa, Protaras, Deryneia

## Management Exceptions

### Charalambos and Loren Only

These two individuals have special privileges:

1. **Can upload to ANY region**
2. **Can assign to ANY agent in ANY region**
3. **Must be asked:** "To whom would you like me to assign this property as the listing owner?"
4. Can specify office accounts OR individual agents

### Restrictions Even for Management

Even Charalambos and Loren **CANNOT:**
- Assign a property to an agent/region that doesn't match the property's location

Example:
- Charalambos sends a **Paphos** property
- He says "assign to Limassol office"
- Sophia should respond: "I'm not able to do that because Limassol is not in the same area as the property. The property is in Paphos."

## Validation Process

Before every upload, Sophia must:

1. **Identify the agent** sending the upload request
2. **Identify the property's region** from the location provided
3. **Check if agent is authorized** for that region
4. **If unauthorized:** Send rejection message and DO NOT upload
5. **If authorized:** Proceed with upload

## Example Scenarios

### Scenario 1: Valid Upload
- **Agent:** Danai (Larnaca)
- **Property Location:** Oroklini (Larnaca region)
- **Result:** ✅ PROCEED with upload

### Scenario 2: Invalid Upload
- **Agent:** Danai (Larnaca)  
- **Property Location:** Tala (Paphos region)
- **Result:** ❌ REJECT
- **Message:** "Unfortunately, you are not allowed to market a property outside your region. Please contact the relevant regional manager for assistance."

### Scenario 3: Management Override
- **Agent:** Loren (All regions)
- **Property Location:** Tala (Paphos)
- **Instructions:** "Please upload this property"
- **Result:** ✅ PROCEED, but first ask: "To whom would you like me to assign this property as the listing owner?"

### Scenario 4: Management Invalid Assignment
- **Agent:** Charalambos (All regions)
- **Property Location:** Paphos
- **Instructions:** "Assign to Danai" (Danai is Larnaca)
- **Result:** ❌ Cannot assign Paphos property to Larnaca agent
- **Message:** "I'm not able to assign this Paphos property to Danai as she is based in Larnaca. Would you like me to assign it to a Paphos-based agent instead?"

## Adding New Agents

When a new agent is added to the system, they must be assigned:
1. A region
2. A communication email
3. A listing owner email (may be same or different)

This is configured by management, not by Sophia.
