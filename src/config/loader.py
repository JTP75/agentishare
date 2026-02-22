"""Configuration loader for reading .props files."""

import os
from configparser import ConfigParser
from pathlib import Path


class ConfigLoader:
    """Loads and provides access to configuration values from .props files."""

    def __init__(self, env: str | None = None, config_dir: str | None = None):
        """
        Initialize the configuration loader.

        Args:
            env: Environment name (e.g., 'dev', 'prod'). If provided, loads
                 environment-specific overrides.
            config_dir: Path to config directory. Defaults to 'config' in project root.
        """
        self._parser = ConfigParser()

        if config_dir is None:
            config_dir = Path(__file__).parent.parent.parent / "config"
        else:
            config_dir = Path(config_dir)

        # Load base configuration
        base_config = config_dir / "config.props"
        if base_config.exists():
            self._parser.read(base_config)

        # Load environment-specific overrides
        if env:
            env_config = config_dir / f"config.{env}.props"
            if env_config.exists():
                self._parser.read(env_config)

    def get(self, section: str, key: str, fallback: str | None = None) -> str | None:
        """
        Get a configuration value as a string.

        Args:
            section: Configuration section name.
            key: Configuration key name.
            fallback: Default value if key is not found.

        Returns:
            The configuration value or fallback.
        """
        return self._parser.get(section, key, fallback=fallback)

    def get_int(self, section: str, key: str, fallback: int = 0) -> int:
        """
        Get a configuration value as an integer.

        Args:
            section: Configuration section name.
            key: Configuration key name.
            fallback: Default value if key is not found.

        Returns:
            The configuration value as an integer.
        """
        return self._parser.getint(section, key, fallback=fallback)

    def get_bool(self, section: str, key: str, fallback: bool = False) -> bool:
        """
        Get a configuration value as a boolean.

        Args:
            section: Configuration section name.
            key: Configuration key name.
            fallback: Default value if key is not found.

        Returns:
            The configuration value as a boolean.
        """
        return self._parser.getboolean(section, key, fallback=fallback)

    def get_float(self, section: str, key: str, fallback: float = 0.0) -> float:
        """
        Get a configuration value as a float.

        Args:
            section: Configuration section name.
            key: Configuration key name.
            fallback: Default value if key is not found.

        Returns:
            The configuration value as a float.
        """
        return self._parser.getfloat(section, key, fallback=fallback)

    def sections(self) -> list[str]:
        """Return a list of available sections."""
        return self._parser.sections()

    def has_section(self, section: str) -> bool:
        """Check if a section exists."""
        return self._parser.has_section(section)

    def has_option(self, section: str, key: str) -> bool:
        """Check if a key exists in a section."""
        return self._parser.has_option(section, key)
