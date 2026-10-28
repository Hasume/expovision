"""Tests for the sliding-window rate limiter.

All tests run against the in-memory fallback (redis_client is patched to None)
so there is no Redis dependency in CI.
"""

from unittest.mock import patch

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

import app.core.rate_limit as rl_module
from app.core.rate_limit import RateLimitError, limit


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_app(get_limit: tuple[int, int], post_limit: tuple[int, int]) -> FastAPI:
    """Build a minimal FastAPI app with separate GET/POST limits on /resource."""
    app = FastAPI()

    @app.get("/resource", dependencies=[Depends(limit(*get_limit))])
    def _get():
        return {"method": "GET"}

    @app.post("/resource", dependencies=[Depends(limit(*post_limit))])
    def _post():
        return {"method": "POST"}

    return app


def _make_single_app(method: str, max_req: int, window: int) -> FastAPI:
    """Build a minimal app with a single rate-limited endpoint."""
    app = FastAPI()

    if method == "GET":
        @app.get("/item", dependencies=[Depends(limit(max_req, window))])
        def _get():
            return {}
    else:
        @app.post("/item", dependencies=[Depends(limit(max_req, window))])
        def _post():
            return {}

    return app


# ---------------------------------------------------------------------------
# Core isolation tests
# ---------------------------------------------------------------------------


class TestGetPostIsolation:
    """GET and POST on the same path must not share their quota."""

    def test_get_traffic_does_not_consume_post_quota(self) -> None:
        """Exhaust the GET quota; POST should still succeed."""
        with patch.object(rl_module, "redis_client", None):
            app = _make_app(get_limit=(3, 60), post_limit=(1, 60))
            client = TestClient(app, raise_server_exceptions=False)

            # Exhaust GET quota (3 requests)
            for _ in range(3):
                r = client.get("/resource")
                assert r.status_code == 200

            # GET is now rate-limited
            r = client.get("/resource")
            assert r.status_code == 429

            # POST must still work — it has its own independent bucket
            r = client.post("/resource")
            assert r.status_code == 200

    def test_post_traffic_does_not_consume_get_quota(self) -> None:
        """Exhaust the POST quota; GET should still succeed."""
        with patch.object(rl_module, "redis_client", None):
            app = _make_app(get_limit=(5, 60), post_limit=(1, 60))
            client = TestClient(app, raise_server_exceptions=False)

            # Exhaust POST quota
            r = client.post("/resource")
            assert r.status_code == 200
            r = client.post("/resource")
            assert r.status_code == 429

            # GET must still succeed
            r = client.get("/resource")
            assert r.status_code == 200

    def test_post_gets_429_only_after_its_own_limit(self) -> None:
        """POST is limited at exactly post_limit requests, not before."""
        with patch.object(rl_module, "redis_client", None):
            app = _make_app(get_limit=(60, 60), post_limit=(2, 60))
            client = TestClient(app, raise_server_exceptions=False)

            for _ in range(2):
                assert client.post("/resource").status_code == 200

            # Third POST must be 429
            assert client.post("/resource").status_code == 429


# ---------------------------------------------------------------------------
# 429 response shape
# ---------------------------------------------------------------------------


class TestRateLimitResponse:
    def test_429_has_retry_after_header(self) -> None:
        with patch.object(rl_module, "redis_client", None):
            app = _make_single_app("POST", max_req=1, window=60)
            client = TestClient(app, raise_server_exceptions=False)

            client.post("/item")  # consume the quota
            r = client.post("/item")

            assert r.status_code == 429
            assert "Retry-After" in r.headers
            retry_after = int(r.headers["Retry-After"])
            assert 1 <= retry_after <= 60

    def test_429_body_contains_detail(self) -> None:
        with patch.object(rl_module, "redis_client", None):
            app = _make_single_app("POST", max_req=1, window=60)
            client = TestClient(app, raise_server_exceptions=False)

            client.post("/item")
            r = client.post("/item")

            assert r.status_code == 429
            body = r.json()
            assert "detail" in body
            assert "retry" in body["detail"].lower() or "rate" in body["detail"].lower()

    def test_retry_after_is_positive_integer(self) -> None:
        with patch.object(rl_module, "redis_client", None):
            app = _make_single_app("GET", max_req=1, window=30)
            client = TestClient(app, raise_server_exceptions=False)

            client.get("/item")
            r = client.get("/item")

            assert r.status_code == 429
            assert int(r.headers["Retry-After"]) >= 1


