from fastapi import HTTPException

from app.deps.auth import CurrentUser, require_roles


def test_require_roles_allows_expected_role() -> None:
    checker = require_roles("admin")
    user = CurrentUser(user_id="u1", role="admin", language="ru")
    assert checker(user).role == "admin"


def test_require_roles_denies_unexpected_role() -> None:
    checker = require_roles("admin")
    user = CurrentUser(user_id="u1", role="student", language="ru")
    try:
        checker(user)
        assert False, "Expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 403
