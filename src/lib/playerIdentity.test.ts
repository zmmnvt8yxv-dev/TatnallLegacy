import { describe, expect, it } from "vitest";
import { normalizeName, resolvePlayerKey } from "./playerIdentity";

describe("normalizeName", () => {
  it("strips suffixes and punctuation", () => {
    expect(normalizeName("Odell Beckham Jr.")).toBe("odell beckham");
  });

  it("collapses initials", () => {
    expect(normalizeName("D.J. Moore")).toBe("dj moore");
    expect(normalizeName("D J Moore")).toBe("dj moore");
    expect(normalizeName("T.Y. Hilton")).toBe("ty hilton");
  });

  it("handles hyphens and abbreviations", () => {
    expect(normalizeName("Amon-Ra St. Brown")).toBe("amon ra st brown");
    expect(normalizeName("St. Brown")).toBe("st brown");
  });
});

describe("resolvePlayerKey", () => {
  it("maps nickname aliases to canonical keys", () => {
    expect(resolvePlayerKey("Hollywood Brown")).toBe("marquise brown");
    expect(resolvePlayerKey("Gabe Davis")).toBe("gabriel davis");
    expect(resolvePlayerKey("Mitch Trubisky")).toBe("mitchell trubisky");
  });

  it("normalizes punctuation and suffix variants", () => {
    expect(resolvePlayerKey("D.J. Moore")).toBe("dj moore");
    expect(resolvePlayerKey("Odell Beckham Jr.")).toBe("odell beckham");
  });
});
