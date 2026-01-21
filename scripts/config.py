"""
Configuration loader for API keys and settings.

Supports loading from:
1. Environment variables (.env.local or codespace secrets)
2. JSON config file (config/api_keys.json)

Environment Variable Aliases (checked in order):
- NFL API: SPORTRADAR_NFL_API_KEY, NFL_API, SPORTS_RADAR_API
- Odds API: SPORTRADAR_ODDS_API_KEY, ODDS_COMPARISON_REGULAR_API

Usage:
    from config import get_sportradar_nfl_key, get_sportradar_odds_key, get_config

    # Get individual keys
    nfl_key = get_sportradar_nfl_key()
    odds_key = get_sportradar_odds_key()

    # Get full config
    config = get_config()
"""

import os
import json
from pathlib import Path
from functools import lru_cache


# Project root directory
PROJECT_ROOT = Path(__file__).parent.parent


def _load_env_file():
    """Load environment variables from .env.local if it exists."""
    env_file = PROJECT_ROOT / ".env.local"
    if env_file.exists():
        with open(env_file, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip()
                    # Remove quotes if present
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    os.environ.setdefault(key, value)


def _load_json_config():
    """Load configuration from JSON file."""
    config_file = PROJECT_ROOT / "config" / "api_keys.json"
    if config_file.exists():
        with open(config_file, "r") as f:
            return json.load(f)
    return {}


# Load env file on module import
_load_env_file()


# Environment variable aliases for different deployment environments
# Order matters: first valid value found wins
ENV_VAR_ALIASES = {
    "nfl_api_key": [
        "SPORTRADAR_NFL_API_KEY",  # Primary (canonical name)
        "NFL_API",                  # Codespace alias
        "SPORTS_RADAR_API",         # Generic fallback
    ],
    "odds_api_key": [
        "SPORTRADAR_ODDS_API_KEY",      # Primary (canonical name)
        "ODDS_COMPARISON_REGULAR_API",  # Codespace alias
    ],
}


def _get_env_with_aliases(alias_key):
    """
    Get an environment variable value, checking multiple aliases.
    Returns (value, var_name) tuple or (None, None) if not found.

    This allows the same code to work with different environment variable
    naming conventions (e.g., codespace secrets vs local .env files).
    """
    aliases = ENV_VAR_ALIASES.get(alias_key, [])
    for var_name in aliases:
        value = os.getenv(var_name)
        if value and not _is_placeholder(value):
            return value, var_name
    return None, None


def _is_placeholder(value):
    """Check if a value is a placeholder that should be ignored."""
    if not value:
        return True
    value_lower = value.lower()
    return (
        value_lower.startswith("your_") or
        value_lower.startswith("your-") or
        "your_api_key" in value_lower or
        "your_key" in value_lower or
        value == "YOUR_NFL_API_KEY_HERE" or
        value == "YOUR_ODDS_API_KEY_HERE" or
        value == "changeme" or
        value == "placeholder"
    )


@lru_cache(maxsize=1)
def get_config():
    """
    Get the full configuration dictionary.
    Merges JSON config with environment variables (env vars take precedence).
    Supports multiple environment variable aliases for flexibility.
    """
    config = _load_json_config()

    # Get API keys using alias system
    nfl_key, _ = _get_env_with_aliases("nfl_api_key")
    odds_key, _ = _get_env_with_aliases("odds_api_key")

    # Override with environment variables if set
    env_overrides = {
        "sportradar.nfl.api_key": nfl_key,
        "sportradar.nfl.access_level": os.getenv("SPORTRADAR_NFL_ACCESS_LEVEL"),
        "sportradar.odds.api_key": odds_key,
        "sportradar.odds.access_level": os.getenv("SPORTRADAR_ODDS_ACCESS_LEVEL"),
        "existing_integrations.sleeper.league_id": os.getenv("SLEEPER_LEAGUE_ID"),
        "existing_integrations.espn.s2_cookie": os.getenv("ESPN_S2"),
        "existing_integrations.espn.swid_cookie": os.getenv("ESPN_SWID"),
    }

    for key_path, value in env_overrides.items():
        if value and not _is_placeholder(value):
            parts = key_path.split(".")
            obj = config
            for part in parts[:-1]:
                obj = obj.setdefault(part, {})
            obj[parts[-1]] = value

    return config


def get_sportradar_nfl_key():
    """
    Get the Sportradar NFL API key.
    Checks multiple environment variable names for flexibility:
    - SPORTRADAR_NFL_API_KEY (primary)
    - NFL_API (codespace alias)
    - SPORTS_RADAR_API (generic fallback)
    """
    # First try environment variables (with aliases)
    key, _ = _get_env_with_aliases("nfl_api_key")
    if key:
        return key

    # Fall back to JSON config
    config = _load_json_config()  # Use direct load to avoid circular dependency
    key = config.get("sportradar", {}).get("nfl", {}).get("api_key")
    if key and not _is_placeholder(key):
        return key

    return None


def get_sportradar_odds_key():
    """
    Get the Sportradar Odds Comparison API key.
    Checks multiple environment variable names for flexibility:
    - SPORTRADAR_ODDS_API_KEY (primary)
    - ODDS_COMPARISON_REGULAR_API (codespace alias)
    """
    # First try environment variables (with aliases)
    key, _ = _get_env_with_aliases("odds_api_key")
    if key:
        return key

    # Fall back to JSON config
    config = _load_json_config()  # Use direct load to avoid circular dependency
    key = config.get("sportradar", {}).get("odds", {}).get("api_key")
    if key and not _is_placeholder(key):
        return key

    return None


def get_sportradar_nfl_config():
    """Get full Sportradar NFL configuration."""
    config = get_config()
    nfl_config = config.get("sportradar", {}).get("nfl", {}).copy()

    # Ensure API key is from env if available
    env_key = get_sportradar_nfl_key()
    if env_key:
        nfl_config["api_key"] = env_key

    return nfl_config


def get_sportradar_odds_config():
    """Get full Sportradar Odds configuration."""
    config = get_config()
    odds_config = config.get("sportradar", {}).get("odds", {}).copy()

    # Ensure API key is from env if available
    env_key = get_sportradar_odds_key()
    if env_key:
        odds_config["api_key"] = env_key

    return odds_config


def validate_config():
    """
    Validate that required API keys are configured.
    Returns a list of issues (empty if all is well).
    """
    issues = []

    nfl_key, nfl_var = _get_env_with_aliases("nfl_api_key")
    if not nfl_key:
        # Fall back to JSON
        json_config = _load_json_config()
        nfl_key = json_config.get("sportradar", {}).get("nfl", {}).get("api_key")
        if not nfl_key or _is_placeholder(nfl_key):
            issues.append(
                "NFL API key not configured. Set one of: "
                + ", ".join(ENV_VAR_ALIASES["nfl_api_key"])
            )

    odds_key, odds_var = _get_env_with_aliases("odds_api_key")
    if not odds_key:
        json_config = _load_json_config()
        odds_key = json_config.get("sportradar", {}).get("odds", {}).get("api_key")
        if not odds_key or _is_placeholder(odds_key):
            issues.append(
                "Odds API key not configured (optional). Set one of: "
                + ", ".join(ENV_VAR_ALIASES["odds_api_key"])
            )

    return issues


def get_detected_env_vars():
    """
    Get information about which environment variables were detected.
    Useful for debugging configuration issues.
    """
    detected = {}

    nfl_key, nfl_var = _get_env_with_aliases("nfl_api_key")
    if nfl_key:
        detected["nfl_api"] = {
            "var_name": nfl_var,
            "configured": True,
            "key_preview": f"{'*' * 8}...{nfl_key[-4:]}" if len(nfl_key) > 4 else "****"
        }
    else:
        detected["nfl_api"] = {"var_name": None, "configured": False}

    odds_key, odds_var = _get_env_with_aliases("odds_api_key")
    if odds_key:
        detected["odds_api"] = {
            "var_name": odds_var,
            "configured": True,
            "key_preview": f"{'*' * 8}...{odds_key[-4:]}" if len(odds_key) > 4 else "****"
        }
    else:
        detected["odds_api"] = {"var_name": None, "configured": False}

    return detected


if __name__ == "__main__":
    # Test the configuration
    print("=== Configuration Test ===\n")

    # Show supported variable aliases
    print("Supported environment variable names:")
    print("  NFL API:")
    for var in ENV_VAR_ALIASES["nfl_api_key"]:
        print(f"    - {var}")
    print("  Odds API:")
    for var in ENV_VAR_ALIASES["odds_api_key"]:
        print(f"    - {var}")
    print()

    # Show which variables were detected
    detected = get_detected_env_vars()
    print("Detected configuration:")
    for api_name, info in detected.items():
        if info["configured"]:
            print(f"  {api_name}: ✓ Found via {info['var_name']} ({info['key_preview']})")
        else:
            print(f"  {api_name}: ✗ Not configured")
    print()

    # Show any issues
    issues = validate_config()
    if issues:
        print("Configuration issues:")
        for issue in issues:
            print(f"  - {issue}")
        print()
    else:
        print("All required API keys are configured.\n")

    # Show full config details
    print("NFL Config:")
    nfl_config = get_sportradar_nfl_config()
    for key, value in nfl_config.items():
        if key == "api_key" and value:
            print(f"  {key}: {'*' * 8}...{value[-4:] if len(value) > 4 else '****'}")
        elif not key.startswith("_"):
            print(f"  {key}: {value}")

    print("\nOdds Config:")
    odds_config = get_sportradar_odds_config()
    for key, value in odds_config.items():
        if key == "api_key" and value:
            print(f"  {key}: {'*' * 8}...{value[-4:] if len(value) > 4 else '****'}")
        elif not key.startswith("_"):
            print(f"  {key}: {value}")
