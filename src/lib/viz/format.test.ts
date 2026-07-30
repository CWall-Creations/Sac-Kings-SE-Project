import { describe, expect, it } from "vitest";
import {
  formatPercent,
  formatPointsPerShot,
  formatShare,
  formatShootingPct,
  formatSigned,
  formatSignedPoints,
} from "./format";

describe("formatSigned", () => {
  it("marks the direction, which is the whole point of a difference", () => {
    expect(formatSigned(0.13)).toBe("+0.13");
    // A true minus sign, not a hyphen.
    expect(formatSigned(-0.11)).toBe("−0.11");
  });

  it("never renders a signed zero", () => {
    // -0.001 rounds to zero; showing "−0.00" would imply a real negative.
    expect(formatSigned(-0.001)).toBe("0.00");
    expect(formatSigned(0)).toBe("0.00");
  });

  it("respects the requested precision", () => {
    expect(formatSigned(0.1234, 3)).toBe("+0.123");
  });
});

describe("formatSignedPoints", () => {
  it("rounds to whole points and keeps the sign", () => {
    expect(formatSignedPoints(135.4)).toBe("+135");
    expect(formatSignedPoints(-110.6)).toBe("−111");
    expect(formatSignedPoints(0)).toBe("0");
  });
});

describe("formatShare", () => {
  it("rounds to whole percents", () => {
    expect(formatShare(0.274)).toBe("27%");
  });

  it("distinguishes 'almost none' from 'none'", () => {
    // One attempt in a thousand must not read as zero.
    expect(formatShare(0.001)).toBe("<1%");
    expect(formatShare(0)).toBe("0%");
  });
});

describe("formatShootingPct", () => {
  it("drops the leading zero, the way a box score writes it", () => {
    expect(formatShootingPct(0.446)).toBe(".446");
    expect(formatShootingPct(1)).toBe("1.000");
  });
});

describe("formatPointsPerShot and formatPercent", () => {
  it("fixes precision so the same value never appears two ways", () => {
    expect(formatPointsPerShot(1.0412)).toBe("1.04");
    expect(formatPercent(0.446)).toBe("44.6%");
    expect(formatPercent(0.446, 0)).toBe("45%");
  });
});
