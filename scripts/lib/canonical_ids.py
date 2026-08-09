"""Deterministic canonical identifiers configured for Tatnall Legacy."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

import yaml


class CanonicalIdError(ValueError):
    """Raised when the canonical ID configuration is invalid."""


class CanonicalIds:
    """Generate UUIDv5 identifiers from the version-controlled key contract."""

    def __init__(self, league_config: str | Path):
        source = Path(league_config)
        with source.open("r", encoding="utf-8") as handle:
            config = yaml.safe_load(handle)

        identity = config.get("identity") if isinstance(config, dict) else None
        if not isinstance(identity, dict) or identity.get("strategy") != "uuid5":
            raise CanonicalIdError(f"Unsupported identity configuration: {source}")

        namespace_url = identity.get("namespace_url")
        configured_namespace = identity.get("namespace_uuid")
        keys = identity.get("keys")
        if not isinstance(namespace_url, str) or not isinstance(keys, dict):
            raise CanonicalIdError(f"Incomplete identity configuration: {source}")

        self.namespace = uuid5(NAMESPACE_URL, namespace_url)
        if configured_namespace and self.namespace != UUID(str(configured_namespace)):
            raise CanonicalIdError(
                f"Configured namespace_uuid does not match namespace_url: {source}"
            )
        self.keys = {str(name): str(template) for name, template in keys.items()}

    def make(self, entity: str, **values: Any) -> str:
        """Return the UUIDv5 for one configured entity key."""
        template = self.keys.get(entity)
        if not template:
            raise CanonicalIdError(f"No canonical key template configured for {entity!r}")
        try:
            key = template.format(**values)
        except KeyError as exc:
            raise CanonicalIdError(
                f"Missing value {exc.args[0]!r} for canonical {entity!r} key"
            ) from exc
        return str(uuid5(self.namespace, key))
