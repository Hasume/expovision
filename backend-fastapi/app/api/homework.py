from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from typing import Any, List, Optional, Tuple
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.rate_limit import limit
from app.db.session import get_db
from app.deps.auth import CurrentUser, get_current_user, require_roles
from app.services.chat_events import emit_system_message
from app.services.common_queries import get_effective_intensive, get_user
from app.services.gemini_client import GeminiServiceError, gemini_client
from app.services.intensive import ensure_platform_accessible


router = APIRouter(prefix="/homework", tags=["homework"])
logger = logging.getLogger(__name__)

HW_ATTACH_DIR = Path("/app/uploads/homework-attachments")
HW_ATTACH_MAX_SIZE = 20 * 1024 * 1024  # 20 MB per file
HW_ATTACH_MAX_FILES = 10

# Broad allowlist: common documents, media, archives, 3D/fonts, data, source; no executables / disk images.
_HW_MISC: frozenset[str] = frozenset(
    {
        "model/stl",
        "model/gltf+json",
        "model/gltf-binary",
        "font/ttf",
        "font/otf",
        "application/vnd.ms-fontobject",
    }
)
_HW_ATTACH_IMAGES: frozenset[str] = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/bmp",
        "image/tiff",
        # image/svg+xml excluded: SVG files can contain embedded <script> tags and
        # are served from the same origin, making them an XSS vector when opened directly.
        "image/x-icon",
        "image/vnd.microsoft.icon",
        "image/heic",
        "image/heif",
        "image/avif",
        "image/jxl",
    }
)
_HW_ATTACH_OFFICE: frozenset[str] = frozenset(
    {
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-excel",
        "application/vnd.ms-powerpoint",
        "application/vnd.oasis.opendocument.text",
        "application/vnd.oasis.opendocument.spreadsheet",
        "application/vnd.oasis.opendocument.presentation",
    }
)
_HW_MEDIA: frozenset[str] = frozenset(
    {
        "audio/mpeg",
        "audio/wav",
        "audio/ogg",
        "audio/x-wav",
        "audio/x-m4a",
        "audio/mp4",
        "audio/aac",
        "audio/flac",
        "audio/webm",
        "video/mp4",
        "video/mpeg",
        "video/webm",
        "video/ogg",
        "video/quicktime",
        "video/3gpp",
        "video/3gpp2",
        "video/x-msvideo",
        "video/x-matroska",
        "video/x-flv",
        "video/avi",
    }
)
_HW_ARCHIVES: frozenset[str] = frozenset(
    {
        "application/zip",
        "application/x-zip-compressed",
        "application/x-7z-compressed",
        "application/x-rar-compressed",
        "application/vnd.rar",
        "application/gzip",
        "application/x-gzip",
        "application/x-tar",
        "application/x-bzip2",
        "application/x-xz",
    }
)
_HW_DATA_TEXT: frozenset[str] = frozenset(
    {
        "text/plain",
        "text/csv",
        "text/comma-separated-values",
        "text/markdown",
        # text/html excluded: HTML files execute as web pages when opened from the
        # uploads origin, enabling stored XSS attacks against other users.
        "text/xml",
        "text/rtf",
        "text/vtt",
        "text/calendar",
        "text/x-yaml",
        "application/json",
        "application/xml",
        "application/x-yaml",
        "application/yaml",
        "application/pdf",
        "application/rtf",
        "font/woff",
        "font/woff2",
        "application/vnd.ms-excel.sheet.macroenabled.12",
        "application/epub+zip",
        "image/vnd.adobe.photoshop",
        "image/x-photoshop",
    }
)
HW_ATTACH_ALLOWED_MIME: frozenset[str] = (
    _HW_MISC
    | _HW_ATTACH_IMAGES
    | _HW_ATTACH_OFFICE
    | _HW_MEDIA
    | _HW_ARCHIVES
    | _HW_DATA_TEXT
)

HW_ATTACH_MIME_ALIASES: dict[str, str] = {
    "image/jpg": "image/jpeg",
    "image/pjpeg": "image/jpeg",
    "image/x-png": "image/png",
    "image/x-bmp": "image/bmp",
    "text/x-markdown": "text/markdown",
    "text/x-c": "text/plain",
    "text/x-python": "text/plain",
    "text/javascript": "text/plain",
    "text/x-csv": "text/csv",
    "text/x-yaml": "text/plain",
    "application/x-yaml": "text/plain",
    "application/txt": "text/plain",
    "audio/mp3": "audio/mpeg",
    "video/x-m4v": "video/mp4",
    "application/vnd.ms-excel.sheet.macroEnabled.12": "application/vnd.ms-excel.sheet.macroenabled.12",
}

