import {
  Bar,
  BarChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { PlayerHeadshot } from "../components/PlayerHeadshot";
import { selectPlayerDirectory, selectPlayerProfile } from "../data/selectors";
import { useAllSeasonsData } from "../hooks/useAllSeasonsData";

const colors = {
  playerA: "#38bdf8",
  playerB: "#f97316",
};

export function PlayerComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { status, seasons, loadAllSeasons } = useAllSeasonsData();
  const playersParam = searchParams.get("players") ?? "";
  const [playerAName, playerBName] = playersParam
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => decodeURIComponent(value))
    .concat(["", ""])
    .slice(0, 2);

  const playerDirectory = useMemo(() => {
    if (status !== "ready") {
      return [];
    }
    return selectPlayerDirectory(seasons);
  }, [seasons, status]);

  useEffect(() => {
    loadAllSeasons();
  }, [loadAllSeasons]);

  const playerAProfile = useMemo(() => {
    if (status !== "ready" || !playerAName) {
      return null;
    }
    return selectPlayerProfile(seasons, playerAName);
  }, [playerAName, seasons, status]);

  const playerBProfile = useMemo(() => {
    if (status !== "ready" || !playerBName) {
      return null;
    }
    return selectPlayerProfile(seasons, playerBName);
  }, [playerBName, seasons, status]);

  const updatePlayers = (nextA: string, nextB: string) => {
    const values = [nextA, nextB].filter(Boolean);
    if (!values.length) {
      setSearchParams({});
      return;
    }
    const param = values.map((value) => encodeURIComponent(value)).join(",");
    setSearchParams({ players: param });
  };

  const chartData = useMemo(() => {
    if (!playerAProfile && !playerBProfile) {
      return [];
    }
    const seasonsSet = new Set<number>();
    playerAProfile?.seasons.forEach((season) => seasonsSet.add(season.season));
    playerBProfile?.seasons.forEach((season) => seasonsSet.add(season.season));
    return Array.from(seasonsSet)
      .sort((a, b) => a - b)
      .map((season) => ({
        season: String(season),
        playerA:
          playerAProfile?.seasons.find((entry) => entry.season === season)?.totalPoints ?? 0,
        playerB:
          playerBProfile?.seasons.find((entry) => entry.season === season)?.totalPoints ?? 0,
      }));
  }, [playerAProfile, playerBProfile]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Player Comparison</p>
          <h2 className="text-2xl font-semibold text-foreground">Head-to-head history</h2>
        </div>
        <button type="button" className="btn" onClick={loadAllSeasons}>
          Refresh Data
        </button>
      </div>

      <div className="compare-card">
        <div className="compare-card__controls">
          <div>
            <label className="player-profile__label" htmlFor="comparePlayerA">
              Player A
            </label>
            <input
              id="comparePlayerA"
              className="input w-full"
              list="player-options"
              placeholder="Choose a player"
              value={playerAName}
              onChange={(event) => updatePlayers(event.target.value, playerBName)}
            />
          </div>
          <div>
            <label className="player-profile__label" htmlFor="comparePlayerB">
              Player B
            </label>
            <input
              id="comparePlayerB"
              className="input w-full"
              list="player-options"
              placeholder="Choose a player"
              value={playerBName}
              onChange={(event) => updatePlayers(playerAName, event.target.value)}
            />
          </div>
        </div>
        <datalist id="player-options">
          {playerDirectory.map((player) => (
            <option key={player.name} value={player.name} />
          ))}
        </datalist>

        {status === "loading" || status === "idle" ? (
          <p className="text-sm text-muted">Loading player history…</p>
        ) : status === "error" ? (
          <p className="text-sm text-red-500">Unable to load player history.</p>
        ) : playerAProfile && playerBProfile ? (
          <div className="space-y-6">
            <div className="compare-card__summary">
              {[playerAProfile, playerBProfile].map((profile, index) => (
                <div key={profile.player} className="compare-card__player">
                  <PlayerHeadshot
                    playerId={profile.playerId}
                    playerName={profile.player}
                    className="compare-card__headshot"
                  />
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{profile.player}</h3>
                    <p className="text-xs text-muted">
                      {[profile.position ?? "—", profile.currentTeam ?? "—"].join(" · ")}
                    </p>
                    <div className="compare-card__stats">
                      <span>Total {profile.totalPoints.toFixed(1)} pts</span>
                      <span>Avg {profile.avgPoints.toFixed(1)} pts</span>
                      <span>Best {profile.maxPoints.toFixed(1)} pts</span>
                      <span>Consensus #{profile.consensusRank ?? "—"}</span>
                    </div>
                  </div>
                  <span
                    className="compare-card__pill"
                    style={{ backgroundColor: index === 0 ? colors.playerA : colors.playerB }}
                  >
                    {index === 0 ? "Player A" : "Player B"}
                  </span>
                </div>
              ))}
            </div>

            <div className="compare-card__chart">
              <h3 className="section-heading">Points by Season</h3>
              <p className="section-caption">Bar chart comparison across seasons.</p>
              <div className="compare-card__chart-frame">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                    <XAxis dataKey="season" stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="#94a3b8"
                      tickLine={false}
                      axisLine={false}
                      width={32}
                      tickFormatter={(value) => value.toFixed(0)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        border: "1px solid #1e293b",
                        borderRadius: "12px",
                      }}
                      itemStyle={{ color: "#e2e8f0" }}
                      labelStyle={{ color: "#e2e8f0" }}
                      formatter={(value) => [`${value} pts`, "Total"]}
                    />
                    <Legend />
                    <Bar
                      dataKey="playerA"
                      fill={colors.playerA}
                      name={playerAProfile.player}
                      isAnimationActive
                      animationDuration={900}
                      animationEasing="ease-in-out"
                    />
                    <Bar
                      dataKey="playerB"
                      fill={colors.playerB}
                      name={playerBProfile.player}
                      isAnimationActive
                      animationDuration={900}
                      animationEasing="ease-in-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="compare-card__chart">
              <h3 className="section-heading">Season Trends</h3>
              <p className="section-caption">Line chart showing points trendlines.</p>
              <div className="compare-card__chart-frame">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                    <XAxis dataKey="season" stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="#94a3b8"
                      tickLine={false}
                      axisLine={false}
                      width={32}
                      tickFormatter={(value) => value.toFixed(0)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        border: "1px solid #1e293b",
                        borderRadius: "12px",
                      }}
                      itemStyle={{ color: "#e2e8f0" }}
                      labelStyle={{ color: "#e2e8f0" }}
                      formatter={(value) => [`${value} pts`, "Total"]}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="playerA"
                      stroke={colors.playerA}
                      strokeWidth={3}
                      dot={{ r: 3, fill: colors.playerA }}
                      activeDot={{ r: 5 }}
                      name={playerAProfile.player}
                      isAnimationActive
                      animationDuration={900}
                      animationEasing="ease-in-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="playerB"
                      stroke={colors.playerB}
                      strokeWidth={3}
                      dot={{ r: 3, fill: colors.playerB }}
                      activeDot={{ r: 5 }}
                      name={playerBProfile.player}
                      isAnimationActive
                      animationDuration={900}
                      animationEasing="ease-in-out"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Choose two players to view a head-to-head comparison across seasons.
          </p>
        )}
      </div>
    </div>
  );
}
