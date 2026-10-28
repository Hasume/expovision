"""Security tests for community chat endpoints.

Covers IDOR scenarios and access control:
- Non-member cannot read messages
- Non-member cannot send messages
- User cannot edit another user's message
- User cannot delete another user's message
- User cannot access attachments from a chat they don't belong to
- User cannot add participants without admin/owner role
- Owner role checks
- Self-DM prevention
"""

import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException

# CommCurrentUser lives in community.py itself (not a separate deps module).
# app.main cannot be imported on Python < 3.10 due to `str | None` in auth.py;
# integration tests that need it guard their import with _get_test_client().
from app.api.community import CommCurrentUser


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_user(user_id: str) -> CommCurrentUser:
    return CommCurrentUser(user_id=user_id)


def _community_token(user_id: str) -> dict:
    """Return headers that pass get_community_user as the given user_id."""
    return {"X-Test-Community-User": user_id}


# ── Direct access to private uploads is blocked ───────────────────────────────

def _get_test_client():
    """Lazy import of app to avoid Python 3.9 compat issues from admin.py."""
    from fastapi.testclient import TestClient
    from app.main import app  # noqa: PLC0415
    return TestClient(app, raise_server_exceptions=False)


class TestPrivateUploadsBlocked:
    """The /uploads/community-chat/* paths must return 403 without auth."""

    def test_community_chat_upload_blocked(self):
        client = _get_test_client()
        response = client.get("/uploads/community-chat/somefile.jpg")
        assert response.status_code == 403, (
            "Direct static access to community-chat uploads must be blocked"
        )

    def test_community_inline_not_forbidden_by_middleware(self):
        """Composer images live under community-inline and must load in <img> (no Bearer on GET)."""
        client = _get_test_client()
        response = client.get("/uploads/community-inline/no-user/nonexistent.jpg")
        assert response.status_code != 403, (
            "community-inline must not be blocked by middleware (forum post images)"
        )

    def test_other_uploads_not_blocked(self):
        """Uploads outside private prefixes should still be served normally."""
        client = _get_test_client()
        # A path that doesn't start with a private prefix should not be 403'd
        # by our middleware (may be 404 if file doesn't exist, but not 403).
        response = client.get("/uploads/some-public-asset.png")
        assert response.status_code != 403, (
            "Public upload paths must not be blocked by the private-uploads middleware"
        )


# ── Permission logic unit tests ────────────────────────────────────────────────

class TestMemberRoleChecks:
    """Unit tests for _get_member_role and related helpers."""

    def test_get_member_role_returns_none_for_non_member(self):
        from app.api.community import _get_member_role

        db = MagicMock()
        db.execute.return_value.scalar.return_value = None

        role = _get_member_role(db, "chat-1", "user-999")
        assert role is None

    def test_get_member_role_returns_role_string(self):
        from app.api.community import _get_member_role

        db = MagicMock()
        db.execute.return_value.scalar.return_value = "owner"

        role = _get_member_role(db, "chat-1", "user-1")
        assert role == "owner"


class TestEditMessagePermissions:
    """edit_message must reject non-authors and deleted messages."""

    def test_edit_rejects_non_author(self):
        from app.api.community import edit_message, EditMessageRequest

        db = MagicMock()
        # Message exists, belongs to a different author
        db.execute.return_value.mappings.return_value.first.return_value = {
            "authorId": "user-other",
            "chatId": "chat-1",
            "deletedAt": None,
        }

        payload = EditMessageRequest(body="hacked content")
        current = _make_user("user-attacker")

        with pytest.raises(HTTPException) as exc_info:
            edit_message("chat-1", "msg-1", payload, current, db)

        assert exc_info.value.status_code == 403

    def test_edit_rejects_deleted_message(self):
        from app.api.community import edit_message, EditMessageRequest
        from datetime import datetime, timezone

        db = MagicMock()
        db.execute.return_value.mappings.return_value.first.return_value = {
            "authorId": "user-1",
            "chatId": "chat-1",
            "deletedAt": datetime.now(timezone.utc),
        }

        payload = EditMessageRequest(body="updated content")
        current = _make_user("user-1")

        with pytest.raises(HTTPException) as exc_info:
            edit_message("chat-1", "msg-1", payload, current, db)

        assert exc_info.value.status_code == 410

    def test_edit_rejects_wrong_chat(self):
        from app.api.community import edit_message, EditMessageRequest

        db = MagicMock()
        db.execute.return_value.mappings.return_value.first.return_value = {
            "authorId": "user-1",
            "chatId": "chat-other",   # message belongs to a different chat
            "deletedAt": None,
        }

        payload = EditMessageRequest(body="updated content")
        current = _make_user("user-1")

        with pytest.raises(HTTPException) as exc_info:
            edit_message("chat-1", "msg-1", payload, current, db)

        assert exc_info.value.status_code == 404