# Source/config extensions → text (subset; full list extended below).
_HW_PLAIN_EXTS: frozenset[str] = frozenset(
    """
    c h cpp cc cxx hpp hxx py pyw rb js jsx mjs cjs ts tsx mts cts d java kt kts ktm swift scala
    sbt go rs r jl zig v php phtml sql pl pm raku lua vim hs lhs elm clj cljs edn ex exs erl
    hrl gradle ino pde svelte vue dart cs fs fsx vb vbs pas pp p asm s sc nasm
    cr nim odin ml mli sml f90 f95 for ft cl m mm csx graphql gql
    toml yml conf cfg ini env rc sh bash zsh ksh ps1 psd1 psm1 bat cmd tex cls sty bib puml
    plantuml tf hcl bicep dockerfile mak rst adoc mdx
    """.split()
)
HW_ATTACH_EXT_MIME: dict[str, str] = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "jpe": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "bmp": "image/bmp",
    "tif": "image/tiff",
    "tiff": "image/tiff",
    # "svg": excluded — SVG can contain <script> and execute XSS from the uploads origin
    "ico": "image/x-icon",
    "heic": "image/heic",
    "heif": "image/heif",
    "avif": "image/avif",
    "jxl": "image/jxl",
    "psd": "image/vnd.adobe.photoshop",
    "pdf": "application/pdf",
    "zip": "application/zip",
    "7z": "application/x-7z-compressed",
    "rar": "application/vnd.rar",
    "gz": "application/gzip",
    "tgz": "application/gzip",
    "tar": "application/x-tar",
    "bz2": "application/x-bzip2",
    "tbz2": "application/x-bzip2",
    "txz": "application/x-xz",
    "xz": "application/x-xz",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsm": "application/vnd.ms-excel.sheet.macroenabled.12",
    "ppt": "application/vnd.ms-powerpoint",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "odt": "application/vnd.oasis.opendocument.text",
    "ods": "application/vnd.oasis.opendocument.spreadsheet",
    "odp": "application/vnd.oasis.opendocument.presentation",
    "txt": "text/plain",
    "log": "text/plain",
    "md": "text/markdown",
    "markdown": "text/markdown",
    # "html"/"htm": excluded — served as HTML from uploads origin, enabling stored XSS
    "csv": "text/csv",
    "tsv": "text/plain",
    "ics": "text/calendar",
    "vtt": "text/vtt",
    "json": "application/json",
    "jsonl": "application/json",
    "xml": "text/xml",
    "yaml": "text/plain",
    "yml": "text/plain",
    "epub": "application/epub+zip",
    "rtf": "application/rtf",
    "woff": "font/woff",
    "woff2": "font/woff2",
    "ttf": "font/ttf",
    "otf": "font/otf",
    "eot": "application/vnd.ms-fontobject",
    "mp3": "audio/mpeg",
    "m4a": "audio/mpeg",
    "aac": "audio/aac",
    "wav": "audio/wav",
    "flac": "audio/flac",
    "ogg": "audio/ogg",
    "oga": "audio/ogg",
    "opus": "audio/ogg",
    "mp4": "video/mp4",
    "m4v": "video/mp4",
    "webm": "video/webm",
    "ogv": "video/ogg",
    "mov": "video/quicktime",
    "qt": "video/quicktime",
    "avi": "video/x-msvideo",
    "mkv": "video/x-matroska",
    "flv": "video/x-flv",
    "wmv": "video/x-msvideo",
    "mpg": "video/mpeg",
    "mpeg": "video/mpeg",
    "3gp": "video/3gpp",
    "3g2": "video/3gpp2",
    "stl": "model/stl",
    "gltf": "model/gltf+json",
    "glb": "model/gltf-binary",
    "srt": "text/plain",
    "sub": "text/plain",
    "key": "application/zip",
    "numbers": "application/zip",
    "pages": "application/zip",
    "tar.gz": "application/gzip",
    "tar.bz2": "application/x-bzip2",
    "tar.xz": "application/x-xz",
}
for _e in _HW_PLAIN_EXTS:
    HW_ATTACH_EXT_MIME.setdefault(_e, "text/plain")

# foo.tar.gz → extension key "tar.gz" (not only .tgz)
_HW_COMPOUND_EXTS: tuple[tuple[str, str], ...] = (
    (".tar.gz", "application/gzip"),
    (".tgz", "application/gzip"),
    (".tar.bz2", "application/x-bzip2"),
    (".tbz2", "application/x-bzip2"),
    (".tar.xz", "application/x-xz"),
)

_HW_GENERIC_MIME: frozenset[str] = frozenset(
    {
        "",
        "application/octet-stream",
        "binary/octet-stream",
        "application/unknown",
        "application/x-download",
        "application/force-download",
    }
)


def _ext_from_filename(filename: str) -> str:
    if not filename or "." not in filename:
        return ""
    lower = filename.lower()
    for suffix, _mime in _HW_COMPOUND_EXTS:
        if lower.endswith(suffix):
            return suffix[1:]
    return filename.rsplit(".", 1)[-1].lower()


def _normalize_upload_mime(filename: str, content_type: str | None) -> str:
    raw = (content_type or "").strip()
    base = raw.split(";", 1)[0].strip().lower() if raw else ""
    base = HW_ATTACH_MIME_ALIASES.get(base, base)
    if base in HW_ATTACH_ALLOWED_MIME:
        return base
    ext = _ext_from_filename(filename)
    ext_mime = HW_ATTACH_EXT_MIME.get(ext)
    if ext_mime and ext_mime in HW_ATTACH_ALLOWED_MIME and base in _HW_GENERIC_MIME:
        return ext_mime
    raise HTTPException(status_code=400, detail=f"File type not allowed: {content_type or 'unknown'}")


class SubmitHomeworkRequest(BaseModel):
    dayNumber: int = Field(ge=1)
    answerText: str = Field(min_length=20, max_length=50_000)
    reflectionText: str = Field(default="", max_length=4000)
    aiUsageDisclosure: str = Field(default="", max_length=2000)
    attachmentUrls: List[str] = Field(default_factory=list)


class ReviewHomeworkRequest(BaseModel):
    submissionId: str = Field(min_length=3)
    verdict: str
    comment: str = Field(min_length=2)


class CuratorSuggestFeedbackRequest(BaseModel):
    submissionId: str = Field(min_length=3)
    outputLanguage: Optional[str] = Field(
        default=None,
        description="ru or en; default follows the student's profile language",
    )


class AiCoachHomeworkRequest(BaseModel):
    dayNumber: int = Field(ge=1)
    answerText: str = Field(min_length=20, max_length=15000)


class EvidenceCheckRequest(BaseModel):
    dayNumber: int = Field(ge=1)
    answerText: str = Field(min_length=20, max_length=15000)
    reflectionText: str = Field(default="", max_length=4000)
    aiUsageDisclosure: str = Field(default="", max_length=2000)


class SaveHomeworkDraftRequest(BaseModel):
    dayNumber: int = Field(ge=1, le=14)
    answerText: str = Field(default="", max_length=20000)
    reflectionText: str = Field(default="", max_length=4000)
    aiUsageDisclosure: str = Field(default="", max_length=2000)
    coach: dict[str, Any] | None = None
    evidence: dict[str, Any] | None = None


def _day_filter_sql(selected_track: Optional[str]) -> Tuple[str, dict[str, str]]:
    if selected_track:
        return '(d."track" IS NULL OR d."track" = :selected_track)', {"selected_track": selected_track}
    return 'd."track" IS NULL', {}


def _program_day_homework_deadline_utc(start_at: datetime, day_number: int) -> datetime:
    """End of program day `day_number` (same boundary as services.unlock.calculate_current_day)."""
    if start_at.tzinfo is None:
        start_utc = start_at.replace(tzinfo=timezone.utc)
    else:
        start_utc = start_at.astimezone(timezone.utc)
    return start_utc + timedelta(days=day_number)


