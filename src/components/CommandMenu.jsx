import React, { useEffect, useState, useMemo } from "react";
import { useDataContext } from "../data/DataContext.jsx";
import { useNavigate } from "react-router-dom";
import {
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandSeparator,
    CommandShortcut,
} from "./ui/command.jsx";
import {
    Home,
    Users,
    Trophy,
    Calendar,
    History,
    ArrowRightLeft,
    ShieldCheck,
    User
} from "lucide-react";

export function CommandMenu() {
    const { playerSearch, teams } = useDataContext();
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const down = (e) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };
        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    const runCommand = (command) => {
        setOpen(false);
        command();
    };

    // Prepare indices for search
    const limitedPlayers = useMemo(() => {
        if (!playerSearch) return [];
        // Just take top 50 to avoid slow rendering in command menu if list is huge
        // But typically cmdk handles large lists well if virtualized. 
        // Detailed filtering happens via cmdk internal search usually, but better to feed it simplified data.
        return playerSearch.slice(0, 100).map(p => ({
            id: p.id,
            name: p.name,
            position: p.position,
            team: p.team
        }));
    }, [playerSearch]);

    const uniqueOwners = useMemo(() => {
        const unique = new Map();
        for (const t of teams || []) {
            // Prefer normalizeOwnerName if available, but for now specific logic
            // We can just rely on the team.display_name or Owner?
            // Let's use specific logic similar to StandingsPage or standard utils
            const name = t.owner || t.display_name || t.team_name;
            if (name) unique.set(name, name);
        }
        return Array.from(unique.values()).sort();
    }, [teams]);

    return (
        <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={true}>
            <CommandInput placeholder="Search players, teams, or pages..." />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>

                <CommandGroup heading="Pages">
                    <CommandItem onSelect={() => runCommand(() => navigate("/"))}>
                        <Home className="mr-2 h-4 w-4" />
                        <span>Home</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => navigate("/matchups"))}>
                        <Calendar className="mr-2 h-4 w-4" />
                        <span>Matchups</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => navigate("/standings"))}>
                        <Trophy className="mr-2 h-4 w-4" />
                        <span>Standings</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => navigate("/transactions"))}>
                        <ArrowRightLeft className="mr-2 h-4 w-4" />
                        <span>Transactions</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => navigate("/teams"))}>
                        <Users className="mr-2 h-4 w-4" />
                        <span>Teams</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => navigate("/data-health"))}>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        <span>Data Health</span>
                    </CommandItem>
                </CommandGroup>

                <CommandSeparator />

                <CommandGroup heading="Teams">
                    {uniqueOwners.map((owner) => (
                        <CommandItem key={owner} onSelect={() => runCommand(() => navigate(`/teams?prop_owner=${encodeURIComponent(owner)}`))}>
                            <User className="mr-2 h-4 w-4" />
                            <span>{owner}</span>
                        </CommandItem>
                    ))}
                </CommandGroup>

                <CommandSeparator />

                <CommandGroup heading="Players">
                    {limitedPlayers.map((player) => (
                        <CommandItem
                            key={player.id}
                            value={player.name} // Important for filtering
                            onSelect={() => runCommand(() => navigate(`/players/${player.id}`))}
                        >
                            <User className="mr-2 h-4 w-4 text-zinc-400" />
                            <div className="flex flex-col">
                                <span>{player.name}</span>
                                <span className="text-xs text-zinc-500">{player.position} · {player.team}</span>
                            </div>
                        </CommandItem>
                    ))}
                </CommandGroup>

            </CommandList>
        </CommandDialog>
    );
}
