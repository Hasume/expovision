"""Kinescope video hosting API client.

Dashboard setup (one-time, manual):
1. Create a project in Kinescope dashboard
2. Enable DRM (Widevine + FairPlay) in project settings
3. Add your production domain to the domain allowlist
4. Enable dynamic watermarking in project settings
5. Copy API token from Settings > API and set KINESCOPE_API_TOKEN
6. Copy project ID and set KINESCOPE_PROJECT_ID
7. Live events use the **live** catalog (GET /v1/projects?catalog_type=live), not VOD; set KINESCOPE_LIVE_PROJECT_ID / KINESCOPE_LIVE_PARENT_ID if needed
8. When a live ends, the **recording file** is created under **KINESCOPE_PROJECT_ID** (VOD), often in a shared folder — not inside the live event JSON. Use ``find_live_recording_in_vod_catalog`` or webhooks to get that ``video_id``.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx

from app.core.config import settings

API_BASE = "https://api.kinescope.io/v1"
API_V2_BASE = "https://api.kinescope.io/v2"
EMBED_BASE = "https://kinescope.io/embed"
CHAT_BASE = "https://kinescope.io/chat"
RTMP_URL = "rtmp://rtmp.kinescope.io/live"


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.kinescope_api_token}",
        "Content-Type": "application/json",
    }


def _check(resp: httpx.Response) -> dict:
    if resp.status_code >= 400:
        detail = resp.text[:1200]
        logging.getLogger(__name__).warning("Kinescope HTTP %s: %s", resp.status_code, detail)
        raise RuntimeError(f"Kinescope API {resp.status_code}: {detail}")
    return resp.json()


def init_upload(title: str) -> dict:
    """Create a video container. Returns {video_id, upload_url}."""
    body: dict = {"title": title, "type": "vod"}
    if settings.kinescope_project_id:
        body["parent_id"] = settings.kinescope_project_id
    with httpx.Client(timeout=30) as client:
        resp = client.post(f"{API_BASE}/videos", headers=_headers(), json=body)
    data = _check(resp)
    video = data.get("data", data)
    return {
        "videoId": video["id"],
        "uploadUrl": video.get("upload_url", video.get("play_link", "")),
    }


def _video_list_item(v: dict) -> dict:
    poster = v.get("poster")
    if poster is None and isinstance(v.get("assets"), list) and v["assets"]:
        poster = (v["assets"][0] or {}).get("poster") if isinstance(v["assets"][0], dict) else None
    return {
        "id": v.get("id"),
        "title": v.get("title", ""),
        "status": v.get("status", "unknown"),
        "duration": v.get("duration", 0),
        "play_link": v.get("play_link", ""),
        "embed_link": v.get("embed_link", ""),
        "created_at": v.get("created_at", ""),
        "poster": poster if isinstance(poster, str) else None,
        "folder_id": v.get("folder_id"),
    }


def list_folders(page: int = 1, per_page: int = 100) -> dict:
    """List folders in the configured project. GET /v1/projects/{id}/folders"""
    if not settings.kinescope_project_id:
        return {"total": 0, "folders": []}
    params: dict = {"page": str(page), "per_page": str(per_page), "order": "created_at.desc"}
    with httpx.Client(timeout=15) as client:
        resp = client.get(
            f"{API_BASE}/projects/{settings.kinescope_project_id}/folders",
            headers=_headers(),
            params=params,
        )
    data = _check(resp)
    rows = data.get("data", [])
    total = data.get("meta", {}).get("pagination", {}).get("total", len(rows))
    return {
        "total": total,
        "folders": [
            {
                "id": f.get("id"),
                "name": f.get("name", ""),
                "project_id": f.get("project_id"),
                "created_at": f.get("created_at", ""),
            }
            for f in rows
        ],
    }


def list_videos(
    page: int = 1,
    per_page: int = 100,
    *,
    folder_id: str | None = None,
    without_folder: bool = False,
    q: str | None = None,
) -> dict:
    """List videos. Use folder_id for videos inside a folder, or without_folder=true for root-level."""
    params: dict = {"page": str(page), "per_page": str(per_page), "order": "created_at.desc"}
    if settings.kinescope_project_id:
        params["project_id"] = settings.kinescope_project_id
    if folder_id:
        params["folder_id"] = folder_id
    elif without_folder:
        params["without_folder"] = "true"
    if q and q.strip():
        params["q"] = q.strip()
    with httpx.Client(timeout=15) as client:
        resp = client.get(f"{API_BASE}/videos", headers=_headers(), params=params)
    data = _check(resp)
    videos = data.get("data", [])
    total = data.get("meta", {}).get("pagination", {}).get("total", len(videos))
    return {
        "total": total,
        "videos": [_video_list_item(v) for v in videos],
    }


def get_video_document(video_id: str) -> dict:
    """Full inner object from GET /v1/videos/{id}."""
    vid = (video_id or "").strip()
    if not vid:
        return {}
    with httpx.Client(timeout=15) as client:
        resp = client.get(f"{API_BASE}/videos/{quote(vid, safe='')}", headers=_headers())
    data = _check(resp)
    inner = data.get("data", data)
    return inner if isinstance(inner, dict) else {}


def get_video(video_id: str) -> dict:
    """Fetch video metadata and transcoding status."""
    video = get_video_document(video_id)
    if not video:
        return {
            "id": None,
            "title": None,
            "status": "unknown",
            "duration": 0,
            "thumbnail_url": None,
            "play_link": "",
            "embed_link": "",
        }
    el = video.get("embed_link") or video.get("embedLink") or ""
    return {
        "id": video.get("id"),
        "title": video.get("title"),
        "status": video.get("status", "unknown"),
        "duration": video.get("duration", 0),
        "thumbnail_url": video.get("poster", {}).get("src") if isinstance(video.get("poster"), dict) else video.get("poster"),
        "play_link": video.get("play_link", ""),
        "embed_link": el if isinstance(el, str) else "",
    }


def video_duration_minutes(video_id: str) -> int | None:
    """Whole minutes from Kinescope VOD ``duration`` field (total seconds)."""
    vid = (video_id or "").strip()
    if not vid or not settings.kinescope_api_token:
        return None
    try:
        doc = get_video_document(vid)
    except RuntimeError:
        return None
    if not doc:
        return None
    raw = doc.get("duration")
    if raw is None:
        return None
    try:
        sec = float(raw)
    except (TypeError, ValueError):
        return None
    if sec <= 0:
        return None
    return max(1, int(round(sec / 60.0)))


def _object_has_exact_string_value(obj: object, needle: str, *, depth: int = 0) -> bool:
    """True if any string value in nested dict/list equals ``needle`` (after strip)."""
    if depth > 16 or not needle:
        return False
    if isinstance(obj, dict):
        for v in obj.values():
            if isinstance(v, str) and v.strip() == needle:
                return True
            if _object_has_exact_string_value(v, needle, depth=depth + 1):
                return True
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, str) and item.strip() == needle:
                return True
            if _object_has_exact_string_value(item, needle, depth=depth + 1):
                return True
    return False


def _parse_video_created_at(value: object) -> datetime | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def find_live_recording_in_vod_catalog(
    live_event_id: str,
    title_hints: list[str],
    *,
    created_after_iso: str | None = None,
) -> str:
    """Locate recording video id in the **VOD** project (``KINESCOPE_PROJECT_ID``).

    Finished live recordings are stored like lesson uploads, not in the live catalog API tree.
    We scan recent videos (optionally limited to ``KINESCOPE_WEBINAR_RECORDINGS_FOLDER_ID``) and pick
    the asset whose JSON metadata references ``live_event_id``, or (fallback) title + created time.
    """
    log = logging.getLogger(__name__)
    eid = (live_event_id or "").strip()
    if not eid or not settings.kinescope_api_token or not settings.kinescope_project_id:
        return ""

    folder = (settings.kinescope_webinar_recordings_folder_id or "").strip()
    list_kwargs: dict = {}
    if folder:
        list_kwargs["folder_id"] = folder

    cutoff = _parse_video_created_at(created_after_iso)
    hints_norm = [h.strip().lower() for h in title_hints if h and len(h.strip()) >= 4]

    title_matches: list[str] = []

    for page in range(1, 4):
        try:
            batch = list_videos(page=page, per_page=40, **list_kwargs)
        except RuntimeError as exc:
            log.debug("find_live_recording list page %s: %s", page, exc)
            break
        videos = batch.get("videos") or []
        if not videos:
            break
        for item in videos:
            vid = str(item.get("id") or "").strip()
            if not vid:
                continue
            try:
                doc = get_video_document(vid)
            except RuntimeError:
                continue
            if _object_has_exact_string_value(doc, eid):
                return vid
            if not hints_norm or cutoff is None:
                continue
            title_v = (doc.get("title") or item.get("title") or "").strip().lower()
            if not title_v:
                continue
            created_raw = doc.get("created_at") or item.get("created_at")
            vdt = _parse_video_created_at(created_raw)
            if vdt is None or vdt < cutoff - timedelta(hours=3):
                continue
            for h in hints_norm:
                if h in title_v or title_v in h:
                    title_matches.append(vid)
                    break
        total = int(batch.get("total") or 0)
        if total and page * 40 >= total:
            break

    if len(title_matches) == 1:
        return title_matches[0]
    if len(title_matches) > 1:
        log.warning(
            "find_live_recording_in_vod_catalog: multiple title matches for live %s; use webhook or folder filter",
            eid[:12],
        )
    return ""


def delete_video(video_id: str) -> None:
    """Delete a video from Kinescope."""
    with httpx.Client(timeout=15) as client:
        resp = client.delete(f"{API_BASE}/videos/{video_id}", headers=_headers())
    if resp.status_code >= 400 and resp.status_code != 404:
        raise RuntimeError(f"Kinescope delete failed: {resp.status_code}")


def build_embed_url(video_id: str, watermark_text: str | None = None) -> str:
    """Construct Kinescope embed URL.

    Per Kinescope docs (https://kinescope.io/embed/{video_id}), the simplest form
    with correct allow= attributes is the most reliable for both VOD and live streams.
    ``watermark`` query param only works when explicitly enabled in the Kinescope project
    settings — do NOT send it unless the feature is on, as it can interfere with playback.
    """
    return f"{EMBED_BASE}/{quote(video_id, safe='')}"


def build_chat_url(video_id: str) -> str:
    """Live / VOD comments chat iframe: https://kinescope.io/chat/{video_id}"""
    return f"{CHAT_BASE}/{quote(video_id, safe='')}"


# ── Live Events API (v2) ──────────────────────────────────────────────────────


def scheduled_time_for_kinescope(value: datetime | str | None) -> str | None:
    """Kinescope live API expects RFC3339 with zone, e.g. 2006-01-02T15:04:05Z07:00."""
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt.replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
    s = str(value).strip()
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def _extract_embed_id(link: str) -> str:
    """Extract the alphanumeric embed ID from a Kinescope share/embed URL."""
    if not link:
        return ""
    # URLs like https://kinescope.io/AbCdEf or https://kinescope.io/embed/AbCdEf
    parts = [p for p in link.rstrip("/").split("/") if p and "kinescope" not in p and "." not in p]
    return parts[-1] if parts else ""


def _deep_find_recording_id(obj: object, *, skip_ids: frozenset[str], depth: int = 0) -> str:
    """Walk JSON tree for common Kinescope keys (incl. live.finished webhook shape ``video_id``)."""
    if depth > 18:
        return ""
    key_names = frozenset(
        {
            "video_id",
            "videoid",
            "vod_id",
            "vodid",
            "recording_video_id",
            "recordingvideoid",
            "recorded_video_id",
            "finished_video_id",
            "archive_video_id",
        }
    )
    if isinstance(obj, dict):
        for k, v in obj.items():
            kn = str(k).lower().replace("-", "_")
            if kn in key_names and v is not None:
                s = str(v).strip()
                if s and s not in skip_ids and len(s) >= 6:
                    return s
            found = _deep_find_recording_id(v, skip_ids=skip_ids, depth=depth + 1)
            if found:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _deep_find_recording_id(item, skip_ids=skip_ids, depth=depth + 1)
            if found:
                return found
    return ""


def _extract_recording_video_id(event: dict) -> str:
    """VOD id for replay after live ends (complete response, GET event, webhooks)."""
    if not isinstance(event, dict):
        return ""
    for key in (
        "video_id",
        "videoId",
        "vod_id",
        "vodId",
        "recording_video_id",
        "recordingVideoId",
        "recorded_video_id",
        "recordedVideoId",
        "finished_video_id",
        "finishedVideoId",
        "archive_video_id",
        "archiveVideoId",
        "output_id",
        "outputId",
        "media_id",
        "mediaId",
    ):
        v = event.get(key)
        if v is not None and str(v).strip():
            return str(v).strip()
    nested = event.get("data")
    if isinstance(nested, dict):
        found = _extract_recording_video_id(nested)
        if found:
            return found
    # Kinescope v2 often nests recording under record / playback / media / outputs
    for nest_key in (
        "record",
        "Record",
        "playback",
        "Playback",
        "media",
        "Media",
        "vod",
        "archive",
        "output",
        "outputs",
        "recording",
        "meta",
        "result",
        "Result",
        "asset",
        "Asset",
        "assets",
        "transcode",
    ):
        nested = event.get(nest_key)
        if isinstance(nested, dict):
            found = _extract_recording_video_id(nested)
            if found:
                return found
        elif isinstance(nested, list):
            for item in nested:
                if isinstance(item, dict):
                    found = _extract_recording_video_id(item)
                    if found:
                        return found
    links = event.get("links")
    if isinstance(links, list):
        for item in links:
            if isinstance(item, dict):
                found = _extract_recording_video_id(item)
                if found:
                    return found
    rec = event.get("record")
    if isinstance(rec, dict):
        for key in ("id", "video_id", "videoId", "media_id", "video", "media"):
            v = rec.get(key)
            if isinstance(v, dict):
                found = _extract_recording_video_id(v)
                if found:
                    return found
                vv = v.get("id") or v.get("video_id")
                if vv is not None and str(vv).strip():
                    return str(vv).strip()
            elif v is not None and str(v).strip():
                return str(v).strip()
    vid = event.get("video")
    if isinstance(vid, str) and vid.strip():
        return vid.strip()
    if isinstance(vid, dict):
        v = vid.get("id") or vid.get("video_id")
        if v is not None and str(v).strip():
            return str(v).strip()
    stream = event.get("stream")
    if isinstance(stream, list) and stream and isinstance(stream[0], dict):
        for key in ("video_id", "videoId", "recorded_video_id", "recording_id"):
            v = stream[0].get(key)
            if v is not None and str(v).strip():
                return str(v).strip()
        if "record" in stream[0] or "recording" in stream[0]:
            found = _extract_recording_video_id(stream[0])
            if found:
                return found
    elif isinstance(stream, dict):
        for key in ("video_id", "videoId", "recording_id"):
            v = stream.get(key)
            if v is not None and str(v).strip():
                return str(v).strip()
        found = _extract_recording_video_id(stream)
        if found:
            return found
    return ""


def playback_video_id_from_live_payload(parsed: dict) -> str:
    """Id to store on Webinar.kinescopeVideoId: recording (VOD) first, else embed id."""
    if not isinstance(parsed, dict):
        return ""
    rid = _extract_recording_video_id(parsed)
    if rid:
        return rid
    rid = (parsed.get("recording_video_id") or "").strip()
    if rid:
        return rid
    return (parsed.get("embed_id") or "").strip()


def _split_rtmp_publish_url(url: str) -> tuple[str, str]:
    """If ``url`` is a full publish URL ``rtmp://host/app/streamKey``, return (base, key)."""
    u = (url or "").strip()
    ul = u.lower()
    if "://" not in u or not (ul.startswith("rtmp://") or ul.startswith("rtmps://")):
        return ("", "")
    _, _, rest = u.partition("://")
    host, _, path = rest.partition("/")
    if not host or not path:
        return (u, "")
    segments = [s for s in path.split("/") if s]
    if len(segments) < 2:
        return (u, "")
    app = segments[0]
    stream_key = "/".join(segments[1:])
    scheme = "rtmps" if ul.startswith("rtmps://") else "rtmp"
    return (f"{scheme}://{host}/{app}", stream_key)


def _string_candidates_from_obj(obj: object, depth: int = 0) -> list[str]:
    """Collect non-empty strings from dict/list (bounded depth) for stream-key fallbacks."""
    if depth > 5:
        return []
    out: list[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            lk = str(k).lower().replace("-", "_")
            if isinstance(v, str) and v.strip():
                if lk in (
                    "stream_key",
                    "streamkey",
                    "publish_key",
                    "push_key",
                    "rtmp_key",
                    "ingest_key",
                    "password",
                    "secret",
                    "token",
                ):
                    out.append(v.strip())
            else:
                out.extend(_string_candidates_from_obj(v, depth + 1))
    elif isinstance(obj, list):
        for item in obj:
            out.extend(_string_candidates_from_obj(item, depth + 1))
    return out


def _extract_rtmp_and_stream_key(event: dict) -> tuple[str, str]:
    """Pick RTMP base URL and stream key from varying Kinescope v2 shapes."""
    stream: dict = {}
    raw_stream = event.get("stream")
    if isinstance(raw_stream, dict):
        stream = raw_stream
    elif isinstance(raw_stream, list) and raw_stream and isinstance(raw_stream[0], dict):
        stream = raw_stream[0]

    ingest = event.get("ingest") if isinstance(event.get("ingest"), dict) else {}
    push = event.get("push") if isinstance(event.get("push"), dict) else {}
    broadcast = event.get("broadcast") if isinstance(event.get("broadcast"), dict) else {}
    meta = event.get("meta") if isinstance(event.get("meta"), dict) else {}

    publish_candidates = [
        event.get("rtmp_link"),
        event.get("rtmpLink"),
        stream.get("publish_url"),
        stream.get("publishUrl"),
        stream.get("rtmp_publish_url"),
        stream.get("url"),
        stream.get("rtmp_url"),
        stream.get("rtmpUrl"),
        stream.get("endpoint"),
        ingest.get("url"),
        ingest.get("rtmp_url"),
        push.get("url"),
        broadcast.get("url"),
        event.get("publish_url"),
        event.get("rtmp_publish_url"),
        event.get("rtmp_url"),
        event.get("rtmpUrl"),
    ]

    rtmp_url = RTMP_URL
    stream_key = ""

    for pub in publish_candidates:
        if not isinstance(pub, str) or not pub.strip():
            continue
        pub = pub.strip()
        base, key_from_url = _split_rtmp_publish_url(pub)
        if base and key_from_url:
            rtmp_url, stream_key = base, key_from_url
            break
        pl = pub.lower()
        if (pl.startswith("rtmp://") or pl.startswith("rtmps://")) and not key_from_url:
            rtmp_url = pub

    if not stream_key:
        stream_key = (
            event.get("streamkey")
            or event.get("stream_key")
            or event.get("streamKey")
            or stream.get("streamkey")
            or stream.get("key")
            or stream.get("stream_key")
            or stream.get("streamKey")
            or ingest.get("key")
            or ingest.get("stream_key")
            or push.get("key")
            or broadcast.get("key")
            or event.get("publish_key")
            or event.get("key")
            or ""
        )
        if isinstance(stream_key, str):
            stream_key = stream_key.strip()
        else:
            stream_key = ""

    if not stream_key:
        for nested in (meta.get("stream"), meta.get("ingest")):
            if isinstance(nested, dict):
                stream_key = (
                    nested.get("key") or nested.get("stream_key") or nested.get("streamKey") or ""
                )
                if isinstance(stream_key, str):
                    stream_key = stream_key.strip()
                if stream_key:
                    break

    if not stream_key:
        for s in _string_candidates_from_obj(
            {
                "stream": stream,
                "ingest": ingest,
                "push": push,
                "broadcast": broadcast,
                "meta": meta,
            }
        ):
            if len(s) >= 6:
                stream_key = s
                break

    return rtmp_url, stream_key


def _try_live_event_stream_subresource(event_id: str) -> dict | None:
    """Try alternate endpoints where some accounts expose ingest credentials."""
    eid = quote(event_id.strip(), safe="")
    if not eid:
        return None
    log = logging.getLogger(__name__)
    for path in ("stream", "streams", "ingest"):
        url = f"{API_V2_BASE}/live/events/{eid}/{path}"
        try:
            with httpx.Client(timeout=10) as client:
                resp = client.get(url, headers=_headers())
        except Exception as exc:
            log.debug("Kinescope GET %s: %s", url, exc)
            continue
        if resp.status_code != 200:
            continue
        try:
            data = resp.json()
        except Exception:
            continue
        inner = data.get("data", data) if isinstance(data, dict) else None
        if isinstance(inner, dict):
            return inner
        if isinstance(inner, list) and inner and isinstance(inner[0], dict):
            return inner[0]
    return None


def _enrich_parsed_live_event(event_id: str, parsed: dict) -> dict:
    if str(parsed.get("stream_key") or "").strip():
        return parsed
    sub = _try_live_event_stream_subresource(event_id)
    if not sub:
        return parsed
    ru, sk = _extract_rtmp_and_stream_key(dict(sub))
    out = dict(parsed)
    if sk:
        out["stream_key"] = sk
    if ru:
        out["rtmp_url"] = ru
    return out


def _parse_live_event(event: dict) -> dict:
    """Normalise a Kinescope live event object into a stable shape.

    Kinescope API response structure can vary; we try multiple field paths
    and log the raw object when credentials are missing so bugs are traceable.
    """
    _log = logging.getLogger(__name__)

    embed_link = (
        event.get("embed_link") or event.get("embedLink")
        or event.get("share_link") or event.get("shareLink") or ""
    )
    embed_id = _extract_embed_id(embed_link)
    if not embed_id:
        pl = event.get("player_link") or event.get("playerLink") or ""
        embed_id = _extract_embed_id(str(pl))
    if not embed_id:
        pb = event.get("playback")
        if isinstance(pb, dict):
            embed_id = _extract_embed_id(
                str(pb.get("url") or pb.get("embed_link") or pb.get("embedLink") or "")
            )
        elif isinstance(pb, str):
            embed_id = _extract_embed_id(pb)

    rtmp_url, stream_key = _extract_rtmp_and_stream_key(event)

    if not stream_key:
        # Log the raw event so we can see exactly where the key lives
        _log.warning(
            "Kinescope live event — no stream_key found. Top-level keys: %s",
            list(event.keys()),
        )
        raw_stream = event.get("stream")
        if isinstance(raw_stream, dict):
            _log.warning("  stream keys: %s", list(raw_stream.keys()))
        elif isinstance(raw_stream, list) and raw_stream and isinstance(raw_stream[0], dict):
            _log.warning("  stream[0] keys: %s", list(raw_stream[0].keys()))

    poster = event.get("poster") or {}
    thumbnail_url = (poster.get("src") if isinstance(poster, dict) else poster) or ""

    sched_raw = event.get("scheduled")
    if isinstance(sched_raw, dict):
        scheduled_time = str(sched_raw.get("time") or "")
    elif isinstance(sched_raw, str):
        scheduled_time = sched_raw
    else:
        scheduled_time = ""

    raw_stream_pass: dict = {}
    if not stream_key:
        rs = event.get("stream")
        if isinstance(rs, dict):
            raw_stream_pass = rs
        elif isinstance(rs, list) and rs and isinstance(rs[0], dict):
            raw_stream_pass = rs[0]

    rec_vid = _extract_recording_video_id(event)

    return {
        "event_id": event.get("id", ""),
        "name": event.get("name", ""),
        "status": event.get("status", ""),
        "embed_link": embed_link,
        "embed_id": embed_id,
        "recording_video_id": rec_vid,
        "rtmp_url": rtmp_url,
        "stream_key": stream_key,
        "thumbnail_url": thumbnail_url,
        "scheduled_time": scheduled_time,
        "_raw_stream": raw_stream_pass,
    }


def live_folder_id_from_row(row: dict) -> str:
    """Pick folder id from a v1 /projects/.../folders item."""
    for k in ("id", "folder_id", "uuid"):
        v = row.get(k)
        if v:
            return str(v).strip()
    return ""


def _live_folders_from_response(data: dict) -> list[dict]:
    raw = data.get("data")
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, dict):
        for key in ("items", "folders", "list", "results", "data"):
            inner = raw.get(key)
            if isinstance(inner, list):
                return [x for x in inner if isinstance(x, dict)]
        if raw.get("id"):
            return [raw]
    return []


def list_projects(catalog_type: str | None = None) -> list[dict]:
    """GET /v1/projects — ``catalog_type`` is ``live`` or ``vod`` per Kinescope API."""
    params: dict[str, str] = {"page": "1", "per_page": "100"}
    if catalog_type:
        params["catalog_type"] = catalog_type
    with httpx.Client(timeout=25) as client:
        resp = client.get(f"{API_BASE}/projects", headers=_headers(), params=params)
    data = _check(resp)
    return _live_folders_from_response(data)


def list_project_folders(project_id: str) -> list[dict]:
    """GET /v1/projects/{project_id}/folders."""
    pid = project_id.strip()
    if not pid:
        raise RuntimeError("Kinescope: project_id required to list folders")
    with httpx.Client(timeout=25) as client:
        resp = client.get(
            f"{API_BASE}/projects/{quote(pid, safe='')}/folders",
            headers=_headers(),
            params={"per_page": "100", "page": "1"},
        )
    data = _check(resp)
    return _live_folders_from_response(data)


def resolve_live_catalog_project_id() -> str:
    """Live and VOD are separate catalogs; v2 /live/events needs ids from the **live** catalog."""
    log = logging.getLogger(__name__)
    if settings.kinescope_live_project_id.strip():
        return settings.kinescope_live_project_id.strip()
    projects = list_projects(catalog_type="live")
    if len(projects) == 0:
        raise RuntimeError(
            "Kinescope: no live catalog projects (GET /v1/projects?catalog_type=live). "
            "Create a Live project in Kinescope or set KINESCOPE_LIVE_PROJECT_ID."
        )
    if len(projects) == 1:
        return str(projects[0].get("id") or "").strip()
    sorted_p = sorted(
        projects,
        key=lambda p: (str(p.get("name") or "").lower(), str(p.get("id") or "")),
    )
    chosen = str(sorted_p[0].get("id") or "").strip()
    log.warning(
        "Kinescope live: %d live catalog projects; using first by name (%s). "
        "Set KINESCOPE_LIVE_PROJECT_ID to override.",
        len(projects),
        chosen,
    )
    return chosen


def list_live_folders() -> list[dict]:
    """Folders under the resolved **live** catalog project (not KINESCOPE_PROJECT_ID / vod)."""
    return list_project_folders(resolve_live_catalog_project_id())


def _resolve_live_folder_id(explicit_folder_id: str | None = None) -> str:
    """``parent_id`` for POST /v2/live/events — must belong to the **live** catalog, not VOD.

    Order: explicit → KINESCOPE_LIVE_PARENT_ID → folder under live project → else live project id.
    """
    log = logging.getLogger(__name__)
    if explicit_folder_id and explicit_folder_id.strip():
        return explicit_folder_id.strip()
    if settings.kinescope_live_parent_id.strip():
        return settings.kinescope_live_parent_id.strip()

    try:
        live_proj = resolve_live_catalog_project_id()
    except RuntimeError as exc:
        raise RuntimeError(
            "Kinescope live: cannot resolve live catalog project. "
            "Set KINESCOPE_LIVE_PROJECT_ID. "
            f"Details: {exc}"
        ) from exc

    try:
        folders = list_project_folders(live_proj)
    except RuntimeError as exc:
        raise RuntimeError(
            f"Kinescope live: cannot list folders for live project {live_proj[:12]}… "
            f"Set KINESCOPE_LIVE_PARENT_ID. Details: {exc}"
        ) from exc

    if len(folders) == 0:
        log.warning(
            "Kinescope live: live project %s has no folders; using project id as v2 parent_id",
            live_proj,
        )
        return live_proj

    if len(folders) == 1:
        fid = live_folder_id_from_row(folders[0])
        if fid:
            log.info("Kinescope live: using only folder under live project (%s)", fid)
            return fid

    sorted_folders = sorted(
        folders,
        key=lambda f: (
            (str(f.get("name") or f.get("title") or "")).lower(),
            live_folder_id_from_row(f),
        ),
    )
    fid = live_folder_id_from_row(sorted_folders[0])
    if fid:
        log.warning(
            "Kinescope live: %d folders under live project; using first by name (%s). "
            "Set KINESCOPE_LIVE_PARENT_ID to override.",
            len(folders),
            fid,
        )
        return fid
    raise RuntimeError("Kinescope live: could not parse folder id from API")


def create_live_event(
    name: str,
    scheduled_time_iso: datetime | str | None = None,
    project_id: str | None = None,
) -> dict:
    """Create a Kinescope live event. Returns _parse_live_event dict.

    API expects ``scheduled`` as ``{\"time\": \"RFC3339\"}`` (meta.Scheduled) and
    ``record`` as ``{\"parent_id\": \"...\"}`` (meta.Record).
    Event ``parent_id`` must be under the **live** catalog (folder or live project id).
    ``record.parent_id`` is usually **KINESCOPE_PROJECT_ID** (VOD) for the recording file.
    """
    log = logging.getLogger(__name__)
    live_pid = _resolve_live_folder_id(project_id)
    vod_pid = settings.kinescope_project_id.strip() or live_pid
    if vod_pid != live_pid:
        log.debug("Kinescope live: parent_id=%s (stream), record.parent_id=%s (vod)", live_pid, vod_pid)

    sched = scheduled_time_for_kinescope(scheduled_time_iso)
    if not sched:
        # Kinescope create form treats scheduled as required for many accounts
        sched = scheduled_time_for_kinescope(datetime.now(timezone.utc) + timedelta(minutes=10))
        log.info("Kinescope live: no start time — using default scheduled=%s", sched)

    def full_base(include_record: bool) -> dict:
        b: dict = {
            "name": name or "Webinar",
            "type": "recurring",
            "parent_id": live_pid,
            "auto_start": False,
            "protected": False,
            "time_shift": False,
            "reconnect_window": 600,
            "latency_mode": "standard",
            "show_members": True,
            "chat_active": True,
            "chat_after_stream": True,
            "chat_preview": True,
            "restreams": [],
            "video": {"presets": ["720p"]},
        }
        if include_record:
            b["record"] = {"parent_id": vod_pid}
        return b

    # Order matters: never accept a **no-record** payload before all **with-record** options fail,
    # otherwise the API may create a live event without VOD and replays will never appear.
    attempts: list[tuple[str, dict]] = []

    body_full_rec = {**full_base(True), "scheduled": {"time": sched}}
    attempts.append(("full_sched_record_true", body_full_rec))

    b_min: dict = {
        "name": name or "Webinar",
        "type": "recurring",
        "parent_id": live_pid,
        "record": {"parent_id": vod_pid},
        "scheduled": {"time": sched},
    }
    attempts.append(("minimal_with_record", b_min))

    if vod_pid != live_pid:
        attempts.append(
            (
                "full_record_parent_same_as_live",
                {
                    **full_base(True),
                    "scheduled": {"time": sched},
                    "record": {"parent_id": live_pid},
                },
            )
        )

    body_full_no_rec = {**full_base(False), "scheduled": {"time": sched}}
    attempts.append(("full_sched_record_false", body_full_no_rec))

    b_min_nr: dict = {
        "name": name or "Webinar",
        "type": "recurring",
        "parent_id": live_pid,
        "scheduled": {"time": sched},
    }
    attempts.append(("minimal_no_record_last_resort", b_min_nr))

    url = f"{API_V2_BASE}/live/events"
    last_err: RuntimeError | None = None
    last_body: str = ""
    with httpx.Client(timeout=30) as client:
        for label, body in attempts:
            resp = client.post(url, headers=_headers(), json=body)
            if resp.status_code < 400:
                try:
                    data = resp.json()
                except Exception as exc:
                    raise RuntimeError(
                        f"Kinescope create live: invalid JSON ({resp.status_code}): {resp.text[:400]}"
                    ) from exc
                event = data.get("data", data)
                if not isinstance(event, dict):
                    raise RuntimeError(f"Kinescope create live: unexpected response: {str(data)[:600]}")
                if not body.get("record"):
                    log.warning(
                        "Kinescope live event created without VOD record (%s) — replays may be unavailable. "
                        "Check KINESCOPE_PROJECT_ID (VOD) and live folder settings.",
                        label,
                    )
                parsed = _parse_live_event(event)
                eid = str(parsed.get("event_id") or "").strip()
                if eid and not str(parsed.get("stream_key") or "").strip():
                    try:
                        parsed = get_live_event(eid)
                    except Exception as ref_exc:
                        log.debug("Kinescope live: GET after create (stream key missing): %s", ref_exc)
                return parsed
            log.warning("Kinescope POST %s [%s] -> %s: %s", url, label, resp.status_code, resp.text[:1200])
            last_body = resp.text[:800]
            last_err = RuntimeError(f"Kinescope API {resp.status_code}: {last_body}")

    assert last_err is not None
    if "no such live folder" in last_body or "400245" in last_body:
        raise RuntimeError(
            "Kinescope 400245: parent_id must be in the **live** catalog (not VOD folders). "
            "GET /admin/kinescope/live-folders lists folders under catalog_type=live; "
            "set KINESCOPE_LIVE_PROJECT_ID / KINESCOPE_LIVE_PARENT_ID. "
            f"Response: {last_body[:400]}"
        )
    raise last_err


def get_live_event_document(event_id: str) -> dict:
    """Raw inner object from GET /v2/live/events/{id} (same as ``data`` in API JSON)."""
    eid = event_id.strip()
    if not eid:
        return {}
    with httpx.Client(timeout=15) as client:
        resp = client.get(f"{API_V2_BASE}/live/events/{quote(eid, safe='')}", headers=_headers())
    data = _check(resp)
    inner = data.get("data", data)
    return inner if isinstance(inner, dict) else {}


def resolve_recording_for_webinar(event_id: str) -> dict:
    """Single HTTP GET — VOD id from full JSON tree + player fallback (no multi-second poll).

    Kinescope often puts the finished recording id only under nested ``record``/``video`` keys;
    ``_parse_live_event`` already walks them, but we also run ``_extract_recording_video_id``
    on the raw document so nothing is missed.
    """
    raw = get_live_event_document(event_id)
    if not raw:
        return {
            "vod_id": "",
            "embed_id": "",
            "player_id": "",
            "poster_url": "",
            "parsed": {},
        }
    eid = event_id.strip()
    skip = frozenset(x for x in {eid, str(raw.get("id") or "").strip()} if x)
    parsed = _parse_live_event(raw)
    parsed = _enrich_parsed_live_event(eid, parsed)
    vod = (parsed.get("recording_video_id") or "").strip()
    if not vod:
        vod = _extract_recording_video_id(raw)
    if not vod:
        vod = _deep_find_recording_id(raw, skip_ids=skip)
    embed = (parsed.get("embed_id") or "").strip()
    player = embed or str(raw.get("id") or "").strip()
    poster = (parsed.get("thumbnail_url") or "").strip()
    pr = raw.get("poster")
    if not poster and isinstance(pr, dict):
        poster = str(pr.get("src") or "").strip()
    return {
        "vod_id": vod,
        "embed_id": embed,
        "player_id": player,
        "poster_url": poster,
        "parsed": parsed,
    }


def get_live_event(event_id: str) -> dict:
    """Fetch Kinescope live event details including stream credentials."""
    eid = event_id.strip()
    with httpx.Client(timeout=15) as client:
        resp = client.get(f"{API_V2_BASE}/live/events/{quote(eid, safe='')}", headers=_headers())
    data = _check(resp)
    event = data.get("data", data)
    if not isinstance(event, dict):
        raise RuntimeError(f"Kinescope get live event: unexpected response: {str(data)[:600]}")
    parsed = _parse_live_event(event)
    return _enrich_parsed_live_event(eid, parsed)


def update_live_event(event_id: str, name: str) -> dict:
    """Rename a Kinescope live event."""
    with httpx.Client(timeout=15) as client:
        resp = client.put(
            f"{API_V2_BASE}/live/events/{event_id}",
            headers=_headers(),
            json={"name": name},
        )
    data = _check(resp)
    event = data.get("data", data)
    return _parse_live_event(event)


def enable_live_event(event_id: str) -> dict:
    """Enable (start) a Kinescope live event."""
    eid = event_id.strip()
    with httpx.Client(timeout=15) as client:
        resp = client.put(
            f"{API_V2_BASE}/live/events/{quote(eid, safe='')}/enable",
            headers=_headers(),
        )
    data = _check(resp)
    event = data.get("data", data)
    if not isinstance(event, dict):
        return {}
    parsed = _parse_live_event(event)
    return _enrich_parsed_live_event(eid, parsed)


def finish_live_event(event_id: str) -> dict:
    """Complete (finish) a Kinescope live event. Recording finalize can take a few seconds."""
    eid = quote(event_id.strip(), safe="")
    with httpx.Client(timeout=60) as client:
        resp = client.put(f"{API_V2_BASE}/live/events/{eid}/complete", headers=_headers())
    data = _check(resp)
    event = data.get("data", data)
    return _parse_live_event(event) if isinstance(event, dict) else {}


def poll_recording_video_id(
    event_id: str,
    *,
    max_attempts: int = 20,
    delay_sec: float = 2.0,
) -> str:
    """After /complete, Kinescope may attach VOD id asynchronously — poll GET live event."""
    log = logging.getLogger(__name__)
    eid = event_id.strip()
    terminal_statuses = frozenset(
        {
            "completed",
            "complete",
            "finished",
            "stopped",
            "done",
            "archived",
            "idle",
        }
    )
    for attempt in range(max_attempts):
        try:
            live = get_live_event(eid)
            rid = (live.get("recording_video_id") or "").strip()
            if rid:
                return rid
            playback = playback_video_id_from_live_payload(live)
            status = str(live.get("status") or "").lower()
            terminal = status in terminal_statuses
            # While the event is still "live", return embed id after a few tries so the player works.
            if not terminal and attempt >= 5 and playback:
                return playback
            # After /complete, status becomes terminal before VOD id exists — do NOT return
            # the live embed id early or students get a broken replay player.
            if terminal:
                last = attempt >= max_attempts - 1
                if last:
                    if playback:
                        log.warning(
                            "poll_recording_video_id: no VOD id after %s attempts for %s; using fallback %s",
                            max_attempts,
                            eid[:12],
                            playback[:16],
                        )
                        return playback
                    return ""
                # keep polling
            elif attempt >= max_attempts - 1 and playback:
                return playback
        except RuntimeError as exc:
            log.debug("poll_recording_video_id %s attempt %s: %s", eid[:12], attempt, exc)
        if attempt + 1 < max_attempts:
            time.sleep(delay_sec)
    return ""


def delete_live_event(event_id: str) -> None:
    """Delete a Kinescope live event."""
    with httpx.Client(timeout=15) as client:
        resp = client.delete(f"{API_V2_BASE}/live/events/{event_id}", headers=_headers())
    if resp.status_code >= 400 and resp.status_code != 404:
        raise RuntimeError(f"Kinescope delete live event failed: {resp.status_code}")