def _build_ai_coach_prompt(
    *,
    language: str,
    day_number: int,
    instruction: str,
    sample: str,
    min_length: int,
    answer_text: str,
) -> str:
    if language == "ru":
        return f"""
Ты — строгий, но поддерживающий AI-наставник по домашним заданиям.
Ниже данные по домашке студента.

День: {day_number}
Минимальная длина: {min_length}
Инструкция:
{instruction}

Пример:
{sample or "-"}

Ответ студента:
{answer_text}

Сделай разбор и верни ТОЛЬКО JSON-объект без markdown:
{{
  "summary": "краткая оценка 1-2 предложения",
  "score": число от 0 до 100,
  "strengths": ["сильная сторона 1", "сильная сторона 2"],
  "improvements": ["что улучшить 1", "что улучшить 2"],
  "nextSteps": ["следующий шаг 1", "следующий шаг 2"],
  "reflectionQuestions": ["вопрос 1", "вопрос 2"]
}}

Правила:
- оценивай по конкретике и соответствию задаче
- не придумывай факты, опирайся только на текст
- если ответ слишком короткий или поверхностный, прямо скажи это в improvements
- сохраняй дружелюбный профессиональный тон
""".strip()

    return f"""
You are a strict but supportive AI homework coach.
Use only the provided context.

Day: {day_number}
Minimum length: {min_length}
Instruction:
{instruction}

Sample:
{sample or "-"}

Student answer:
{answer_text}

Return ONLY a JSON object (no markdown):
{{
  "summary": "short evaluation in 1-2 sentences",
  "score": number between 0 and 100,
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "nextSteps": ["next step 1", "next step 2"],
  "reflectionQuestions": ["question 1", "question 2"]
}}

Rules:
- evaluate based on specificity and fit to assignment
- do not invent facts, rely only on the student text
- if the answer is short or shallow, mention that explicitly in improvements
- keep a professional and supportive tone
""".strip()


def _build_evidence_prompt(
    *,
    language: str,
    day_number: int,
    instruction: str,
    answer_text: str,
    reflection_text: str,
    ai_usage_disclosure: str,
) -> str:
    if language == "ru":
        return f"""
Ты проверяешь целостность выполнения домашнего задания.
Верни только JSON:
{{
  "riskScore": число 0..100,
  "flags": ["краткий флаг"],
  "followUpQuestions": ["вопрос 1", "вопрос 2"],
  "assessment": "краткий вывод"
}}

Контекст:
День: {day_number}
Инструкция:
{instruction}

Ответ студента:
{answer_text}

Reflection:
{reflection_text or "-"}

Disclosure об использовании AI:
{ai_usage_disclosure or "-"}
""".strip()

    return f"""
You assess homework integrity and evidence quality.
Return only JSON:
{{
  "riskScore": number 0..100,
  "flags": ["short flag"],
  "followUpQuestions": ["question 1", "question 2"],
  "assessment": "short conclusion"
}}

Context:
Day: {day_number}
Instruction:
{instruction}

Student answer:
{answer_text}

Reflection:
{reflection_text or "-"}

AI usage disclosure:
{ai_usage_disclosure or "-"}
""".strip()


