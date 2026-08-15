"""Small read-only client for Sleeper's public API."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


API_ROOT = "https://api.sleeper.app/v1"


class SleeperApiError(RuntimeError):
    """Raised when Sleeper cannot provide a required resource."""


@dataclass(frozen=True)
class SleeperClient:
    timeout: float = 30.0
    retries: int = 2
    user_agent: str = "TatnallLegacy/2.0 (+https://github.com/zmmnvt8yxv-dev/TatnallLegacy)"

    def get(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        optional: bool = False,
    ) -> Any:
        url = f"{API_ROOT}/{path.lstrip('/')}"
        if params:
            url = f"{url}?{urlencode(params)}"
        return self.get_url(url, optional=optional)

    def get_url(self, url: str, *, optional: bool = False) -> Any:
        """Read an absolute Sleeper URL with the same retry policy as v1 calls."""
        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                request = Request(
                    url,
                    headers={"Accept": "application/json", "User-Agent": self.user_agent},
                )
                with urlopen(request, timeout=self.timeout) as response:
                    return json.load(response)
            except HTTPError as exc:
                if optional and exc.code == 404:
                    return None
                last_error = exc
                if 400 <= exc.code < 500:
                    break
            except (URLError, TimeoutError, json.JSONDecodeError) as exc:
                last_error = exc
            if attempt < self.retries:
                time.sleep(0.5 * (2**attempt))
        if optional:
            return None
        raise SleeperApiError(f"Sleeper request failed for {url}: {last_error}")

    def league(self, league_id: str) -> dict[str, Any]:
        value = self.get(f"league/{league_id}")
        if not isinstance(value, dict):
            raise SleeperApiError(f"Unexpected league response for {league_id}")
        return value

    def user_leagues(self, user_id: str, season: int) -> list[dict[str, Any]]:
        value = self.get(f"user/{user_id}/leagues/nfl/{season}")
        return value if isinstance(value, list) else []