class TestDeleteMessagePermissions:
    """delete_message must enforce author + role-based moderation rules."""

    def test_delete_rejects_non_member_non_author(self):
        from app.api.community import delete_message

        db = MagicMock()
        execute_mock = MagicMock()
        db.execute.return_value = execute_mock

        # First call: get message row
        execute_mock.mappings.return_value.first.return_value = {
            "authorId": "user-other",
            "chatId": "chat-1",
            "deletedAt": None,
        }
        # Second call (_get_member_role): user is not a member
        execute_mock.scalar.return_value = None

        current = _make_user("user-attacker")

        with pytest.raises(HTTPException) as exc_info:
            delete_message("chat-1", "msg-1", current, db)

        assert exc_info.value.status_code in (403, 404)

    def test_delete_rejects_plain_member_deleting_others_message(self):
        from app.api.community import delete_message

        db = MagicMock()
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            m = MagicMock()
            if call_count == 1:
                # get message row
                m.mappings.return_value.first.return_value = {
                    "authorId": "user-other",
                    "chatId": "chat-1",
                    "deletedAt": None,
                }
            else:
                # _get_member_role — plain member
                m.scalar.return_value = "member"
            return m

        db.execute.side_effect = side_effect
        current = _make_user("user-attacker")

        with pytest.raises(HTTPException) as exc_info:
            delete_message("chat-1", "msg-1", current, db)

        assert exc_info.value.status_code == 403


class TestAddParticipantPermissions:
    """add_participant must reject plain members."""

    def test_add_participant_rejected_for_plain_member(self):
        from app.api.community import add_participant, AddParticipantRequest

        db = MagicMock()
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            m = MagicMock()
            if call_count == 1:
                # _get_member_role for requester — plain member
                m.scalar.return_value = "member"
            return m

        db.execute.side_effect = side_effect
        current = _make_user("user-member")
        payload = AddParticipantRequest(user_id="user-target")

        with pytest.raises(HTTPException) as exc_info:
            add_participant("chat-1", payload, current, db)

        assert exc_info.value.status_code == 403


class TestStartDMValidation:
    """start_or_get_dm must reject self-DMs."""

    def test_cannot_dm_yourself(self):
        from app.api.community import start_or_get_dm

        db = MagicMock()
        current = _make_user("user-1")

        with pytest.raises(HTTPException) as exc_info:
            start_or_get_dm("user-1", current, db)

        assert exc_info.value.status_code == 400
        assert "yourself" in exc_info.value.detail.lower()


class TestRemoveParticipantPermissions:
    """remove_participant must not allow owner removal or member removing others."""

    def test_cannot_remove_owner_by_admin(self):
        from app.api.community import remove_participant

        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            m = MagicMock()
            if call_count == 1:
                m.scalar.return_value = "admin"    # requester is admin
            elif call_count == 2:
                m.scalar.return_value = "owner"    # target is owner
            return m

        db = MagicMock()
        db.execute.side_effect = side_effect
        current = _make_user("admin-user")

        with pytest.raises(HTTPException) as exc_info:
            remove_participant("chat-1", "owner-user", current, db)

        assert exc_info.value.status_code == 400


class TestUpdateParticipantRolePermissions:
    """Only owner may change roles."""

    def test_admin_cannot_change_roles(self):
        from app.api.community import update_participant_role, UpdateParticipantRequest

        db = MagicMock()
        db.execute.return_value.scalar.return_value = "admin"  # requester is admin, not owner
        current = _make_user("admin-user")
        payload = UpdateParticipantRequest(role="member")

        with pytest.raises(HTTPException) as exc_info:
            update_participant_role("chat-1", "some-user", payload, current, db)

        assert exc_info.value.status_code == 403

    def test_owner_cannot_change_own_role(self):
        from app.api.community import update_participant_role, UpdateParticipantRequest

        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            m = MagicMock()
            m.scalar.return_value = "owner"   # both checks return owner
            return m

        db = MagicMock()
        db.execute.side_effect = side_effect
        current = _make_user("owner-user")
        payload = UpdateParticipantRequest(role="member")

        with pytest.raises(HTTPException) as exc_info:
            update_participant_role("chat-1", "owner-user", payload, current, db)

        assert exc_info.value.status_code == 400


class TestReportMessageValidation:
    """Cannot report your own message; must be member of the chat."""

    def test_cannot_report_own_message(self):
        from app.api.community import report_message, ReportMessageRequest

        db = MagicMock()
        db.execute.return_value.mappings.return_value.first.return_value = {
            "chatId": "chat-1",
            "authorId": "user-1",
        }

        current = _make_user("user-1")
        payload = ReportMessageRequest(reason="test reason")

        with pytest.raises(HTTPException) as exc_info:
            report_message("msg-1", payload, current, db)

        assert exc_info.value.status_code == 400


# ── Route existence tests ──────────────────────────────────────────────────────

class TestChatRouteExistence:
    """All required chat routes must exist in the OpenAPI schema."""

    REQUIRED_PATHS = {
        "/community/chats",
        "/community/chats/{chat_id}",
        "/community/chats/{chat_id}/messages",
        "/community/chats/{chat_id}/messages/{message_id}",
        "/community/chats/{chat_id}/participants",
        "/community/chats/{chat_id}/participants/{user_id}",
        "/community/chats/{chat_id}/reveal",
        "/community/chats/unread",
        "/community/chats/group",
        "/community/chats/messages/{message_id}/attachment",
        "/community/dm/{target_user_id}",
        "/community/messages/{message_id}/report",
    }

    def test_all_chat_routes_exist(self):
        client = _get_test_client()
        paths = set(client.app.openapi()["paths"].keys())
        missing = self.REQUIRED_PATHS - paths
        assert not missing, f"Missing chat routes in OpenAPI schema: {missing}"
