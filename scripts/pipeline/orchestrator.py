#!/usr/bin/env python3
"""
Pipeline Orchestrator

Dependency-aware build system with:
- DAG of build steps
- Incremental builds (skip unchanged)
- Parallel execution where safe
- Progress reporting
- Rollback on failure

Usage:
    # Run full pipeline
    python orchestrator.py

    # Run specific steps
    python orchestrator.py --steps load_stats,calculate_metrics

    # Dry run (show what would run)
    python orchestrator.py --dry-run

    # Force rebuild (ignore cache)
    python orchestrator.py --force

    # Parallel execution
    python orchestrator.py --parallel --workers 4
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import shutil
import subprocess
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

import yaml

# Path setup
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Path constants
CONFIG_PATH = PROJECT_ROOT / "build.config.yaml"
BUILD_STATE_PATH = PROJECT_ROOT / ".build_state"
BACKUP_PATH = PROJECT_ROOT / ".build_backup"


class StepStatus(Enum):
    """Status of a build step."""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


@dataclass
class BuildStep:
    """A single step in the build pipeline."""
    name: str
    script: str
    depends_on: List[str] = field(default_factory=list)
    required: bool = False
    timeout: int = 600  # seconds
    args: List[str] = field(default_factory=list)

    # Runtime state
    status: StepStatus = StepStatus.PENDING
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_seconds: float = 0.0
    return_code: int = 0
    output: str = ""
    error: str = ""


@dataclass
class BuildResult:
    """Result of a full pipeline build."""
    build_id: str
    started_at: str
    completed_at: Optional[str] = None
    duration_seconds: float = 0.0
    status: str = "pending"

    # Step results
    total_steps: int = 0
    steps_succeeded: int = 0
    steps_failed: int = 0
    steps_skipped: int = 0

    # Detailed results
    step_results: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    # Errors
    errors: List[str] = field(default_factory=list)


@dataclass
class BuildState:
    """Persisted build state for incremental builds."""
    last_build_id: str = ""
    last_build_time: str = ""
    step_hashes: Dict[str, str] = field(default_factory=dict)
    file_hashes: Dict[str, str] = field(default_factory=dict)


class PipelineOrchestrator:
    """
    Orchestrates the data pipeline build process.

    Features:
    - Dependency-aware execution order (topological sort)
    - Incremental builds based on file hashes
    - Parallel execution of independent steps
    - Progress reporting
    - Automatic rollback on failure
    """

    def __init__(
        self,
        config_path: Path = CONFIG_PATH,
        state_path: Path = BUILD_STATE_PATH,
        backup_path: Path = BACKUP_PATH,
        dry_run: bool = False,
        force: bool = False,
        parallel: bool = False,
        max_workers: int = 4
    ):
        self.config_path = config_path
        self.state_path = state_path
        self.backup_path = backup_path
        self.dry_run = dry_run
        self.force = force
        self.parallel = parallel
        self.max_workers = max_workers

        self._config: Optional[Dict[str, Any]] = None
        self._state: Optional[BuildState] = None
        self._steps: Dict[str, BuildStep] = {}

    def _load_config(self) -> Dict[str, Any]:
        """Load build configuration."""
        if self._config is not None:
            return self._config

        if not self.config_path.exists():
            logger.warning(f"Config not found: {self.config_path}, using defaults")
            self._config = self._default_config()
        else:
            with open(self.config_path) as f:
                self._config = yaml.safe_load(f)

        return self._config

    def _default_config(self) -> Dict[str, Any]:
        """Return default configuration."""
        return {
            "pipeline": {
                "steps": [
                    {"name": "verify_inputs", "script": "scripts/verify_inputs.py", "required": True},
                    {"name": "export_site_data", "script": "scripts/export/build_site_data.py", "depends_on": []},
                    {"name": "validate", "script": "scripts/validation/validate.py", "depends_on": ["export_site_data"], "required": True},
                ],
                "parallel": {"enabled": False, "max_workers": 4}
            },
            "quality": {
                "min_audit_score": 80.0,
                "max_validation_errors": 0
            }
        }

    def _load_state(self) -> BuildState:
        """Load build state from disk."""
        if self._state is not None:
            return self._state

        state_file = self.state_path / "state.json"
        if state_file.exists():
            try:
                data = json.loads(state_file.read_text())
                self._state = BuildState(
                    last_build_id=data.get("last_build_id", ""),
                    last_build_time=data.get("last_build_time", ""),
                    step_hashes=data.get("step_hashes", {}),
                    file_hashes=data.get("file_hashes", {})
                )
            except (json.JSONDecodeError, KeyError):
                self._state = BuildState()
        else:
            self._state = BuildState()

        return self._state

    def _save_state(self) -> None:
        """Save build state to disk."""
        if self._state is None:
            return

        self.state_path.mkdir(parents=True, exist_ok=True)
        state_file = self.state_path / "state.json"

        state_file.write_text(json.dumps({
            "last_build_id": self._state.last_build_id,
            "last_build_time": self._state.last_build_time,
            "step_hashes": self._state.step_hashes,
            "file_hashes": self._state.file_hashes
        }, indent=2))

    def _build_steps(self) -> Dict[str, BuildStep]:
        """Build step definitions from config."""
        config = self._load_config()
        steps = {}

        for step_config in config.get("pipeline", {}).get("steps", []):
            step = BuildStep(
                name=step_config["name"],
                script=step_config["script"],
                depends_on=step_config.get("depends_on", []),
                required=step_config.get("required", False),
                timeout=step_config.get("timeout", 600),
                args=step_config.get("args", [])
            )
            steps[step.name] = step

        return steps

    def _topological_sort(self, steps: Dict[str, BuildStep]) -> List[str]:
        """
        Topologically sort steps based on dependencies.

        Returns list of step names in execution order.
        """
        # Build adjacency list
        graph: Dict[str, List[str]] = defaultdict(list)
        in_degree: Dict[str, int] = {name: 0 for name in steps}

        for name, step in steps.items():
            for dep in step.depends_on:
                if dep in steps:
                    graph[dep].append(name)
                    in_degree[name] += 1

        # Kahn's algorithm
        queue = [name for name, degree in in_degree.items() if degree == 0]
        result = []

        while queue:
            # Sort to ensure deterministic order
            queue.sort()
            node = queue.pop(0)
            result.append(node)

            for neighbor in graph[node]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if len(result) != len(steps):
            raise ValueError("Circular dependency detected in pipeline")

        return result

    def _compute_step_hash(self, step: BuildStep) -> str:
        """Compute hash for a step to detect changes."""
        script_path = PROJECT_ROOT / step.script

        if not script_path.exists():
            return ""

        # Hash script content
        content = script_path.read_bytes()
        return hashlib.md5(content).hexdigest()

    def _should_run_step(self, step: BuildStep) -> bool:
        """Determine if a step should run based on incremental build logic."""
        if self.force:
            return True

        state = self._load_state()
        current_hash = self._compute_step_hash(step)
        previous_hash = state.step_hashes.get(step.name, "")

        if current_hash != previous_hash:
            return True

        # Check if any dependency was updated
        for dep_name in step.depends_on:
            dep_hash = state.step_hashes.get(dep_name, "")
            if not dep_hash:
                return True

        return False

    def _run_step(self, step: BuildStep) -> bool:
        """
        Execute a single build step.

        Returns:
            True if successful, False otherwise
        """
        step.status = StepStatus.RUNNING
        step.start_time = datetime.now()

        script_path = PROJECT_ROOT / step.script

        if not script_path.exists():
            step.status = StepStatus.FAILED
            step.error = f"Script not found: {step.script}"
            step.end_time = datetime.now()
            return False

        # Build command
        cmd = [sys.executable, str(script_path)] + step.args

        logger.info(f"Running step: {step.name}")
        logger.debug(f"Command: {' '.join(cmd)}")

        if self.dry_run:
            logger.info(f"[DRY RUN] Would execute: {' '.join(cmd)}")
            step.status = StepStatus.SUCCESS
            step.end_time = datetime.now()
            step.duration_seconds = 0.0
            return True

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=step.timeout,
                cwd=str(PROJECT_ROOT)
            )

            step.return_code = result.returncode
            step.output = result.stdout
            step.error = result.stderr

            if result.returncode == 0:
                step.status = StepStatus.SUCCESS
                logger.info(f"Step {step.name} completed successfully")
            else:
                step.status = StepStatus.FAILED
                logger.error(f"Step {step.name} failed with code {result.returncode}")
                if result.stderr:
                    logger.error(f"Error output: {result.stderr[:500]}")

        except subprocess.TimeoutExpired:
            step.status = StepStatus.FAILED
            step.error = f"Step timed out after {step.timeout} seconds"
            logger.error(f"Step {step.name} timed out")

        except Exception as e:
            step.status = StepStatus.FAILED
            step.error = str(e)
            logger.error(f"Step {step.name} failed with exception: {e}")

        step.end_time = datetime.now()
        step.duration_seconds = (step.end_time - step.start_time).total_seconds()

        return step.status == StepStatus.SUCCESS

    def _create_backup(self) -> Optional[Path]:
        """Create backup of databases before build."""
        if self.dry_run:
            return None

        backup_dir = self.backup_path / datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir.mkdir(parents=True, exist_ok=True)

        db_paths = [
            PROJECT_ROOT / "db" / "players.sqlite",
            PROJECT_ROOT / "db" / "stats.sqlite",
            PROJECT_ROOT / "db" / "league.sqlite"
        ]

        for db_path in db_paths:
            if db_path.exists():
                shutil.copy2(db_path, backup_dir / db_path.name)

        logger.info(f"Backup created: {backup_dir}")
        return backup_dir

    def _rollback(self, backup_dir: Path) -> bool:
        """Restore from backup on failure."""
        if not backup_dir or not backup_dir.exists():
            logger.warning("No backup available for rollback")
            return False

        logger.info(f"Rolling back from backup: {backup_dir}")

        for backup_file in backup_dir.glob("*.sqlite"):
            target = PROJECT_ROOT / "db" / backup_file.name
            shutil.copy2(backup_file, target)
            logger.info(f"Restored: {target}")

        return True

    def _find_parallel_groups(
        self,
        steps: Dict[str, BuildStep],
        order: List[str]
    ) -> List[List[str]]:
        """
        Find groups of steps that can run in parallel.

        Returns list of lists, where each inner list contains
        steps that can run concurrently.
        """
        groups = []
        completed: Set[str] = set()

        remaining = set(order)

        while remaining:
            # Find all steps whose dependencies are satisfied
            ready = []
            for name in remaining:
                step = steps[name]
                if all(dep in completed for dep in step.depends_on):
                    ready.append(name)

            if not ready:
                # Shouldn't happen with valid DAG
                break

            groups.append(ready)
            completed.update(ready)
            remaining -= set(ready)

        return groups

    def run(
        self,
        step_names: Optional[List[str]] = None
    ) -> BuildResult:
        """
        Run the build pipeline.

        Args:
            step_names: Optional list of specific steps to run

        Returns:
            BuildResult with detailed results
        """
        build_id = f"build_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        result = BuildResult(
            build_id=build_id,
            started_at=datetime.now().isoformat()
        )

        logger.info(f"Starting build: {build_id}")

        # Load steps
        all_steps = self._build_steps()

        # Filter steps if specific ones requested
        if step_names:
            steps = {name: all_steps[name] for name in step_names if name in all_steps}
        else:
            steps = all_steps

        # Topological sort
        try:
            order = self._topological_sort(steps)
        except ValueError as e:
            result.status = "failed"
            result.errors.append(str(e))
            return result

        result.total_steps = len(order)

        # Create backup
        backup_dir = self._create_backup()

        # Execute steps
        state = self._load_state()
        failed = False

        if self.parallel:
            # Parallel execution
            groups = self._find_parallel_groups(steps, order)

            for group in groups:
                if failed:
                    break

                # Run group in parallel
                with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                    futures = {}

                    for name in group:
                        step = steps[name]

                        if not self._should_run_step(step):
                            step.status = StepStatus.SKIPPED
                            result.steps_skipped += 1
                            logger.info(f"Skipping unchanged step: {name}")
                            continue

                        future = executor.submit(self._run_step, step)
                        futures[future] = name

                    for future in as_completed(futures):
                        name = futures[future]
                        step = steps[name]

                        try:
                            success = future.result()

                            if success:
                                result.steps_succeeded += 1
                                state.step_hashes[name] = self._compute_step_hash(step)
                            else:
                                result.steps_failed += 1
                                result.errors.append(f"Step {name} failed: {step.error}")

                                if step.required:
                                    failed = True

                        except Exception as e:
                            result.steps_failed += 1
                            result.errors.append(f"Step {name} exception: {e}")
                            if step.required:
                                failed = True

                        result.step_results[name] = {
                            "status": step.status.value,
                            "duration": step.duration_seconds,
                            "return_code": step.return_code
                        }
        else:
            # Sequential execution
            for name in order:
                if failed:
                    steps[name].status = StepStatus.CANCELLED
                    result.step_results[name] = {"status": "cancelled"}
                    continue

                step = steps[name]

                if not self._should_run_step(step):
                    step.status = StepStatus.SKIPPED
                    result.steps_skipped += 1
                    result.step_results[name] = {"status": "skipped"}
                    logger.info(f"Skipping unchanged step: {name}")
                    continue

                success = self._run_step(step)

                result.step_results[name] = {
                    "status": step.status.value,
                    "duration": step.duration_seconds,
                    "return_code": step.return_code
                }

                if success:
                    result.steps_succeeded += 1
                    state.step_hashes[name] = self._compute_step_hash(step)
                else:
                    result.steps_failed += 1
                    result.errors.append(f"Step {name} failed: {step.error}")

                    if step.required:
                        failed = True

        # Handle failure
        if failed:
            result.status = "failed"
            if backup_dir and not self.dry_run:
                self._rollback(backup_dir)
        else:
            result.status = "success"

        # Update state
        state.last_build_id = build_id
        state.last_build_time = datetime.now().isoformat()
        self._save_state()

        # Finalize result
        result.completed_at = datetime.now().isoformat()
        started = datetime.fromisoformat(result.started_at)
        completed = datetime.fromisoformat(result.completed_at)
        result.duration_seconds = (completed - started).total_seconds()

        logger.info(
            f"Build {build_id} completed: {result.status} "
            f"({result.steps_succeeded} succeeded, {result.steps_failed} failed, "
            f"{result.steps_skipped} skipped)"
        )

        return result


def run_pipeline(
    steps: Optional[List[str]] = None,
    force: bool = False,
    parallel: bool = False
) -> BuildResult:
    """Run the build pipeline."""
    orchestrator = PipelineOrchestrator(force=force, parallel=parallel)
    return orchestrator.run(steps)


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Pipeline Orchestrator",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    parser.add_argument(
        "--steps",
        type=str,
        help="Comma-separated list of steps to run"
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would run without executing"
    )

    parser.add_argument(
        "--force",
        action="store_true",
        help="Force rebuild (ignore cache)"
    )

    parser.add_argument(
        "--parallel",
        action="store_true",
        help="Enable parallel execution"
    )

    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="Max parallel workers (default: 4)"
    )

    parser.add_argument(
        "--config",
        type=Path,
        default=CONFIG_PATH,
        help=f"Config file path (default: {CONFIG_PATH})"
    )

    parser.add_argument(
        "--list-steps",
        action="store_true",
        help="List available steps and exit"
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    orchestrator = PipelineOrchestrator(
        config_path=args.config,
        dry_run=args.dry_run,
        force=args.force,
        parallel=args.parallel,
        max_workers=args.workers
    )

    if args.list_steps:
        steps = orchestrator._build_steps()
        order = orchestrator._topological_sort(steps)

        print("\nAvailable Pipeline Steps:")
        print("=" * 60)

        for name in order:
            step = steps[name]
            deps = ", ".join(step.depends_on) if step.depends_on else "none"
            required = " [REQUIRED]" if step.required else ""
            print(f"  {name}{required}")
            print(f"    Script: {step.script}")
            print(f"    Depends on: {deps}")

        return 0

    step_names = args.steps.split(",") if args.steps else None
    result = orchestrator.run(step_names)

    # Print summary
    print("\n" + "=" * 60)
    print("BUILD SUMMARY")
    print("=" * 60)
    print(f"Build ID: {result.build_id}")
    print(f"Status: {result.status.upper()}")
    print(f"Duration: {result.duration_seconds:.2f}s")
    print(f"\nSteps:")
    print(f"  Succeeded: {result.steps_succeeded}")
    print(f"  Failed: {result.steps_failed}")
    print(f"  Skipped: {result.steps_skipped}")

    if result.step_results:
        print("\nStep Details:")
        for name, details in result.step_results.items():
            status = details.get("status", "unknown")
            duration = details.get("duration", 0)
            print(f"  {name}: {status} ({duration:.2f}s)")

    if result.errors:
        print("\nErrors:")
        for error in result.errors:
            print(f"  - {error}")

    print("=" * 60)

    return 0 if result.status == "success" else 1


if __name__ == "__main__":
    sys.exit(main())
