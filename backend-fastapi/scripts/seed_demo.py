"""Seed demo data into a running Expovision API (local development only).

Idempotently creates, through the public HTTP API:
  * a demo intensive flow that started yesterday, so programme days 1-2 are open
    (days 1-2 are the only days with full course content in this public version);
  * a demo student who has finished onboarding and the initial report, completed the
    lessons of days 1-2 and submitted the day-2 homework (it waits in the curator review queue);
  * spare license tokens for trying the activation flow at /activate.

All people and addresses here are fictional. Usage, with the stack running:

    docker compose exec backend python scripts/seed_demo.py
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

API_URL = os.getenv("SEED_API_URL", "http://localhost:4000").rstrip("/")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin12345!")

FLOW_CODE = "demo-flow"
FLOW_TITLE = "Demo flow"
FLOW_DAYS = 14
SPARE_TOKENS = 3

STUDENT = {
    "firstName": "Demo",
    "lastName": "Student",
    "email": "student@example.com",
    "password": "Student12345!",
    "language": "en",
}

ONBOARDING_ANSWERS = {
    "level": "chatgpt_tried",
    "interest": "build_product",
    "dailyTime": "1h",
    "goal": "build_mvp",
    "experience": ["chatgpt", "figma"],
}

COMPLETED_LESSON_DAYS = (1, 2)
HOMEWORK_DAY = 2
HOMEWORK_ANSWER = (
    "Steps:\n"
    "1. Installed Cursor and finished its first-run setup.\n"
    "2. Opened the terminal and ran mkdir expovision-hw && cd expovision-hw && code . so the "
    "empty folder opened in the editor.\n"
    "3. Created hello.txt with the line \"Hello, Expovision!\" and saved it.\n"
    "4. The file tree now shows expovision-hw/hello.txt, and cat hello.txt prints the line.\n\n"
    "Prompts:\n"
    "Bad prompt: \"How do I make a website?\" The answer was long and generic: hosting, "
    "frameworks and design tips, nothing I could do right away.\n"
    "Good prompt: \"I am a beginner using Cursor. Show me step by step how to create an "
    "index.html file with a heading and open it in the browser.\" The answer gave five concrete "
    "steps that worked on the first try.\n\n"
    "Takeaway: telling the model my level, my tool and a concrete goal made the answer usable."
)


class SeedError(RuntimeError):
    pass


def _call(client: httpx.Client, method: str, path: str, token: str | None = None, **kwargs: Any) -> Any:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    resp = client.request(method, f"{API_URL}{path}", headers=headers, **kwargs)
    if resp.status_code >= 400:
        raise SeedError(f"{method} {path} -> HTTP {resp.status_code}: {resp.text[:300]}")
    return resp.json() if resp.content else None


def _login(client: httpx.Client, email: str, password: str) -> str | None:
    resp = client.post(f"{API_URL}/auth/login", json={"email": email, "password": password})
    if resp.status_code == 401:
        return None
    if resp.status_code >= 400:
        raise SeedError(f"POST /auth/login -> HTTP {resp.status_code}: {resp.text[:300]}")
    return resp.json()["accessToken"]


def _ensure_flow(client: httpx.Client, admin: str) -> dict[str, Any]:
    for flow in _call(client, "GET", "/admin/flows", admin):
        if flow["code"] == FLOW_CODE:
            print(f"Flow '{FLOW_CODE}' already exists ({flow['id']}).")
            return flow
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
    created = _call(
        client,
        "POST",
        "/admin/flows/upsert",
        admin,
        json={
            "code": FLOW_CODE,
            "title": FLOW_TITLE,
            "description": "Fictional cohort created by scripts/seed_demo.py",
            "language": "en",
            "startsAtIso": start.isoformat(),
            "endsAtIso": (start + timedelta(days=FLOW_DAYS)).isoformat(),
            "timezone": "UTC",
            "isActive": True,
            "tokenCount": 0,
        },
    )
    print(f"Created flow '{FLOW_CODE}' ({created['flowId']}) starting {start.date()}.")
    return {"id": created["flowId"], "code": FLOW_CODE, "startsAt": start.isoformat()}


def _generate_tokens(client: httpx.Client, admin: str, flow: dict[str, Any], count: int) -> list[str]:
    result = _call(
        client,
        "POST",
        "/admin/license-tokens/generate",
        admin,
        json={"count": count, "intensiveStartAt": flow["startsAt"], "flowId": flow["id"]},
    )
    return [t["token"] for t in result["tokens"]]


def _ensure_student(client: httpx.Client, admin: str, flow: dict[str, Any]) -> str:
    token = _login(client, STUDENT["email"], STUDENT["password"])
    if token:
        print(f"Student {STUDENT['email']} already exists.")
        return token
    license_token = _generate_tokens(client, admin, flow, 1)[0]
    _call(client, "POST", "/auth/activate-license", json={**STUDENT, "token": license_token})
    print(f"Activated student {STUDENT['email']} with a license token.")
    token = _login(client, STUDENT["email"], STUDENT["password"])
    if not token:
        raise SeedError("Could not sign in as the demo student after activation")
    return token


def _progress_student(client: httpx.Client, student: str) -> None:
    me = _call(client, "GET", "/auth/me", student)
    if not me["onboardingDone"]:
        _call(client, "POST", "/onboarding", student, json=ONBOARDING_ANSWERS)
    if not me["reportCompleted"]:
        _call(client, "POST", "/report/complete-initial", student)

    for day in COMPLETED_LESSON_DAYS:
        for lesson in _call(client, "GET", f"/curriculum/day/{day}", student)["lessons"]:
            if lesson["status"] != "completed":
                _call(client, "POST", "/curriculum/lesson/complete", student, json={"lessonId": lesson["id"]})

    submissions = _call(client, "GET", "/homework/mine", student)
    if any(int(s.get("dayNumber") or 0) == HOMEWORK_DAY for s in submissions):
        print(f"Day-{HOMEWORK_DAY} homework already submitted.")
        return
    _call(
        client,
        "POST",
        "/homework/submit",
        student,
        json={
            "dayNumber": HOMEWORK_DAY,
            "answerText": HOMEWORK_ANSWER,
            "reflectionText": "The terminal was new for me, but the steps were easy to follow.",
            "aiUsageDisclosure": "I used ChatGPT only for the prompt comparison.",
        },
    )
    print(f"Submitted day-{HOMEWORK_DAY} homework (awaiting curator review).")


def _spare_tokens(client: httpx.Client, admin: str, flow: dict[str, Any]) -> list[str]:
    unused = [
        t["token"]
        for t in _call(client, "GET", "/admin/license-tokens", admin)
        if t["flowId"] == flow["id"] and not t["usedByUserId"]
    ]
    if len(unused) < SPARE_TOKENS:
        unused += _generate_tokens(client, admin, flow, SPARE_TOKENS - len(unused))
    return unused[:SPARE_TOKENS]


def main() -> int:
    with httpx.Client(timeout=30) as client:
        try:
            health = _call(client, "GET", "/health")
            if health.get("status") != "ok":
                raise SeedError(f"API is not healthy: {health}")
            admin = _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
            if not admin:
                raise SeedError("Admin sign-in failed: check ADMIN_EMAIL / ADMIN_PASSWORD")
            flow = _ensure_flow(client, admin)
            student = _ensure_student(client, admin, flow)
            _progress_student(client, student)
            tokens = _spare_tokens(client, admin, flow)
        except (SeedError, httpx.HTTPError) as exc:
            print(f"Seeding failed: {exc}", file=sys.stderr)
            return 1

    print()
    print("Demo data is ready.")
    print(f"  Admin / curator : {ADMIN_EMAIL} (password from ADMIN_PASSWORD)")
    print(f"  Student         : {STUDENT['email']} / {STUDENT['password']}")
    print("  Spare license tokens for /activate:")
    for t in tokens:
        print(f"    {t}")
    print("Note: signing in ends any earlier session of the same account (single-session login).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
