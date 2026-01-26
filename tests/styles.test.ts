import { describe, expect, it } from "vitest";

import {
  ErrorStyle,
  InfoStyle,
  Primary,
  Success,
  TitleStyle
} from "../src/tui/styles/styles.js";
import { RalphWiggum } from "../src/tui/styles/ralph.js";

describe("styles", () => {
  it("renders ASCII art and styles", () => {
    expect(RalphWiggum.length).toBeGreaterThan(0);
    expect(RalphWiggum).toContain("::::");

    expect(Primary).not.toBe("");
    expect(Success).not.toBe("");
  });
});
