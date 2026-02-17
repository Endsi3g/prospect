from __future__ import annotations

import os
from typing import Optional

from ..core.logging import get_logger
from .base import IntentProviderClient
from .bombora_client import BomboraIntentClient
from .mock_client import MockIntentProviderClient
from .sixsense_client import SixSenseIntentClient


logger = get_logger(__name__)


def create_intent_client(
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
) -> Optional[IntentProviderClient]:
    from ..admin.secrets_manager import secrets_manager
    selected = (provider or os.getenv("INTENT_PROVIDER", "mock")).strip().lower()

    if selected in {"none", "off", "disabled"}:
        return None

    if selected == "mock":
        return MockIntentProviderClient()

    api_key = api_key or secrets_manager.resolve_secret(None, "INTENT_PROVIDER_API_KEY")
    base_url = base_url or os.getenv("INTENT_PROVIDER_BASE_URL")
    if not api_key:
        logger.warning(
            "Intent provider API key missing. Falling back to mock provider.",
            extra={"provider": selected},
        )
        return MockIntentProviderClient()

    if selected == "bombora":
        return BomboraIntentClient(api_key=api_key, base_url=base_url)
    if selected in {"6sense", "sixsense"}:
        return SixSenseIntentClient(api_key=api_key, base_url=base_url)

    logger.warning(
        "Unknown intent provider requested. Falling back to mock provider.",
        extra={"provider": selected},
    )
    return MockIntentProviderClient()
