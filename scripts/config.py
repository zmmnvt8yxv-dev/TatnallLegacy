"""
Configuration loader for API keys and settings.

Supports loading from:
1. Environment variables (.env.local)
2. JSON config file (config/api_keys.json)

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


@lru_cache(maxsize=1)
def get_config():
    """
    Get the full configuration dictionary.
    Merges JSON config with environment variables (env vars take precedence).
    """
    config = _load_json_config()

    # Override with environment variables if set
    env_overrides = {
        "sportradar.nfl.api_key": os.getenv("SPORTRADAR_NFL_API_KEY"),
        "sportradar.nfl.access_level": os.getenv("SPORTRADAR_NFL_ACCESS_LEVEL"),
        "sportradar.odds.api_key": os.getenv("SPORTRADAR_ODDS_API_KEY"),
        "sportradar.odds.access_level": os.getenv("SPORTRADAR_ODDS_ACCESS_LEVEL"),
        "existing_integrations.sleeper.league_id": os.getenv("SLEEPER_LEAGUE_ID"),
        "existing_integrations.espn.s2_cookie": os.getenv("ESPN_S2"),
        "existing_integrations.espn.swid_cookie": os.getenv("ESPN_SWID"),
    }

    for key_path, value in env_overrides.items():
        if value and not value.startswith("your_") and value != "YOUR_NFL_API_KEY_HERE":
            parts = key_path.split(".")
            obj = config
            for part in parts[:-1]:
                obj = obj.setdefault(part, {})
            obj[parts[-1]] = value

    return config


def get_sportradar_nfl_key():
    """Get the Sportradar NFL API key."""
    # First try environment variable
    key = os.getenv("SPORTRADAR_NFL_API_KEY")
    if key and not key.startswith("your_"):
        return key

    # Fall back to JSON config
    config = get_config()
    key = config.get("sportradar", {}).get("nfl", {}).get("api_key")
    if key and key != "YOUR_NFL_API_KEY_HERE":
        return key

    return None


def get_sportradar_odds_key():
    """Get the Sportradar Odds Comparison API key."""
    # First try environment variable
    key = os.getenv("SPORTRADAR_ODDS_API_KEY")
    if key and not key.startswith("your_"):
        return key

    # Fall back to JSON config
    config = get_config()
    key = config.get("sportradar", {}).get("odds", {}).get("api_key")
    if key and key != "YOUR_ODDS_API_KEY_HERE":
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
    """Validate that required API keys are configured."""
    issues = []

    if not get_sportradar_nfl_key():
        issues.append("SPORTRADAR_NFL_API_KEY not configured")

    if not get_sportradar_odds_key():
        issues.append("SPORTRADAR_ODDS_API_KEY not configured (optional)")

    return issues


if __name__ == "__main__":
    # Test the configuration
    print("=== Configuration Test ===\n")

    issues = validate_config()
    if issues:
        print("Configuration issues:")
        for issue in issues:
            print(f"  - {issue}")
        print()

    print("NFL API Key configured:", "Yes" if get_sportradar_nfl_key() else "No")
    print("Odds API Key configured:", "Yes" if get_sportradar_odds_key() else "No")

    print("\nNFL Config:")
    nfl_config = get_sportradar_nfl_config()
    for key, value in nfl_config.items():
        if key == "api_key" and value:
            print(f"  {key}: {'*' * 8}...{value[-4:] if len(value) > 4 else '****'}")
        elif not key.startswith("_"):
            print(f"  {key}: {value}")
