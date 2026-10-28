"""Contract for external source adapters. Adapters never invent data: unknown values are empty."""
from abc import ABC, abstractmethod
from typing import Any, Dict, List


class NotConfigured(RuntimeError):
    """Raised when an adapter has no credentials / endpoint configured."""


class SourceAdapter(ABC):
    name: str = "source"

    @abstractmethod
    def fetch_judgment(self, ref: str) -> Dict[str, Any]:
        """Judgment metadata for a source reference (citation or source id)."""

    @abstractmethod
    def fetch_paragraphs(self, ref: str) -> List[Dict[str, Any]]:
        """[{para_no, text, page}] for the judgment."""

    @abstractmethod
    def fetch_treatments(self, ref: str) -> List[Dict[str, Any]]:
        """[{citing_ref, cited_ref, treatment, para_no, source_ref}] for the judgment."""
