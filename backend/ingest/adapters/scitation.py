"""SCitation adapter: needs SCITATION_API_URL and SCITATION_API_KEY. Makes no network calls yet."""
import os
from typing import Any, Dict, List

from .base import NotConfigured, SourceAdapter


class SCitationAdapter(SourceAdapter):
    name = "scitation"

    def __init__(self):
        self.base_url = os.environ.get("SCITATION_API_URL", "").strip()
        self.api_key = os.environ.get("SCITATION_API_KEY", "").strip()
        if not self.base_url or not self.api_key:
            raise NotConfigured("SCitation is not configured: set SCITATION_API_URL and SCITATION_API_KEY.")

    def fetch_judgment(self, ref: str) -> Dict[str, Any]:
        raise NotImplementedError("SCitation client is not implemented until the API contract is available.")

    def fetch_paragraphs(self, ref: str) -> List[Dict[str, Any]]:
        raise NotImplementedError("SCitation client is not implemented until the API contract is available.")

    def fetch_treatments(self, ref: str) -> List[Dict[str, Any]]:
        raise NotImplementedError("SCitation client is not implemented until the API contract is available.")
