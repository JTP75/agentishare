"""Configuration module for loading and accessing .props files."""

from .constants import Keys, Sections
from .loader import ConfigLoader

__all__ = ["ConfigLoader", "Sections", "Keys"]
