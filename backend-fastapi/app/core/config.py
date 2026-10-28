from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_JWT_ACCESS = "dev-access-secret"
_DEV_JWT_REFRESH = "dev-refresh-secret"
_DEV_ADMIN_PW = "Admin12345!"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Expovision API (FastAPI)"
    environment: str = "development"
    port: int = 4000

    database_url: str = "postgresql://intensive:intensive@localhost:5432/intensive"
    jwt_access_secret: str = _DEV_JWT_ACCESS
    jwt_refresh_secret: str = _DEV_JWT_REFRESH
    jwt_access_exp_minutes: int = 30
    jwt_refresh_exp_days: int = 30
    redis_url: str = "redis://localhost:6379"
    # Sentinel: comma-separated sentinel URLs, e.g. "redis://s1:26379,redis://s2:26379"
    redis_sentinel_urls: str = ""
    # Sentinel service name (master name), e.g. "mymaster"
    redis_sentinel_service: str = ""
    # Set to true when using Redis Cluster instead of a single node
    redis_cluster: bool = False
    frontend_origins: str = "http://localhost:3000"

    admin_email: str = "admin@example.com"
    admin_password: str = _DEV_ADMIN_PW

    @model_validator(mode="after")
    def _reject_dev_secrets_in_production(self) -> "Settings":
        if self.environment == "production":
            errors: list[str] = []
            if self.jwt_access_secret == _DEV_JWT_ACCESS:
                errors.append("JWT_ACCESS_SECRET is still the development default")
            if self.jwt_refresh_secret == _DEV_JWT_REFRESH:
                errors.append("JWT_REFRESH_SECRET is still the development default")
            if self.admin_password == _DEV_ADMIN_PW:
                errors.append("ADMIN_PASSWORD is still the development default")
            origins_lower = self.frontend_origins.lower()
            if "localhost" in origins_lower or "127.0.0.1" in origins_lower:
                errors.append(
                    "FRONTEND_ORIGINS contains a localhost entry in production — "
                    "set it to the real domain (e.g. https://app.example.com)"
                )
            if errors:
                raise ValueError(
                    "Refusing to start in production with insecure defaults: "
                    + "; ".join(errors)
                )
        return self

    # Optional AI assistance (homework coach, curator feedback drafts, summaries).
    # Leave GOOGLE_API_KEY empty to run without it: AI endpoints answer 503 or fall back.
    google_api_key: str = ""
    google_gemini_model: str = "gemini-2.5-flash"
    password_reset_return_token_in_response: bool = False

    # Optional Kinescope video hosting (lesson videos, live webinars). Empty token = disabled.
    kinescope_api_token: str = ""
    #: VOD catalog project (videos, recordings).
    kinescope_project_id: str = ""
    #: Optional folder inside VOD project where live recordings are stored (next to lessons). Empty = search whole project.
    kinescope_webinar_recordings_folder_id: str = ""
    #: Live catalog project id from GET /v1/projects?catalog_type=live (if you have several live roots).
    kinescope_live_project_id: str = ""
    #: Optional: folder id under the *live* project for v2 live event parent_id.
    kinescope_live_parent_id: str = ""
    #: If set, ``POST /webinar/hooks/kinescope`` requires header ``X-Expovision-Kinescope-Webhook-Secret``.
    kinescope_webhook_secret: str = ""


settings = Settings()
