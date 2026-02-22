# Python Backend Template

A starter template designed to help Claude Code quickly bootstrap backend projects with a structured configuration system.

## Overview

This template provides:

- **Config directory** with `.props` files for environment-specific settings
- **Python configuration module** for reading and accessing configuration values
- **Constants module** with predefined section and key names for type-safe config access

## Project Structure

```
backend-template/
├── config/
│   ├── config.props          # Default/base configuration
│   ├── config.dev.props      # Development overrides
│   └── config.prod.props     # Production overrides
├── src/
│   └── config/
│       ├── __init__.py
│       ├── loader.py         # Configuration loading and parsing
│       └── constants.py      # Section and key name constants
├── .gitignore
└── README.md
```

## Configuration Format

Configuration files use a simple `.props` format with sections and key-value pairs:

```ini
[database]
host=localhost
port=5432

[server]
host=0.0.0.0
port=8080
```

## Usage

### Loading Configuration

```python
from src.config import ConfigLoader

# Load default config
config = ConfigLoader()

# Load with environment override
config = ConfigLoader(env="dev")

# Access values
db_host = config.get("database", "host")
server_port = config.get_int("server", "port")
```

### Using Constants

```python
from src.config.constants import Sections, Keys

config = ConfigLoader()

# Type-safe access using constants
db_host = config.get(Sections.DATABASE, Keys.HOST)
server_port = config.get_int(Sections.SERVER, Keys.PORT)
```

## Configuration Precedence

When an environment is specified, values are loaded in this order:

1. `config.props` (base configuration)
2. `config.{env}.props` (environment-specific overrides)

Later values override earlier ones.

## Getting Started

1. Copy this template to your project
2. Edit `config/config.props` with your base settings
3. Create environment-specific overrides as needed
4. Import and use `ConfigLoader` in your application

## License

MIT
