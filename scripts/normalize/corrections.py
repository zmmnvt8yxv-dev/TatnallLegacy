"""Load and apply audited corrections to normalized league tables."""

from __future__ import annotations

from collections.abc import Mapping, MutableMapping, Sequence
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


class CorrectionError(ValueError):
    """Base error for invalid or unsafe correction application."""


class CorrectionValidationError(CorrectionError):
    """Raised when a correction document does not satisfy the contract."""


class CorrectionTargetError(CorrectionError):
    """Raised when a correction does not resolve exactly one target record."""


class CorrectionConflictError(CorrectionError):
    """Raised when canonical input has drifted from a correction's old value."""


@dataclass(frozen=True)
class AppliedCorrection:
    correction_id: str
    dataset: str
    match: Mapping[str, Any]
    field: str
    previous_value: Any
    new_value: Any
    status: str


@dataclass(frozen=True)
class CorrectionApplication:
    data: dict[str, Any]
    applied: tuple[AppliedCorrection, ...]


_MISSING = object()
_REQUIRED_FIELDS = {
    "correction_id",
    "type",
    "season",
    "target",
    "field",
    "old_value",
    "new_value",
    "reason",
    "source_note",
    "entered_at",
}


def load_corrections(path: str | Path) -> list[dict[str, Any]]:
    """Load and validate one YAML correction document."""
    source = Path(path)
    if not source.exists():
        raise CorrectionValidationError(f"Correction file does not exist: {source}")

    with source.open("r", encoding="utf-8") as handle:
        document = yaml.safe_load(handle)

    if not isinstance(document, Mapping):
        raise CorrectionValidationError(f"Correction document must be a mapping: {source}")
    if not document.get("schema_version"):
        raise CorrectionValidationError(f"Correction document is missing schema_version: {source}")

    corrections = document.get("corrections")
    if not isinstance(corrections, list):
        raise CorrectionValidationError(f"corrections must be a list: {source}")

    seen_ids: set[str] = set()
    validated: list[dict[str, Any]] = []
    for index, correction in enumerate(corrections):
        _validate_correction(correction, source=source, index=index)
        correction_id = str(correction["correction_id"])
        if correction_id in seen_ids:
            raise CorrectionValidationError(
                f"Duplicate correction_id {correction_id!r} in {source}"
            )
        seen_ids.add(correction_id)
        validated.append(dict(correction))
    return validated


