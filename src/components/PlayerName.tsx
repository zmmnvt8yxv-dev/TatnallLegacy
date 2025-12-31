import { usePlayerProfile } from "./PlayerProfileProvider";

type PlayerNameProps = {
  name: string;
  className?: string;
};

export function PlayerName({ name, className }: PlayerNameProps) {
  const { openProfile } = usePlayerProfile();

  if (!name || name === "—") {
    return <span className={className}>{name || "—"}</span>;
  }

  return (
    <button
      type="button"
      className={["player-link", className].filter(Boolean).join(" ")}
      onClick={() => openProfile(name)}
    >
      {name}
    </button>
  );
}
