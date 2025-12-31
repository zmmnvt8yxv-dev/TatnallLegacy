import { createContext, useContext, useMemo, useState, type PropsWithChildren } from "react";
import { PlayerProfileModal } from "./PlayerProfileModal";

type PlayerProfileContextValue = {
  openProfile: (playerName: string) => void;
};

const PlayerProfileContext = createContext<PlayerProfileContextValue | undefined>(undefined);

export function PlayerProfileProvider({ children }: PropsWithChildren) {
  const [activePlayer, setActivePlayer] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openProfile = (playerName: string) => {
    setActivePlayer(playerName);
    setIsOpen(true);
  };

  const closeProfile = () => {
    setIsOpen(false);
    setActivePlayer(null);
  };

  const value = useMemo(() => ({ openProfile }), []);

  return (
    <PlayerProfileContext.Provider value={value}>
      {children}
      <PlayerProfileModal isOpen={isOpen} playerName={activePlayer} onClose={closeProfile} />
    </PlayerProfileContext.Provider>
  );
}

export function usePlayerProfile() {
  const context = useContext(PlayerProfileContext);
  if (!context) {
    throw new Error("usePlayerProfile must be used within PlayerProfileProvider");
  }
  return context;
}
