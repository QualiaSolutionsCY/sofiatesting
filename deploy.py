#!/usr/bin/env python3
"""
Deploy sophia-bot via Supabase MCP tool
"""
import json

# Load the deployment payload
with open('/home/qualia/Projects/aiagents/sofiatesting/deploy_payload.json', 'r') as f:
    payload = json.load(f)

# Extract just what we need for the MCP tool
deployment_data = {
    "project_id": payload["project_id"],
    "name": payload["name"],
    "entrypoint_path": payload["entrypoint_path"],
    "verify_jwt": payload["verify_jwt"],
    "files": payload["files"]
}

# Save to a file that we can pass to Claude
with open('/home/qualia/Projects/aiagents/sofiatesting/deploy_mcp.json', 'w') as f:
    json.dump(deployment_data, f)

print(f"✅ MCP deployment payload ready")
print(f"📦 Files: {len(deployment_data['files'])}")
print(f"📝 Entrypoint: {deployment_data['entrypoint_path']}")
print(f"🔒 JWT verification: {deployment_data['verify_jwt']}")
