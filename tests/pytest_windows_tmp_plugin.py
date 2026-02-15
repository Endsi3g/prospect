from __future__ import annotations

import shutil
import uuid
from pathlib import Path

import pytest


@pytest.fixture
def tmp_path() -> Path:
    """
    Windows-safe tmp_path fixture used when pytest tmpdir plugin is disabled.
    This avoids cleanup crashes seen with Python 3.14 on locked environments.
    """
    root = Path("manual_test_runs_local") / "pytest_tmp" / uuid.uuid4().hex
    root.mkdir(parents=True, exist_ok=True)
    try:
        yield root
    finally:
        shutil.rmtree(root, ignore_errors=True)

