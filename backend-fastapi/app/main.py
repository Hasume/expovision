import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from app.api import admin, auth, chat, community, curriculum, dashboard, final, health, homework, onboarding, report, track, webinar
from app.core.config import settings
from app.core.rate_limit import RateLimitError
from app.db.session import SessionLocal
from app.services.bootstrap_admin import ensure_admin_user

# Private upload prefixes that must NOT be served by StaticFiles.
# community-inline/ is public; community-chat/ is membership-gated via API.
_PRIVATE_UPLOAD_PREFIXES = ("/uploads/community-chat/",)

app = FastAPI(title=settings.app_name)


@app.exception_handler(RateLimitError)
async def rate_limit_handler(request: Request, exc: RateLimitError) -> JSONResponse:
    """Return a structured JSON body for 429 responses so API consumers can parse
    the limit metadata without having to parse the human-readable detail string."""
    return JSONResponse(
        status_code=429,
        content={
            "detail": exc.detail,
            "retry_after": exc.retry_after,
            "limit": exc.max_requests,
            "window_seconds": exc.window_seconds,
        },
        headers={"Retry-After": str(exc.retry_after)},
    )


@app.middleware("http")
async def block_private_uploads(request: Request, call_next: object):
    """Block direct static access to private chat uploads (they are served via the API only)."""
    if any(request.url.path.startswith(p) for p in _PRIVATE_UPLOAD_PREFIXES):
        return Response(status_code=403, content="Forbidden")
    return await call_next(request)  # type: ignore[operator]


# Uploaded files live in /app/uploads inside the backend container. UPLOADS_ROOT only
# overrides the static mount so the app can be imported outside Docker (e.g. by pytest).
uploads_dir = Path(os.getenv("UPLOADS_ROOT", "/app/uploads"))
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

allowed_origins = [origin.strip() for origin in settings.frontend_origins.split(",") if origin.strip()]
if not allowed_origins:
    allowed_origins = ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Locale",
        "X-Expovision-Kinescope-Webhook-Secret",
    ],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(onboarding.router)
app.include_router(report.router)
app.include_router(dashboard.router)
app.include_router(curriculum.router)
app.include_router(homework.router)
app.include_router(track.router)
app.include_router(final.router)
app.include_router(admin.router)
app.include_router(chat.router)
app.include_router(webinar.router)
app.include_router(community.router)


@app.on_event("startup")
def seed_admin_on_startup() -> None:
    db = SessionLocal()
    try:
        ensure_admin_user(db)
    finally:
        db.close()
