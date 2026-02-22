# Backend Template

## Critical Rules

**Never hard-code configuration values in source code.** All configurable values (hosts, ports, credentials, feature flags, etc.) must be defined in `config/*.props` files and accessed via `ConfigLoader`.

## Project Structure

- `config/` - Configuration `.props` files (base + environment overrides)
- `src/config/` - Python config module (loader, constants)
- `main.py` - Application entry point

## Configuration Usage

```python
from src.config import ConfigLoader, Sections, Keys

config = ConfigLoader()  # or ConfigLoader(env="dev")
value = config.get(Sections.SECTION, Keys.KEY)
```

When adding new configuration:
1. Add the value to `config/config.props`
2. Add the section name to `Sections` class in `src/config/constants.py`
3. Add the key name to `Keys` class in `src/config/constants.py`
4. Access via `ConfigLoader` in your code

## Commands

- Run: `python main.py`