def apply_corrections(
    normalized: Mapping[str, Any],
    corrections: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Return a corrected deep copy of normalized table-oriented data."""
    return apply_corrections_with_report(normalized, corrections).data


def apply_corrections_with_report(
    normalized: Mapping[str, Any],
    corrections: Sequence[Mapping[str, Any]],
) -> CorrectionApplication:
    """Apply corrections and return corrected data plus an audit report."""
    if not isinstance(normalized, Mapping):
        raise CorrectionValidationError("normalized data must be a mapping of datasets")

    data = deepcopy(dict(normalized))
    applied: list[AppliedCorrection] = []
    seen_ids: set[str] = set()

    for index, correction in enumerate(corrections):
        _validate_correction(correction, source=None, index=index)
        correction_id = str(correction["correction_id"])
        if correction_id in seen_ids:
            raise CorrectionValidationError(
                f"Duplicate correction_id {correction_id!r} in correction sequence"
            )
        seen_ids.add(correction_id)

        target = correction["target"]
        dataset = str(target["dataset"])
        match = dict(target["match"])
        records = data.get(dataset, _MISSING)
        if records is _MISSING:
            raise CorrectionTargetError(
                f"{correction_id}: dataset {dataset!r} is missing"
            )
        if not isinstance(records, list):
            raise CorrectionTargetError(
                f"{correction_id}: dataset {dataset!r} must be a list of records"
            )

        matches = [
            record
            for record in records
            if isinstance(record, MutableMapping) and _record_matches(record, match)
        ]
        if len(matches) != 1:
            raise CorrectionTargetError(
                f"{correction_id}: expected exactly one {dataset!r} record matching "
                f"{match!r}, found {len(matches)}"
            )

        record = matches[0]
        field = str(correction["field"])
        current_value = _get_field(record, field)
        new_value = deepcopy(correction["new_value"])

        if current_value is not _MISSING and current_value == new_value:
            status = "already_applied"
            previous_value = deepcopy(current_value)
        else:
            if "old_value" in correction:
                expected = correction["old_value"]
                if current_value is _MISSING or current_value != expected:
                    rendered = "<missing>" if current_value is _MISSING else repr(current_value)
                    raise CorrectionConflictError(
                        f"{correction_id}: {dataset}.{field} expected {expected!r}, "
                        f"found {rendered}"
                    )
            previous_value = None if current_value is _MISSING else deepcopy(current_value)
            _set_field(record, field, new_value)
            status = "applied"

        applied.append(
            AppliedCorrection(
                correction_id=correction_id,
                dataset=dataset,
                match=match,
                field=field,
                previous_value=previous_value,
                new_value=new_value,
                status=status,
            )
        )

    return CorrectionApplication(data=data, applied=tuple(applied))


def _validate_correction(
    correction: Mapping[str, Any] | Any,
    *,
    source: Path | None,
    index: int,
) -> None:
    location = f"{source}: correction {index}" if source else f"correction {index}"
    if not isinstance(correction, Mapping):
        raise CorrectionValidationError(f"{location} must be a mapping")

    missing = sorted(_REQUIRED_FIELDS.difference(correction.keys()))
    if missing:
        raise CorrectionValidationError(f"{location} is missing fields: {', '.join(missing)}")
    if not str(correction.get("correction_id", "")).strip():
        raise CorrectionValidationError(f"{location} has an empty correction_id")
    if not isinstance(correction.get("season"), int):
        raise CorrectionValidationError(f"{location} season must be an integer")
    if not str(correction.get("field", "")).strip():
        raise CorrectionValidationError(f"{location} has an empty field")
    for key in ("type", "reason", "source_note", "entered_at"):
        if not str(correction.get(key, "")).strip():
            raise CorrectionValidationError(f"{location} has an empty {key}")

    target = correction.get("target")
    if not isinstance(target, Mapping):
        raise CorrectionValidationError(f"{location} target must be a mapping")
    if not str(target.get("dataset", "")).strip():
        raise CorrectionValidationError(f"{location} target.dataset is required")
    match = target.get("match")
    if not isinstance(match, Mapping) or not match:
        raise CorrectionValidationError(f"{location} target.match must be a non-empty mapping")
    for field in match:
        if not isinstance(field, str) or not field.strip():
            raise CorrectionValidationError(
                f"{location} target.match fields must be non-empty strings"
            )
    if "season" in match and match["season"] != correction["season"]:
        raise CorrectionValidationError(
            f"{location} season does not match target.match.season"
        )


def _record_matches(record: Mapping[str, Any], match: Mapping[str, Any]) -> bool:
    return all(_get_field(record, field) == value for field, value in match.items())


def _split_field(field: str) -> list[str]:
    parts = [part for part in field.split(".") if part]
    if not parts or len(parts) != len(field.split(".")):
        raise CorrectionValidationError(f"Invalid field path: {field!r}")
    return parts


def _get_field(record: Mapping[str, Any], field: str) -> Any:
    current: Any = record
    for part in _split_field(field):
        if not isinstance(current, Mapping) or part not in current:
            return _MISSING
        current = current[part]
    return current


def _set_field(record: MutableMapping[str, Any], field: str, value: Any) -> None:
    parts = _split_field(field)
    current: MutableMapping[str, Any] = record
    for part in parts[:-1]:
        child = current.get(part)
        if child is None:
            child = {}
            current[part] = child
        if not isinstance(child, MutableMapping):
            raise CorrectionConflictError(
                f"Cannot set {field!r}: {part!r} is not a mapping"
            )
        current = child
    current[parts[-1]] = value
