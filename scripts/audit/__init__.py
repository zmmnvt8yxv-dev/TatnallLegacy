"""
Audit System for Tatnall Legacy Data Pipeline

Provides comprehensive data quality reporting:
- ID match coverage by season/source
- Unresolved player references
- Stats anomalies detection
- Cross-source consistency checks
- Data freshness indicators
"""

from scripts.audit.full_audit import (
    DataAuditor,
    AuditReport,
    run_full_audit,
)

__all__ = [
    "DataAuditor",
    "AuditReport",
    "run_full_audit",
]
