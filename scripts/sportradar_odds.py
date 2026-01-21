"""
Sportradar Odds Comparison API Client

Provides access to betting odds data including:
- Live odds from multiple sportsbooks
- Line movements and history
- Prop bets and futures
- Market comparisons

Documentation: https://developer.sportradar.com/betting-football/reference

Usage:
    from sportradar_odds import SportradarOddsClient

    client = SportradarOddsClient()
    events = client.get_live_events()
    odds = client.get_event_odds(event_id)
"""

import os
import time
import json
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime, date

import requests

from config import get_sportradar_odds_key, get_sportradar_odds_config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Project paths
PROJECT_ROOT = Path(__file__).parent.parent
CACHE_DIR = PROJECT_ROOT / "data_raw" / "sportradar_odds_cache"


class SportradarOddsClient:
    """
    Client for the Sportradar Odds Comparison API.

    Provides access to betting odds across multiple sportsbooks
    for NFL and other sports.
    """

    # API Configuration
    BASE_URL = "https://api.sportradar.com/oddscomparison-us"
    VERSION = "v2"
    LANGUAGE = "en"
    FORMAT = "json"

    # Rate limiting
    RATE_LIMIT_CALLS = 1
    RATE_LIMIT_WINDOW = 1.0

    # NFL Sport ID (may vary by API version)
    NFL_SPORT_ID = "sr:sport:16"  # American Football

    def __init__(self, api_key: Optional[str] = None, access_level: str = "trial"):
        """
        Initialize the Sportradar Odds client.

        Args:
            api_key: API key (if not provided, loads from config)
            access_level: API access level ('trial' or 'production')
        """
        self.api_key = api_key or get_sportradar_odds_key()
        if not self.api_key:
            raise ValueError(
                "Sportradar Odds API key not configured. "
                "Set SPORTRADAR_ODDS_API_KEY in .env.local or config/api_keys.json"
            )

        config = get_sportradar_odds_config()
        self.access_level = access_level or config.get("access_level", "trial")
        self._last_request_time = 0

        # Ensure cache directory exists
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def _build_url(self, endpoint: str) -> str:
        """Build the full API URL for an endpoint."""
        return f"{self.BASE_URL}/{self.access_level}/{self.VERSION}/{self.LANGUAGE}/{endpoint}.{self.FORMAT}"

    def _rate_limit(self):
        """Enforce rate limiting between API calls."""
        elapsed = time.time() - self._last_request_time
        if elapsed < self.RATE_LIMIT_WINDOW:
            time.sleep(self.RATE_LIMIT_WINDOW - elapsed)
        self._last_request_time = time.time()

    def _make_request(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        cache_key: Optional[str] = None,
        cache_minutes: int = 5,
    ) -> Dict[str, Any]:
        """
        Make an API request with rate limiting and optional caching.

        Args:
            endpoint: API endpoint path
            params: Query parameters
            cache_key: Key for caching (if None, no caching)
            cache_minutes: Minutes to cache the response

        Returns:
            JSON response as dictionary
        """
        # Check cache first (odds data has short cache time)
        if cache_key:
            cached = self._get_cached(cache_key, cache_minutes)
            if cached is not None:
                logger.debug(f"Cache hit: {cache_key}")
                return cached

        # Rate limit
        self._rate_limit()

        # Build request
        url = self._build_url(endpoint)
        request_params = {"api_key": self.api_key}
        if params:
            request_params.update(params)

        # Make request
        logger.info(f"Odds API Request: {endpoint}")
        try:
            response = requests.get(url, params=request_params, timeout=30)
            response.raise_for_status()
            data = response.json()

            # Cache the response
            if cache_key:
                self._set_cached(cache_key, data)

            return data

        except requests.exceptions.HTTPError as e:
            if response.status_code == 403:
                logger.error("API key invalid or access denied")
            elif response.status_code == 429:
                logger.error("Rate limit exceeded")
            raise
        except requests.exceptions.RequestException as e:
            logger.error(f"Request failed: {e}")
            raise

    def _get_cached(self, cache_key: str, max_age_minutes: int) -> Optional[Dict]:
        """Get cached response if valid."""
        cache_file = CACHE_DIR / f"{cache_key}.json"
        if cache_file.exists():
            age_minutes = (time.time() - cache_file.stat().st_mtime) / 60
            if age_minutes < max_age_minutes:
                with open(cache_file, "r") as f:
                    return json.load(f)
        return None

    def _set_cached(self, cache_key: str, data: Dict):
        """Cache a response."""
        cache_file = CACHE_DIR / f"{cache_key}.json"
        with open(cache_file, "w") as f:
            json.dump(data, f, indent=2)

    # =========================================================================
    # SPORTS & COMPETITIONS
    # =========================================================================

    def get_sports(self) -> Dict[str, Any]:
        """
        Get list of available sports.

        Returns:
            Sports list with IDs and names
        """
        return self._make_request(
            "sports",
            cache_key="sports",
            cache_minutes=60,
        )

    def get_sport_categories(self, sport_id: str = None) -> Dict[str, Any]:
        """
        Get categories (leagues/competitions) for a sport.

        Args:
            sport_id: Sport ID (defaults to NFL)

        Returns:
            Categories/leagues for the sport
        """
        if sport_id is None:
            sport_id = self.NFL_SPORT_ID

        return self._make_request(
            f"sports/{sport_id}/categories",
            cache_key=f"categories_{sport_id}",
            cache_minutes=60,
        )

    # =========================================================================
    # EVENTS & SCHEDULES
    # =========================================================================

    def get_live_events(self, sport_id: str = None) -> Dict[str, Any]:
        """
        Get currently live events with odds.

        Args:
            sport_id: Sport ID (defaults to NFL)

        Returns:
            List of live events
        """
        if sport_id is None:
            sport_id = self.NFL_SPORT_ID

        return self._make_request(
            f"sports/{sport_id}/schedules/live",
            cache_key=f"live_events_{sport_id}",
            cache_minutes=1,  # Very short cache for live data
        )

    def get_daily_schedule(
        self, schedule_date: Optional[date] = None, sport_id: str = None
    ) -> Dict[str, Any]:
        """
        Get schedule for a specific date.

        Args:
            schedule_date: Date (defaults to today)
            sport_id: Sport ID (defaults to NFL)

        Returns:
            Schedule with events
        """
        if sport_id is None:
            sport_id = self.NFL_SPORT_ID

        if schedule_date is None:
            schedule_date = date.today()

        date_str = schedule_date.strftime("%Y-%m-%d")
        return self._make_request(
            f"sports/{sport_id}/schedules/{date_str}/schedule",
            cache_key=f"schedule_{sport_id}_{date_str}",
            cache_minutes=15,
        )

    # =========================================================================
    # ODDS & MARKETS
    # =========================================================================

    def get_event_odds(self, event_id: str) -> Dict[str, Any]:
        """
        Get odds for a specific event from all sportsbooks.

        Args:
            event_id: Sportradar event ID

        Returns:
            Odds data with all markets and books
        """
        return self._make_request(
            f"sport_events/{event_id}/markets",
            cache_key=f"odds_{event_id}",
            cache_minutes=2,  # Short cache for odds
        )

    def get_event_probabilities(self, event_id: str) -> Dict[str, Any]:
        """
        Get probability data for an event.

        Args:
            event_id: Sportradar event ID

        Returns:
            Probability data
        """
        return self._make_request(
            f"sport_events/{event_id}/probabilities",
            cache_key=f"probabilities_{event_id}",
            cache_minutes=5,
        )

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def get_best_odds(self, event_id: str, market_type: str = "moneyline") -> Dict[str, Any]:
        """
        Get the best odds across all sportsbooks for an event.

        Args:
            event_id: Event ID
            market_type: Type of market ('moneyline', 'spread', 'total')

        Returns:
            Best odds by outcome with book name
        """
        odds_data = self.get_event_odds(event_id)
        best_odds = {}

        # Process odds to find best prices
        # Structure depends on API response format
        markets = odds_data.get("markets", [])

        for market in markets:
            if market_type.lower() in market.get("name", "").lower():
                for outcome in market.get("outcomes", []):
                    outcome_name = outcome.get("name")
                    for book in outcome.get("books", []):
                        book_name = book.get("name")
                        price = book.get("odds", {}).get("decimal")

                        if outcome_name not in best_odds:
                            best_odds[outcome_name] = {
                                "best_price": price,
                                "best_book": book_name,
                                "all_books": [],
                            }

                        best_odds[outcome_name]["all_books"].append({
                            "book": book_name,
                            "price": price,
                        })

                        if price and price > best_odds[outcome_name]["best_price"]:
                            best_odds[outcome_name]["best_price"] = price
                            best_odds[outcome_name]["best_book"] = book_name

        return best_odds

    def compare_lines(self, event_id: str) -> Dict[str, Any]:
        """
        Compare lines across all sportsbooks for an event.

        Args:
            event_id: Event ID

        Returns:
            Line comparison data
        """
        odds_data = self.get_event_odds(event_id)

        comparison = {
            "event_id": event_id,
            "timestamp": datetime.now().isoformat(),
            "moneyline": {},
            "spread": {},
            "total": {},
        }

        # Extract and organize odds by market type
        markets = odds_data.get("markets", [])

        for market in markets:
            market_name = market.get("name", "").lower()

            if "moneyline" in market_name or "winner" in market_name:
                comparison["moneyline"] = self._extract_book_odds(market)
            elif "spread" in market_name or "handicap" in market_name:
                comparison["spread"] = self._extract_book_odds(market)
            elif "total" in market_name or "over/under" in market_name:
                comparison["total"] = self._extract_book_odds(market)

        return comparison

    def _extract_book_odds(self, market: Dict) -> Dict[str, List[Dict]]:
        """Extract odds from all books for a market."""
        odds_by_outcome = {}

        for outcome in market.get("outcomes", []):
            outcome_name = outcome.get("name")
            odds_by_outcome[outcome_name] = []

            for book in outcome.get("books", []):
                odds_by_outcome[outcome_name].append({
                    "book": book.get("name"),
                    "decimal_odds": book.get("odds", {}).get("decimal"),
                    "american_odds": book.get("odds", {}).get("american"),
                })

        return odds_by_outcome


# Convenience function
def get_odds_client() -> SportradarOddsClient:
    """Get a configured Odds client instance."""
    return SportradarOddsClient()


if __name__ == "__main__":
    print("=== Sportradar Odds Client Test ===\n")

    try:
        client = SportradarOddsClient()
        print("Client initialized successfully!")

        # Test sports list
        print("\nFetching available sports...")
        sports = client.get_sports()
        print(f"Response received: {type(sports)}")

    except ValueError as e:
        print(f"Configuration error: {e}")
        print("\nTo use the Odds API, add your API key to:")
        print("  - .env.local: SPORTRADAR_ODDS_API_KEY=your_key")
        print("  - OR config/api_keys.json under sportradar.odds.api_key")
    except Exception as e:
        print(f"Error: {e}")