def _as_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _safe_json_object(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _pick_locale(ru: str | None, en: str | None, is_ru: bool) -> str:
    primary = (ru if is_ru else en) or ""
    if primary.strip():
        return primary
    return (en if is_ru else ru) or ""


def _normalize_ui_language(raw: str | None) -> str:
    s = (raw or "").lower()
    return s if s in {"ru", "en"} else "en"


def _truncate_for_prompt(text: str, max_chars: int) -> str:
    t = (text or "").strip()
    if len(t) <= max_chars:
        return t
    return t[: max_chars - 1].rstrip() + "…"


def _build_curator_feedback_prompt(
    *,
    output_language: str,
    day_number: int,
    instruction: str,
    sample: str,
    min_length: int,
    answer_text: str,
    reflection_text: str,
    ai_usage_disclosure: str,
    ai_risk: int | None,
    submission_status: str,
    history_lines: list[str],
) -> str:
    hist = "\n".join(history_lines) if history_lines else "(no prior reviewed homework in context)"
    risk_note = "unknown" if ai_risk is None else str(ai_risk)
    lang = "Russian" if output_language == "ru" else "English"
    return f"""
You help a human curator write personalized feedback for an intensive-course student.
Write ONLY the message text the curator could send to the student (warm, specific, actionable).
Language of the feedback message: {lang} (entire message in {lang}).

Current homework:
- Program day: {day_number}
- Assignment instruction (markdown/plain):
{instruction}
- Sample / rubric hint (may be empty):
{sample or "-"}
- Minimum expected length (chars): {min_length}
- Submission status flag: {submission_status}
- AI integrity risk score 0-100 (if applicable): {risk_note}

Student answer:
{answer_text}

Reflection:
{reflection_text or "-"}

AI usage disclosure:
{ai_usage_disclosure or "-"}

Prior homework (already reviewed; excerpts only):
{hist}

Rules:
- Reference the assignment requirements and what the student actually wrote.
- If history is present, note progress or recurring patterns briefly (do not invent grades not in the data).
- Do not accuse of cheating; if risk is high, suggest clarifying questions or deeper reflection instead.
- Keep 2–5 short paragraphs or bullet points; no meta-talk ("as a curator").
- Do not mention internal scores unless helpful as gentle encouragement.

Return ONLY JSON (no markdown fences):
{{"feedback": "the full message text"}}
""".strip()


@router.get("/template/{day_number}")
def template(day_number: int, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    user_row = get_user(db, user.user_id)
    intensive = get_effective_intensive(db, user.user_id)
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    ensure_platform_accessible(intensive)
    track_sql, params = _day_filter_sql(user_row["selectedTrack"])
    flow_sql = "1=1"
    if intensive.get("source") == "flow" and intensive.get("hasCustomDays"):
        flow_sql = 'EXISTS (SELECT 1 FROM "IntensiveFlowDay" fd WHERE fd."flowId" = :flow_id AND fd."curriculumDayId" = d."id")'
        params["flow_id"] = intensive["id"]
    params["day_number"] = day_number
    row = db.execute(
        text(
            f"""
            SELECT h."instructionRu", h."instructionEn", h."sampleRu", h."sampleEn", h."minLength"
            FROM "HomeworkTemplate" h
            JOIN "CurriculumDay" d ON d."id" = h."curriculumDayId"
            WHERE d."dayNumber" = :day_number
              AND {track_sql}
              AND {flow_sql}
            LIMIT 1
            """
        ),
        params,
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=400, detail="Homework template not found")
    is_ru = user.language == "ru"
    deadline = _program_day_homework_deadline_utc(intensive["startAt"], day_number)
    return {
        "dayNumber": day_number,
        "instructionMd": _pick_locale(row["instructionRu"], row["instructionEn"], is_ru),
        "sampleMd": _pick_locale(row["sampleRu"], row["sampleEn"], is_ru),
        "minLength": row["minLength"],
        "dueAtIso": deadline.isoformat(),
    }


@router.post("/attachments/upload")
async def upload_attachments(
    files: List[UploadFile],
    user: CurrentUser = Depends(get_current_user),
):
    if len(files) > HW_ATTACH_MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Too many files (max {HW_ATTACH_MAX_FILES})")

    HW_ATTACH_DIR.mkdir(parents=True, exist_ok=True)
    result = []
    for file in files:
        original_name = file.filename or "file"
        mime = _normalize_upload_mime(original_name, file.content_type)
        content = await file.read()
        if len(content) > HW_ATTACH_MAX_SIZE:
            raise HTTPException(status_code=400, detail=f"File too large (max 20 MB): {file.filename}")

        ext = original_name.rsplit(".", 1)[-1] if "." in original_name else "bin"
        safe_name = f"{uuid4().hex}.{ext}"
        user_dir = HW_ATTACH_DIR / user.user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        (user_dir / safe_name).write_bytes(content)

        result.append({
            "url": f"/uploads/homework-attachments/{user.user_id}/{safe_name}",
            "fileName": original_name,
            "fileSize": len(content),
            "mimeType": mime,
        })

    return result


@router.post("/submit")
def submit(payload: SubmitHomeworkRequest, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    user_row = get_user(db, user.user_id)
    intensive = get_effective_intensive(db, user.user_id)
    if not user_row or not intensive:
        raise HTTPException(status_code=400, detail="User or intensive config not found")
    ensure_platform_accessible(intensive)

    track_sql, params = _day_filter_sql(user_row["selectedTrack"])
    flow_sql = "1=1"
    if intensive.get("source") == "flow" and intensive.get("hasCustomDays"):
        flow_sql = 'EXISTS (SELECT 1 FROM "IntensiveFlowDay" fd WHERE fd."flowId" = :flow_id AND fd."curriculumDayId" = d."id")'
        params["flow_id"] = intensive["id"]
    params["day_number"] = payload.dayNumber
    template = db.execute(
        text(
            f"""
            SELECT h."id"
            FROM "HomeworkTemplate" h
            JOIN "CurriculumDay" d ON d."id" = h."curriculumDayId"
            WHERE d."dayNumber" = :day_number
              AND {track_sql}
              AND {flow_sql}
            LIMIT 1
            """
        ),
        params,
    ).mappings().first()
    if not template:
        raise HTTPException(status_code=400, detail="Homework template not found")

    deadline = _program_day_homework_deadline_utc(intensive["startAt"], payload.dayNumber)
    now = datetime.now(timezone.utc)
    is_overdue = now >= deadline
    status_value = "overdue" if is_overdue else "pending_review"
    due_at = deadline.replace(tzinfo=None)

    existing = db.execute(
        text(
            """
            SELECT "id"
            FROM "HomeworkSubmission"
            WHERE "userId" = :user_id AND "templateId" = :template_id
            """
        ),
        {"user_id": user.user_id, "template_id": template["id"]},
    ).mappings().first()
    if existing:
        submission_id = existing["id"]
        db.execute(
            text(
                """
                UPDATE "HomeworkSubmission"
                SET "answerText" = :answer_text,
                    "reflectionText" = :reflection_text,
                    "aiUsageDisclosure" = :ai_usage_disclosure,
                    "isCompleted" = true,
                    "status" = :status,
                    "dueAt" = :due_at,
                    "updatedAt" = :updated_at
                WHERE "userId" = :user_id AND "templateId" = :template_id
                """
            ),
            {
                "answer_text": payload.answerText,
                "reflection_text": payload.reflectionText.strip() or None,
                "ai_usage_disclosure": payload.aiUsageDisclosure.strip() or None,
                "status": status_value,
                "due_at": due_at,
                "updated_at": datetime.now(timezone.utc),
                "user_id": user.user_id,
                "template_id": template["id"],
            },
        )
    else:
        submission_id = str(uuid4())
        now = datetime.now(timezone.utc)
        db.execute(
            text(
                """
                INSERT INTO "HomeworkSubmission" (
                    "id", "userId", "templateId", "answerText", "reflectionText", "aiUsageDisclosure", "isCompleted", "status",
                    "dueAt", "createdAt", "updatedAt"
                )
                VALUES (:id, :user_id, :template_id, :answer_text, :reflection_text, :ai_usage_disclosure, true, :status, :due_at, :created_at, :updated_at)
                """
            ),
            {
                "id": submission_id,
                "user_id": user.user_id,
                "template_id": template["id"],
                "answer_text": payload.answerText,
                "reflection_text": payload.reflectionText.strip() or None,
                "ai_usage_disclosure": payload.aiUsageDisclosure.strip() or None,
                "status": status_value,
                "due_at": due_at,
                "created_at": now,
                "updated_at": now,
            },
        )

    # Replace attachments atomically with every submit
    if payload.attachmentUrls is not None:
        allowed_prefix = f"/uploads/homework-attachments/{user.user_id}/"
        bad_urls = [u for u in payload.attachmentUrls if not u.startswith(allowed_prefix)]
        if bad_urls:
            raise HTTPException(
                status_code=400,
                detail="attachmentUrls must point to your own uploaded files",
            )
        db.execute(
            text('DELETE FROM "HomeworkAttachment" WHERE "submissionId" = :sid'),
            {"sid": submission_id},
        )
        att_rows = [
            {
                "id": str(uuid4()),
                "submission_id": submission_id,
                "file_url": url,
                "file_name": url.rsplit("/", 1)[-1],
                "file_size": 0,
                "mime_type": "",
                "created_at": datetime.now(timezone.utc),
            }
            for url in payload.attachmentUrls[:HW_ATTACH_MAX_FILES]
        ]
        if att_rows:
            db.execute(
                text(
                    """
                    INSERT INTO "HomeworkAttachment" ("id", "submissionId", "fileUrl", "fileName", "fileSize", "mimeType", "createdAt")
                    VALUES (:id, :submission_id, :file_url, :file_name, :file_size, :mime_type, :created_at)
                    """
                ),
                att_rows,
            )

    emit_system_message(db, user_id=user.user_id, event_type="homework_submitted", meta={"dayNumber": payload.dayNumber})
    db.commit()
    return {"success": True, "dueAt": deadline.isoformat(), "status": status_value}


@router.post("/evidence-check", dependencies=[Depends(limit(15, 60))])
def evidence_check(
    payload: EvidenceCheckRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_row = get_user(db, user.user_id)
    intensive = get_effective_intensive(db, user.user_id)
    if not user_row or not intensive:
        raise HTTPException(status_code=400, detail="User or intensive config not found")
    ensure_platform_accessible(intensive)

    track_sql, params = _day_filter_sql(user_row["selectedTrack"])
    flow_sql = "1=1"
    if intensive.get("source") == "flow" and intensive.get("hasCustomDays"):
        flow_sql = 'EXISTS (SELECT 1 FROM "IntensiveFlowDay" fd WHERE fd."flowId" = :flow_id AND fd."curriculumDayId" = d."id")'
        params["flow_id"] = intensive["id"]
    params["day_number"] = payload.dayNumber

    template = db.execute(
        text(
            f"""
            SELECT h."instructionRu", h."instructionEn"
            FROM "HomeworkTemplate" h
            JOIN "CurriculumDay" d ON d."id" = h."curriculumDayId"
            WHERE d."dayNumber" = :day_number
              AND {track_sql}
              AND {flow_sql}
            LIMIT 1
            """
        ),
        params,
    ).mappings().first()
    if not template:
        raise HTTPException(status_code=400, detail="Homework template not found")

    is_ru = user.language == "ru"
    if gemini_client.enabled:
        prompt = _build_evidence_prompt(
            language=user_row["language"],
            day_number=payload.dayNumber,
            instruction=_pick_locale(template["instructionRu"], template["instructionEn"], is_ru),
            answer_text=payload.answerText,
            reflection_text=payload.reflectionText,
            ai_usage_disclosure=payload.aiUsageDisclosure,
        )
        try:
            ai_result = gemini_client.generate_json(prompt)
        except GeminiServiceError as exc:
            raise HTTPException(status_code=502, detail="Evidence check is temporarily unavailable") from exc
        risk_raw = ai_result.get("riskScore", 0)
        try:
            risk_score = max(0, min(100, int(risk_raw)))
        except (TypeError, ValueError):
            risk_score = 0
        return {
            "riskScore": risk_score,
            "flags": _as_string_list(ai_result.get("flags")),
            "followUpQuestions": _as_string_list(ai_result.get("followUpQuestions")),
            "assessment": str(ai_result.get("assessment", "")).strip(),
        }

    risk_score = 0
    flags: list[str] = []
    if len(payload.answerText.strip()) < 120:
        risk_score += 25
        flags.append("answer_too_short")
    if not payload.reflectionText.strip():
        risk_score += 20
        flags.append("missing_reflection")
    if not payload.aiUsageDisclosure.strip():
        risk_score += 10
        flags.append("missing_ai_disclosure")
    if payload.aiUsageDisclosure.strip() and "не использ" in payload.aiUsageDisclosure.lower():
        risk_score = max(0, risk_score - 5)

    return {
        "riskScore": min(100, risk_score),
        "flags": flags,
        "followUpQuestions": (
            ["Опиши, какие части ты сделал без AI?", "Какие решения были самыми сложными?"]
            if is_ru
            else ["Which parts did you complete without AI assistance?", "Which decisions were the hardest and why?"]
        ),
        "assessment": (
            "Heuristic-based check completed."
            if not is_ru
            else "Проверка выполнена по эвристикам."
        ),
    }


@router.post("/ai-coach", dependencies=[Depends(limit(15, 60))])
def ai_coach(
    payload: AiCoachHomeworkRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not gemini_client.enabled:
        raise HTTPException(status_code=503, detail="AI coach is not configured")

    user_row = get_user(db, user.user_id)
    intensive = get_effective_intensive(db, user.user_id)
    if not user_row or not intensive:
        raise HTTPException(status_code=400, detail="User or intensive config not found")
    ensure_platform_accessible(intensive)

    track_sql, params = _day_filter_sql(user_row["selectedTrack"])
    flow_sql = "1=1"
    if intensive.get("source") == "flow" and intensive.get("hasCustomDays"):
        flow_sql = 'EXISTS (SELECT 1 FROM "IntensiveFlowDay" fd WHERE fd."flowId" = :flow_id AND fd."curriculumDayId" = d."id")'
        params["flow_id"] = intensive["id"]
    params["day_number"] = payload.dayNumber
    template = db.execute(
        text(
            f"""
            SELECT h."instructionRu", h."instructionEn", h."sampleRu", h."sampleEn", h."minLength"
            FROM "HomeworkTemplate" h
            JOIN "CurriculumDay" d ON d."id" = h."curriculumDayId"
            WHERE d."dayNumber" = :day_number
              AND {track_sql}
              AND {flow_sql}
            LIMIT 1
            """
        ),
        params,
    ).mappings().first()
    if not template:
        raise HTTPException(status_code=400, detail="Homework template not found")

    is_ru = user.language == "ru"
    prompt = _build_ai_coach_prompt(
        language=user_row["language"],
        day_number=payload.dayNumber,
        instruction=_pick_locale(template["instructionRu"], template["instructionEn"], is_ru),
        sample=_pick_locale(template["sampleRu"], template["sampleEn"], is_ru),
        min_length=int(template["minLength"]),
        answer_text=payload.answerText,
    )
    try:
        ai_result = gemini_client.generate_json(prompt)
    except GeminiServiceError as exc:
        raise HTTPException(status_code=502, detail="AI coach is temporarily unavailable") from exc

    score_raw = ai_result.get("score", 0)
    try:
        score = max(0, min(100, int(score_raw)))
    except (TypeError, ValueError):
        score = 0

    return {
        "summary": str(ai_result.get("summary", "")).strip(),
        "score": score,
        "strengths": _as_string_list(ai_result.get("strengths")),
        "improvements": _as_string_list(ai_result.get("improvements")),
        "nextSteps": _as_string_list(ai_result.get("nextSteps")),
        "reflectionQuestions": _as_string_list(ai_result.get("reflectionQuestions")),
    }


@router.get("/draft/{day_number}")
def get_draft(day_number: int, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    user_row = get_user(db, user.user_id)
    intensive = get_effective_intensive(db, user.user_id)
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    ensure_platform_accessible(intensive)
    row = db.execute(
        text(
            """
            SELECT "answerText", "reflectionText", "aiUsageDisclosure", "coachJson", "evidenceJson", "updatedAt"
            FROM "HomeworkDraftState"
            WHERE "userId" = :user_id AND "dayNumber" = :day_number
            LIMIT 1
            """
        ),
        {"user_id": user.user_id, "day_number": day_number},
    ).mappings().first()
    if row:
        return {
            "exists": True,
            "answerText": row["answerText"] or "",
            "reflectionText": row["reflectionText"] or "",
            "aiUsageDisclosure": row["aiUsageDisclosure"] or "",
            "coach": _safe_json_object(row["coachJson"]),
            "evidence": _safe_json_object(row["evidenceJson"]),
            "updatedAt": row["updatedAt"].isoformat() if row["updatedAt"] else None,
        }

    track_sql, sub_params = _day_filter_sql(user_row["selectedTrack"])
    flow_sql = "1=1"
    if intensive.get("source") == "flow" and intensive.get("hasCustomDays"):
        flow_sql = 'EXISTS (SELECT 1 FROM "IntensiveFlowDay" fd WHERE fd."flowId" = :flow_id AND fd."curriculumDayId" = d."id")'
        sub_params["flow_id"] = intensive["id"]
    sub_params["user_id"] = user.user_id
    sub_params["day_number"] = day_number
    submission = db.execute(
        text(
            f"""
            SELECT s."answerText", s."reflectionText", s."aiUsageDisclosure", s."updatedAt"
            FROM "HomeworkSubmission" s
            JOIN "HomeworkTemplate" h ON h."id" = s."templateId"
            JOIN "CurriculumDay" d ON d."id" = h."curriculumDayId"
            WHERE s."userId" = :user_id AND d."dayNumber" = :day_number
              AND {track_sql}
              AND {flow_sql}
            ORDER BY s."updatedAt" DESC
            LIMIT 1
            """
        ),
        sub_params,
    ).mappings().first()
    if not submission:
        return {"exists": False}
    return {
        "exists": True,
        "answerText": submission["answerText"] or "",
        "reflectionText": submission["reflectionText"] or "",
        "aiUsageDisclosure": submission["aiUsageDisclosure"] or "",
        "coach": None,
        "evidence": None,
        "updatedAt": submission["updatedAt"].isoformat() if submission["updatedAt"] else None,
    }


@router.post("/draft")
def save_draft(payload: SaveHomeworkDraftRequest, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    intensive = get_effective_intensive(db, user.user_id)
    ensure_platform_accessible(intensive)
    now = datetime.now(timezone.utc)
    existing = db.execute(
        text(
            """
            SELECT "id"
            FROM "HomeworkDraftState"
            WHERE "userId" = :user_id AND "dayNumber" = :day_number
            LIMIT 1
            """
        ),
        {"user_id": user.user_id, "day_number": payload.dayNumber},
    ).first()
    coach_json = json.dumps(payload.coach, ensure_ascii=False) if payload.coach is not None else None
    evidence_json = json.dumps(payload.evidence, ensure_ascii=False) if payload.evidence is not None else None
    if existing:
        db.execute(
            text(
                """
                UPDATE "HomeworkDraftState"
                SET "answerText" = :answer_text,
                    "reflectionText" = :reflection_text,
                    "aiUsageDisclosure" = :ai_usage_disclosure,
                    "coachJson" = :coach_json,
                    "evidenceJson" = :evidence_json,
                    "updatedAt" = :updated_at
                WHERE "userId" = :user_id AND "dayNumber" = :day_number
                """
            ),
            {
                "answer_text": payload.answerText,
                "reflection_text": payload.reflectionText,
                "ai_usage_disclosure": payload.aiUsageDisclosure,
                "coach_json": coach_json,
                "evidence_json": evidence_json,
                "updated_at": now,
                "user_id": user.user_id,
                "day_number": payload.dayNumber,
            },
        )
    else:
        db.execute(
            text(
                """
                INSERT INTO "HomeworkDraftState" (
                    "id", "userId", "dayNumber", "answerText", "reflectionText", "aiUsageDisclosure", "coachJson", "evidenceJson",
                    "createdAt", "updatedAt"
                )
                VALUES (
                    :id, :user_id, :day_number, :answer_text, :reflection_text, :ai_usage_disclosure, :coach_json, :evidence_json,
                    :created_at, :updated_at
                )
                """
            ),
            {
                "id": str(uuid4()),
                "user_id": user.user_id,
                "day_number": payload.dayNumber,
                "answer_text": payload.answerText,
                "reflection_text": payload.reflectionText,
                "ai_usage_disclosure": payload.aiUsageDisclosure,
                "coach_json": coach_json,
                "evidence_json": evidence_json,
                "created_at": now,
                "updated_at": now,
            },
        )
    db.commit()
    return {"success": True, "updatedAt": now.isoformat()}


def build_homework_mine_payload(db: Session, user: CurrentUser, *, _intensive: dict | None = None) -> list[dict]:
    intensive = _intensive if _intensive is not None else get_effective_intensive(db, user.user_id)
    if not intensive:
        return []
    ensure_platform_accessible(intensive)
    track_sql, params = _day_filter_sql(user.selected_track)
    flow_sql = "1=1"
    if intensive.get("source") == "flow" and intensive.get("hasCustomDays"):
        flow_sql = 'EXISTS (SELECT 1 FROM "IntensiveFlowDay" fd WHERE fd."flowId" = :flow_id AND fd."curriculumDayId" = d."id")'
        params["flow_id"] = intensive["id"]
    params["user_id"] = user.user_id
    rows = db.execute(
        text(
            f"""
            SELECT DISTINCT ON (d."dayNumber")
                   s."id" as submission_id, d."dayNumber", s."status", s."dueAt", s."reviewComment", s."reviewedAt",
                   s."aiIntegrityRiskScore"
            FROM "HomeworkSubmission" s
            JOIN "HomeworkTemplate" h ON h."id" = s."templateId"
            JOIN "CurriculumDay" d ON d."id" = h."curriculumDayId"
            WHERE s."userId" = :user_id
              AND {track_sql}
              AND {flow_sql}
            ORDER BY d."dayNumber" ASC, s."updatedAt" DESC, s."createdAt" DESC
            """
        ),
        params,
    ).mappings().all()
    return [
        {
            "submissionId": row["submission_id"],
            "dayNumber": row["dayNumber"],
            "status": row["status"],
            "dueAt": row["dueAt"].isoformat(),
            "reviewComment": row["reviewComment"],
            "reviewedAt": row["reviewedAt"].isoformat() if row["reviewedAt"] else None,
            "aiIntegrityRiskScore": row["aiIntegrityRiskScore"],
        }
        for row in rows
    ]


@router.get("/mine")
def mine(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return build_homework_mine_payload(db, user)


@router.get("/curator/pending")
def pending(
    _: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text(
            """
            SELECT s."id" as submission_id, s."userId", d."dayNumber", s."answerText", s."dueAt",
                   s."reflectionText", s."aiUsageDisclosure", s."aiIntegrityRiskScore", s."status" as submission_status,
                   h."instructionRu", h."instructionEn", h."sampleRu", h."sampleEn", h."minLength",
                   u."language" as student_language
            FROM "HomeworkSubmission" s
            JOIN "HomeworkTemplate" h ON h."id" = s."templateId"
            JOIN "CurriculumDay" d ON d."id" = h."curriculumDayId"
            JOIN "User" u ON u."id" = s."userId"
            WHERE s."status" IN ('pending_review', 'overdue')
              AND s."reviewedAt" IS NULL
            ORDER BY s."createdAt" ASC
            """
        )
    ).mappings().all()

    submission_ids = [r["submission_id"] for r in rows]
    attachments_map: dict = {}
    if submission_ids:
        att_rows = db.execute(
            text(
                """
                SELECT "submissionId", "fileUrl", "fileName", "fileSize", "mimeType"
                FROM "HomeworkAttachment"
                WHERE "submissionId" = ANY(:ids)
                ORDER BY "createdAt" ASC
                """
            ),
            {"ids": submission_ids},
        ).mappings().all()
        for att in att_rows:
            attachments_map.setdefault(att["submissionId"], []).append(
                {
                    "url": att["fileUrl"],
                    "fileName": att["fileName"],
                    "fileSize": att["fileSize"],
                    "mimeType": att["mimeType"],
                }
            )

    return [
        {
            "submissionId": row["submission_id"],
            "userId": row["userId"],
            "dayNumber": row["dayNumber"],
            "answerText": row["answerText"],
            "reflectionText": row["reflectionText"],
            "aiUsageDisclosure": row["aiUsageDisclosure"],
            "dueAt": row["dueAt"].isoformat() if row["dueAt"] else None,
            "aiIntegrityRiskScore": row["aiIntegrityRiskScore"],
            "submissionStatus": row["submission_status"],
            "attachments": attachments_map.get(row["submission_id"], []),
            "instructionRu": row["instructionRu"] or "",
            "instructionEn": row["instructionEn"] or "",
            "sampleRu": row["sampleRu"] or "",
            "sampleEn": row["sampleEn"] or "",
            "minLength": int(row["minLength"] or 0),
            "studentLanguage": _normalize_ui_language(row["student_language"]),
        }
        for row in rows
    ]


@router.get("/curator/all")
def all_submissions(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500, alias="pageSize"),
    status: Optional[str] = Query(default=None),
    _: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    where_parts = []
    q_params: dict = {"limit": page_size, "offset": (page - 1) * page_size}
    if status:
        where_parts.append('s."status" = :status')
        q_params["status"] = status
    where_sql = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    rows = db.execute(
        text(
            f"""
            SELECT s."id" as submission_id, s."userId", d."dayNumber", s."answerText", s."dueAt",
                   s."reflectionText", s."aiUsageDisclosure", s."aiIntegrityRiskScore",
                   s."status" as submission_status,
                   s."reviewComment", s."reviewedAt", s."reviewedById",
                   s."createdAt",
                   h."instructionRu", h."instructionEn", h."sampleRu", h."sampleEn", h."minLength",
                   u."language" as student_language,
                   ru."firstName" as reviewer_first, ru."lastName" as reviewer_last
            FROM "HomeworkSubmission" s
            JOIN "HomeworkTemplate" h ON h."id" = s."templateId"
            JOIN "CurriculumDay" d ON d."id" = h."curriculumDayId"
            JOIN "User" u ON u."id" = s."userId"
            LEFT JOIN "User" ru ON ru."id" = s."reviewedById"
            {where_sql}
            ORDER BY d."dayNumber" ASC, s."createdAt" ASC
            LIMIT :limit OFFSET :offset
            """
        ),
        q_params,
    ).mappings().all()

    count_params = {k: v for k, v in q_params.items() if k not in ("limit", "offset")}
    total = db.execute(
        text(f'SELECT COUNT(*) FROM "HomeworkSubmission" s {where_sql}'),
        count_params,
    ).scalar() or 0

    submission_ids = [r["submission_id"] for r in rows]
    attachments_map: dict = {}
    if submission_ids:
        att_rows = db.execute(
            text(
                """
                SELECT "submissionId", "fileUrl", "fileName", "fileSize", "mimeType"
                FROM "HomeworkAttachment"
                WHERE "submissionId" = ANY(:ids)
                ORDER BY "createdAt" ASC
                """
            ),
            {"ids": submission_ids},
        ).mappings().all()
        for att in att_rows:
            attachments_map.setdefault(att["submissionId"], []).append(
                {
                    "url": att["fileUrl"],
                    "fileName": att["fileName"],
                    "fileSize": att["fileSize"],
                    "mimeType": att["mimeType"],
                }
            )

    items = [
        {
            "submissionId": row["submission_id"],
            "userId": row["userId"],
            "dayNumber": row["dayNumber"],
            "answerText": row["answerText"],
            "reflectionText": row["reflectionText"],
            "aiUsageDisclosure": row["aiUsageDisclosure"],
            "dueAt": row["dueAt"].isoformat() if row["dueAt"] else None,
            "createdAt": row["createdAt"].isoformat() if row["createdAt"] else None,
            "aiIntegrityRiskScore": row["aiIntegrityRiskScore"],
            "submissionStatus": row["submission_status"],
            "reviewComment": row["reviewComment"],
            "reviewedAt": row["reviewedAt"].isoformat() if row["reviewedAt"] else None,
            "reviewerName": (
                f"{row['reviewer_first'] or ''} {row['reviewer_last'] or ''}".strip()
                or None
            ),
            "attachments": attachments_map.get(row["submission_id"], []),
            "instructionRu": row["instructionRu"] or "",
            "instructionEn": row["instructionEn"] or "",
            "sampleRu": row["sampleRu"] or "",
            "sampleEn": row["sampleEn"] or "",
            "minLength": int(row["minLength"] or 0),
            "studentLanguage": _normalize_ui_language(row["student_language"]),
        }
        for row in rows
    ]
    return {"items": items, "total": total, "page": page, "pageSize": page_size}


@router.post("/curator/suggest-feedback", dependencies=[Depends(limit(10, 60))])
def curator_suggest_feedback(
    payload: CuratorSuggestFeedbackRequest,
    _: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    if not gemini_client.enabled:
        raise HTTPException(status_code=503, detail="AI feedback is not configured")

    row = db.execute(
        text(
            """
            SELECT s."id", s."userId", s."answerText", s."reflectionText", s."aiUsageDisclosure",
                   s."aiIntegrityRiskScore", s."status" as submission_status,
                   d."dayNumber", u."language" as student_language,
                   h."instructionRu", h."instructionEn", h."sampleRu", h."sampleEn", h."minLength"
            FROM "HomeworkSubmission" s
            JOIN "HomeworkTemplate" h ON h."id" = s."templateId"
            JOIN "CurriculumDay" d ON d."id" = h."curriculumDayId"
            JOIN "User" u ON u."id" = s."userId"
            WHERE s."id" = :id
            """
        ),
        {"id": payload.submissionId},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Submission not found")

    out_lang = (payload.outputLanguage or "").lower().strip()
    if out_lang not in {"ru", "en", ""}:
        raise HTTPException(status_code=422, detail="outputLanguage must be ru or en")
    student_lang = _normalize_ui_language(row["student_language"])
    effective_lang = out_lang if out_lang in {"ru", "en"} else student_lang

    is_ru = effective_lang == "ru"
    instruction = _pick_locale(row["instructionRu"], row["instructionEn"], is_ru)
    sample = _pick_locale(row["sampleRu"], row["sampleEn"], is_ru)

    hist_rows = db.execute(
        text(
            """
            SELECT d."dayNumber", s."status", s."reviewComment", s."answerText", s."reviewedAt"
            FROM "HomeworkSubmission" s
            JOIN "HomeworkTemplate" h ON h."id" = s."templateId"
            JOIN "CurriculumDay" d ON d."id" = h."curriculumDayId"
            WHERE s."userId" = :user_id
              AND s."id" != :current_id
              AND s."reviewedAt" IS NOT NULL
            ORDER BY s."reviewedAt" DESC
            LIMIT 8
            """
        ),
        {"user_id": row["userId"], "current_id": row["id"]},
    ).mappings().all()

    history_lines: list[str] = []
    for hr in hist_rows:
        cmt = (hr["reviewComment"] or "").strip().replace("\n", " ")
        if len(cmt) > 220:
            cmt = cmt[:219].rstrip() + "…"
        ans = _truncate_for_prompt(hr["answerText"] or "", 320)
        history_lines.append(
            f"Day {hr['dayNumber']}: status={hr['status']}; answer_excerpt={ans!r}; curator_comment={cmt!r}"
        )

    answer_text = _truncate_for_prompt(row["answerText"] or "", 12000)
    reflection = _truncate_for_prompt(row["reflectionText"] or "", 4000)
    disclosure = _truncate_for_prompt(row["aiUsageDisclosure"] or "", 2000)

    prompt = _build_curator_feedback_prompt(
        output_language=effective_lang,
        day_number=int(row["dayNumber"]),
        instruction=instruction,
        sample=sample,
        min_length=int(row["minLength"] or 0),
        answer_text=answer_text,
        reflection_text=reflection,
        ai_usage_disclosure=disclosure,
        ai_risk=row["aiIntegrityRiskScore"],
        submission_status=str(row["submission_status"]),
        history_lines=history_lines,
    )
    try:
        ai_result = gemini_client.generate_curator_feedback_json(prompt=prompt)
    except GeminiServiceError as exc:
        logger.warning("curator suggest-feedback failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail="AI feedback is temporarily unavailable") from exc

    feedback = str(
        ai_result.get("feedback")
        or ai_result.get("message")
        or ai_result.get("comment")
        or ""
    ).strip()
    if not feedback:
        logger.warning("curator suggest-feedback: empty feedback keys in %s", list(ai_result.keys()))
        raise HTTPException(status_code=502, detail="AI returned empty feedback")

    return {"feedback": feedback, "outputLanguage": effective_lang}


@router.post("/curator/review")
def review(
    payload: ReviewHomeworkRequest,
    reviewer: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    if payload.verdict not in {"approved", "rejected"}:
        raise HTTPException(status_code=422, detail="Invalid verdict")
    sub = db.execute(
        text(
            """
            SELECT s."id", s."userId", s."dueAt", u."language", d."dayNumber"
            FROM "HomeworkSubmission" s
            JOIN "User" u ON u."id" = s."userId"
            JOIN "HomeworkTemplate" h ON h."id" = s."templateId"
            JOIN "CurriculumDay" d ON d."id" = h."curriculumDayId"
            WHERE s."id" = :id
            """
        ),
        {"id": payload.submissionId},
    ).mappings().first()
    if not sub:
        raise HTTPException(status_code=400, detail="Submission not found")

    now = datetime.now(timezone.utc)
    # Keep curator verdict (approved / rejected). Lateness is already reflected in dueAt vs submit time;
    # forcing "overdue" here hid approvals from students and broke the review outcome.
    effective_status = payload.verdict

    db.execute(
        text(
            """
            UPDATE "HomeworkSubmission"
            SET "status" = :status,
                "reviewComment" = :comment,
                "reviewedAt" = :reviewed_at,
                "reviewedById" = :reviewed_by,
                "updatedAt" = :updated_at
            WHERE "id" = :id
            """
        ),
        {
            "status": effective_status,
            "comment": payload.comment,
            "reviewed_at": now,
            "reviewed_by": reviewer.user_id,
            "updated_at": now,
            "id": payload.submissionId,
        },
    )
    event_type = "homework_approved" if effective_status == "approved" else "homework_rejected"
    emit_system_message(db, user_id=sub["userId"], event_type=event_type, meta={"dayNumber": sub["dayNumber"]})
    db.commit()
    return {"success": True, "status": effective_status}
