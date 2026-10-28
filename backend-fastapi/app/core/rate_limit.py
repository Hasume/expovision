import base64
import json
from collections import defaultdict, deque
from collections.abc import Callable
from math import ceil
from time import time

from fastapi import HTTPException, Request, status

from app.core.config import settings


# ---------------------------------------------------------------------------
# Redis client — supports plain Redis, Sentinel, and Cluster
# ---------------------------------------------------------------------------


def _redis_client():
    try:
        import redis as _redis
    except ImportError:
        return None

    # Sentinel mode: REDIS_SENTINEL_URLS="redis://s1:26379,redis://s2:26379"
    # and REDIS_SENTINEL_SERVICE="mymaster"
    if settings.redis_sentinel_service and settings.redis_sentinel_urls:
        try:
            sentinel_hosts = []
            for url in settings.redis_sentinel_urls.split(","):
                url = url.strip()
                if not url:
                    continue
                # Parse "redis://host:port" → (host, port)
                from urllib.parse import urlparse
                parsed = urlparse(url)
                sentinel_hosts.append((parsed.hostname or "localhost", parsed.port or 26379))
            sentinel = _redis.Sentinel(sentinel_hosts, socket_timeout=0.5, decode_responses=True)
            return sentinel.master_for(settings.redis_sentinel_service)
        except Exception:  # noqa: BLE001
            pass

    # Cluster mode: REDIS_CLUSTER=true
    if settings.redis_cluster:
        try:
            from redis.cluster import RedisCluster
            return RedisCluster.from_url(settings.redis_url, decode_responses=True)
        except Exception:  # noqa: BLE001
            pass

    # Standard single-node Redis
    try:
        return _redis.from_url(settings.redis_url, decode_responses=True)
    except Exception:  # noqa: BLE001
        return None


redis_client = _redis_client()


# ---------------------------------------------------------------------------
# Custom exception — carries structured 429 metadata for the exception handler
# ---------------------------------------------------------------------------


class RateLimitError(HTTPException):
    """429 exception that carries machine-readable rate limit metadata."""

    def __init__(self, retry_after: int, max_requests: int, window_seconds: int) -> None:
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Retry after {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )
        self.retry_after = retry_after
        self.max_requests = max_requests
        self.window_seconds = window_seconds


# ---------------------------------------------------------------------------
# Identity helpers
# ---------------------------------------------------------------------------


def _client_ip(request: Request) -> str:
    """Return the real client IP, preferring the X-Real-IP header set by nginx."""
    real_ip = request.headers.get("X-Real-IP", "").strip()
    if real_ip:
        return real_ip
    return request.client.host if request.client else "unknown"


def _extract_user_id(auth_header: str | None) -> str | None:
    """Decode the JWT payload and return the `sub` claim without full verification.

    Used only for rate-limit identity — NOT for authorisation.  An attacker who
    crafts a fake JWT is still rate-limited under that fake sub, so this is safe.
    """
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    parts = auth_header[7:].split(".")
    if len(parts) != 3:
        return None
    try:
        padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
        sub = payload.get("sub")
        return str(sub) if sub else None
    except Exception:  # noqa: BLE001
        return None


def _identity(request: Request) -> str:
    """Return 'u:{user_id}' for authenticated requests, 'ip:{ip}' for anonymous.

    Using user_id means users behind the same NAT/proxy don't share a quota,
    and a single bad actor can't exhaust the limit for an entire office.
    """
    user_id = _extract_user_id(request.headers.get("Authorization"))
    if user_id:
        return f"u:{user_id}"
    return f"ip:{_client_ip(request)}"


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------


def limit(max_requests: int, window_seconds: int) -> Callable[[Request], None]:
    """Sliding-window rate limiter.

    Redis key:     rl:{max}:{window}:{METHOD}:{identity}:{path}
    In-memory key: {METHOD}:{identity}:{path}   (per-closure dict)

    Key design:
    - Method included → GET(60/min) and POST(10/min) on the same path never share a bucket.
    - identity = user_id when authenticated, IP otherwise → fair per-user limits.
    - _slot included in Redis key → different limit() decorators on same path/method
      don't collide even when (max, window) happen to match.
    """
    buckets: dict[str, deque[float]] = defaultdict(deque)
    _slot = f"{max_requests}:{window_seconds}"

    def dependency(request: Request) -> None:
        ident = _identity(request)
        method = request.method.upper()
        path = request.url.path
        window_start = time() - window_seconds
        now = time()

        if redis_client is not None:
            try:
                redis_key = f"rl:{_slot}:{method}:{ident}:{path}"
                with redis_client.pipeline() as pipe:
                    pipe.zremrangebyscore(redis_key, 0, window_start)
                    pipe.zcard(redis_key)
                    _, count = pipe.execute()

                    if int(count) >= max_requests:
                        oldest = redis_client.zrange(redis_key, 0, 0, withscores=True)
                        retry_after = ceil(float(oldest[0][1]) + window_seconds - now) if oldest else window_seconds
                        raise RateLimitError(max(1, retry_after), max_requests, window_seconds)

                    pipe.zadd(redis_key, {f"{now}": now})
                    pipe.expire(redis_key, window_seconds + 5)
                    pipe.execute()
                return
            except RateLimitError:
                raise
            except Exception:
                # Redis unavailable → fall through to in-memory limiter.
                pass

        mem_key = f"{method}:{ident}:{path}"
        bucket = buckets[mem_key]
        while bucket and bucket[0] <= window_start:
            bucket.popleft()
        if len(bucket) >= max_requests:
            retry_after = ceil(bucket[0] + window_seconds - now) if bucket else window_seconds
            raise RateLimitError(max(1, retry_after), max_requests, window_seconds)
        bucket.append(now)

    return dependency
