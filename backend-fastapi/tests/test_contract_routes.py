from app.main import app


def test_required_routes_exist() -> None:
    paths = set(app.openapi()["paths"].keys())
    required = {
        "/health",
        "/auth/signup",
        "/auth/login",
        "/auth/refresh",
        "/auth/logout",
        "/auth/me",
        "/auth/activate-license",
        "/auth/password/request-reset",
        "/auth/password/reset",
        "/dashboard",
        "/dashboard/student-bootstrap",
        "/curriculum/day/{day_number}",
        "/curriculum/lesson/{lesson_id}",
        "/curriculum/lesson/{lesson_id}/ai-fluency",
        "/curriculum/lesson/complete",
        "/curriculum/library",
        "/homework/template/{day_number}",
        "/homework/submit",
        "/homework/evidence-check",
        "/homework/ai-coach",
        "/homework/mine",
        "/homework/curator/pending",
        "/homework/curator/review",
        "/webinar/{webinar_id}",
        "/track/select",
        "/report/complete-initial",
        "/final",
        "/admin/intensive/start",
        "/admin/license-tokens/generate",
        "/admin/report",
        "/admin/audit-logs",
        "/admin/users",
        "/admin/users/role",
        "/admin/users/{user_id}/reset-password",
        "/admin/content/days",
        "/admin/content/day/{day_id}",
        "/admin/content/lesson",
        "/admin/content/webinar",
        "/admin/content/artifact",
        "/admin/content/homework-template",
    }
    assert required.issubset(paths)


def test_trimmed_routes_are_absent() -> None:
    """Modules left out of this public build must not be routed."""
    paths = set(app.openapi()["paths"].keys())
    assert not any(p.startswith(("/mentor", "/learning-board", "/admin/experiments")) for p in paths)
    assert "/admin/content/lesson/version" not in paths
