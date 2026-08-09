# Historical corrections

Corrections are version-controlled league rulings applied after raw provider data is normalized and before analytics or public files are derived.

Raw files under `data/` and `data_raw/` are evidence and must not be edited to make a correction. A correction must instead be added to a YAML file in this directory with enough information to audit why the canonical result differs from the provider result.

## Record contract

Every correction contains:

- `correction_id`: permanent unique identifier;
- `type`: correction category;
- `season`: affected league season;
- `target.dataset`: normalized table name;
- `target.match`: exact fields that must identify one normalized row;
- `field`: field to replace; dot-separated nested fields are supported;
- `old_value`: expected provider/normalized value before correction;
- `new_value`: league-accepted canonical value;
- `reason`: human-readable explanation;
- `source_note`: provenance for the ruling;
- `entered_at`: ISO date or timestamp.

The correction engine intentionally requires an exact single-row target and checks `old_value`. It fails on missing, ambiguous, or drifted records instead of guessing. Applying the same corrections again is idempotent.

## Pipeline order

```text
ingest raw evidence
  -> normalize provider records
  -> apply corrections
  -> validate canonical records
  -> derive analytics
  -> publish browser JSON
```

Load and apply corrections with:

```python
from scripts.normalize.corrections import apply_corrections, load_corrections

corrections = load_corrections("data/corrections/season_results.yml")
corrected = apply_corrections(normalized, corrections)
```

PyYAML is required to load correction files.

## Integration status

The correction contract, 2022 ruling, engine, and regression fixture are active in
CI. The current Pages builder still reads `data/manual_league_history.json` for
compatibility. A later normalization phase will invoke this correction layer before
generating all public season, bracket, and seed analytics.
