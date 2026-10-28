"""Ensure ``app`` package resolves when pytest is run from repo root.

Outside the backend container ``/app/uploads`` usually does not exist (and cannot be
created), so the static uploads mount is pointed at a temporary directory for tests.
"""

import atexit
import os
import shutil
import sys
import tempfile
from pathlib import Path

_backend_root = Path(__file__).resolve().parents[1]
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

if not Path("/app/uploads").is_dir() and "UPLOADS_ROOT" not in os.environ:
    _uploads_tmp = tempfile.mkdtemp(prefix="expovision-test-uploads-")
    os.environ["UPLOADS_ROOT"] = _uploads_tmp
    atexit.register(shutil.rmtree, _uploads_tmp, ignore_errors=True)
