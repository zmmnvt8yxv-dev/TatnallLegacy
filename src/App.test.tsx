import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

const adminUser = {
  user_id: "123",
  username: "conner27lax",
  display_name: "Commissioner",
  avatar: null,
};

vi.mock("./components/PlayerSearch", () => ({
  PlayerSearch: () => <div>Player search</div>,
}));

vi.mock("./components/SleeperLoginPanel", () => ({
  SleeperLoginModal: ({ isOpen, onSuccess, onClose }: { isOpen: boolean; onSuccess: (user: typeof adminUser) => void; onClose: () => void }) =>
    isOpen ? (
      <button
        type="button"
        onClick={() => {
          onSuccess(adminUser);
          onClose();
        }}
      >
        Complete login
      </button>
    ) : null,
}));

vi.mock("./components/UserLogPanel", () => ({
  UserLogPanel: () => <div>User log entries</div>,
}));

vi.mock("./hooks/useSeasonSelection", () => ({
  useSeasonSelection: () => ({
    status: "ready",
    years: [2024],
    year: 2024,
    setYear: vi.fn(),
    error: undefined,
  }),
}));

vi.mock("./lib/userLog", () => ({
  ensureGuestLog: vi.fn(),
  getCurrentUser: vi.fn(() => null),
  setCurrentUser: vi.fn(),
  subscribeToUserLog: vi.fn(() => () => undefined),
}));

describe("App", () => {
  it("navigates to the admin user log after login", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /open sleeper login/i }));
    await user.click(screen.getByRole("button", { name: /complete login/i }));

    expect(screen.getByText("User log entries")).toBeInTheDocument();
  });
});
