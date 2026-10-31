#!/usr/bin/env python3
"""
exam_studio_client.py - Call Exam Studio through tool calling from any OpenAI-compatible model
(DeepSeek, NVIDIA, OpenRouter, Groq, Ollama, ...)

Requires: pip install requests
Set EXAM_STUDIO_TOKEN and EXAM_STUDIO_URL environment variables.
"""

import os
import json
import requests

TOKEN = os.environ.get("EXAM_STUDIO_TOKEN")
BASE = os.environ.get("EXAM_STUDIO_URL", "https://examstudio.duckdns.org")

if not TOKEN:
    print("Set EXAM_STUDIO_TOKEN to your Exam Studio PAT (est_... from account settings).", file=__import__("sys").stderr)
    raise SystemExit(1)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "exam_studio_generate_exam",
            "description": "Generate an RTB-style exam paper from course notes.",
            "parameters": {
                "type": "object",
                "required": ["text"],
                "properties": {
                    "text": {"type": "string", "description": "Course notes text"},
                    "title": {"type": "string", "description": "Exam / module title"},
                    "totalMarks": {"type": "integer", "default": 100},
                    "types": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
    },
]

PATH_MAP = {
    "exam_studio_generate_exam": "/api/v1/generate/exam",
}


def call_tool(name, args):
    path = PATH_MAP[name]
    resp = requests.post(
        f"{BASE}{path}",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json; charset=utf-8",
        },
        json=args,
        timeout=120,
    )
    if not resp.ok:
        raise RuntimeError(f"HTTP {resp.status_code}: {resp.text}")
    return resp.json()


def main():
    notes = """Unit 1 – Computer hardware.
The CPU is the brain of the computer. It executes instructions from memory.
RAM is volatile memory used for active programs. Storage (SSD/HDD) keeps data when powered off.
Input devices include keyboard and mouse. Output devices include monitor and printer."""

    result = call_tool("exam_studio_generate_exam", {
        "text": notes,
        "title": "Computer Hardware Fundamentals",
        "totalMarks": 40,
        "types": ["mcq", "true_false", "short_answer"],
    })

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print(f"Error: {err}", file=__import__("sys").stderr)
        raise SystemExit(1)
