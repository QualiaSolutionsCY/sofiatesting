#!/usr/bin/env python3
"""
Prepare sophia-bot deployment files for Supabase MCP deployment
"""
import json
import os
from pathlib import Path

def read_all_files():
    """Read all TypeScript files and prepare deployment structure"""
    base_dir = Path("/home/qualia/Projects/aiagents/sofiatesting/supabase/functions")
    sophia_bot_dir = base_dir / "sophia-bot"
    shared_dir = base_dir / "_shared"

    files = []

    # Read sophia-bot files
    for ts_file in sophia_bot_dir.rglob("*.ts"):
        relative_path = ts_file.relative_to(sophia_bot_dir)
        with open(ts_file, 'r', encoding='utf-8') as f:
            content = f.read()
        files.append({
            "name": str(relative_path),
            "content": content
        })

    # Read _shared files (use ../_shared/ prefix)
    for ts_file in shared_dir.glob("*.ts"):
        relative_path = f"../_shared/{ts_file.name}"
        with open(ts_file, 'r', encoding='utf-8') as f:
            content = f.read()
        files.append({
            "name": relative_path,
            "content": content
        })

    return files

def main():
    files = read_all_files()

    # Save to JSON for inspection
    output = {
        "project_id": "vceeheaxcrhmpqueudqx",
        "name": "sophia-bot",
        "entrypoint_path": "index.ts",
        "verify_jwt": False,
        "files": files,
        "file_count": len(files)
    }

    output_path = "/home/qualia/Projects/aiagents/sofiatesting/deploy_payload.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)

    print(f"✅ Prepared {len(files)} files for deployment")
    print(f"📦 Payload saved to: {output_path}")
    print(f"📊 Total size: {sum(len(f['content']) for f in files):,} bytes")

    # Print file list
    print("\n📂 Files included:")
    for f in sorted(files, key=lambda x: x['name']):
        print(f"   - {f['name']} ({len(f['content'])} bytes)")

if __name__ == "__main__":
    main()