# ---------------------------------------------------------------------------
# In-memory fallback behaviour
# ---------------------------------------------------------------------------


class TestInMemoryFallback:
    def test_in_memory_enforces_limit(self) -> None:
        with patch.object(rl_module, "redis_client", None):
            app = _make_single_app("GET", max_req=3, window=60)
            client = TestClient(app, raise_server_exceptions=False)

            for _ in range(3):
                assert client.get("/item").status_code == 200
            assert client.get("/item").status_code == 429

    def test_separate_limit_calls_have_isolated_buckets(self) -> None:
        """Two limit() calls with identical params on different methods → separate buckets."""
        with patch.object(rl_module, "redis_client", None):
            # Both methods share the same (max=1, window=60) limit
            # but must not share the bucket.
            app = _make_app(get_limit=(1, 60), post_limit=(1, 60))
            client = TestClient(app, raise_server_exceptions=False)

            assert client.get("/resource").status_code == 200
            assert client.get("/resource").status_code == 429   # GET exhausted

            # POST should still have its own fresh quota
            assert client.post("/resource").status_code == 200
            assert client.post("/resource").status_code == 429  # POST now exhausted


# ---------------------------------------------------------------------------
# User-ID based identity
# ---------------------------------------------------------------------------


class TestUserIdIdentity:
    """Authenticated users should have isolated quotas even behind the same IP."""

    def _make_app_with_auth(self) -> FastAPI:
        app = FastAPI()

        @app.get("/protected", dependencies=[Depends(limit(2, 60))])
        def _get():
            return {}

        return app

    def _jwt_header(self, user_id: str) -> dict[str, str]:
        """Craft a minimal (unsigned) JWT with the given sub claim."""
        import base64, json as _json
        header = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').rstrip(b"=").decode()
        payload = base64.urlsafe_b64encode(
            _json.dumps({"sub": user_id}).encode()
        ).rstrip(b"=").decode()
        return {"Authorization": f"Bearer {header}.{payload}.fakesig"}

    def test_different_users_have_independent_quotas(self) -> None:
        with patch.object(rl_module, "redis_client", None):
            app = self._make_app_with_auth()
            client = TestClient(app, raise_server_exceptions=False)

            # User A exhausts their quota
            assert client.get("/protected", headers=self._jwt_header("user-a")).status_code == 200
            assert client.get("/protected", headers=self._jwt_header("user-a")).status_code == 200
            assert client.get("/protected", headers=self._jwt_header("user-a")).status_code == 429

            # User B must still have their full quota
            assert client.get("/protected", headers=self._jwt_header("user-b")).status_code == 200
            assert client.get("/protected", headers=self._jwt_header("user-b")).status_code == 200
            assert client.get("/protected", headers=self._jwt_header("user-b")).status_code == 429

    def test_anonymous_requests_use_ip_quota(self) -> None:
        with patch.object(rl_module, "redis_client", None):
            app = self._make_app_with_auth()
            client = TestClient(app, raise_server_exceptions=False)

            assert client.get("/protected").status_code == 200
            assert client.get("/protected").status_code == 200
            assert client.get("/protected").status_code == 429


# ---------------------------------------------------------------------------
# RateLimitError carries structured metadata
# ---------------------------------------------------------------------------


class TestRateLimitErrorMetadata:
    def test_rate_limit_error_exposes_retry_after(self) -> None:
        exc = RateLimitError(retry_after=42, max_requests=10, window_seconds=60)
        assert exc.retry_after == 42
        assert exc.max_requests == 10
        assert exc.window_seconds == 60
        assert exc.status_code == 429
        assert exc.headers is not None
        assert exc.headers["Retry-After"] == "42"

    def test_rate_limit_error_detail_is_human_readable(self) -> None:
        exc = RateLimitError(retry_after=5, max_requests=1, window_seconds=60)
        assert isinstance(exc.detail, str)
        assert "5" in exc.detail
