import { describe, expect, it } from "vitest";

import { isAllowedArtText, numbersIn, numbersStated, titleProblems, visibleWords, wordCount } from "./text-policy.mjs";

describe("isAllowedArtText", () => {
  it("allows numbers, fractions, units after a number and comparison signs", () => {
    for (const text of ["2 in", "≤ 1 in", "≥ 2,995 lb", "≈ 60%", "811", "≤ 15°", "≈ ½", "≈ ¾", "2-5/16 in", "< 5 mph", "50 mi", "1 h", "12 V", "7"]) {
      expect(isAllowedArtText(text), text).toBe(true);
    }
  });

  it("refuses words, units without a number, a lone sign and unknown units", () => {
    for (const text of ["No riders", "in", "≤", "Lift test", "60 mph max", "5 kg", "", "UP", "2 in ball"]) {
      expect(isAllowedArtText(text), text).toBe(false);
    }
  });
});

describe("titles and words", () => {
  it("counts only words with letters", () => {
    expect(wordCount("Stop every 50 miles")).toBe(3);
    expect(wordCount("≈ 60%")).toBe(0);
  });

  it("limits titles to 4 words and 28 characters, and refuses sentences", () => {
    expect(titleProblems("Match the ball")).toEqual([]);
    expect(titleProblems("Levers away: toward the blade")).toHaveLength(2);
    expect(titleProblems("Cross them.")[0]).toMatch(/sentence/);
    expect(titleProblems("No riders here", { maxWords: 3, maxChars: 20 })).toEqual([]);
    expect(titleProblems("Never go under the body", { maxWords: 3, maxChars: 20 })).toHaveLength(2);
  });
});

describe("visibleWords", () => {
  it("skips SVG, collapsed details (keeping the summary), required notices and units after numbers", () => {
    const html = [
      "<style>p { color: red }</style>",
      "<p>Hello world</p>",
      "<svg><text>No riders</text></svg>",
      "<details><summary>Record</summary><p>hidden words here</p><details><summary>Inner</summary>more</details></details>",
      '<span data-required>Photo credit text</span>',
      "<p>2 in ball, 2,995 lb</p>",
    ].join("");
    expect(visibleWords(html)).toBe(4); // Hello, world, Record, ball
  });
});

describe("number traceability helpers", () => {
  it("normalises drawn numbers", () => {
    expect(numbersIn("≥ 2,995 lb")).toEqual(["2995"]);
    expect(numbersIn("≈ ½")).toEqual(["1/2"]);
    expect(numbersIn("2-5/16 in")).toEqual(["2-5/16"]);
    expect(numbersIn("≤ 15°")).toEqual(["15"]);
    expect(numbersIn("≈ 60%")).toEqual(["60"]);
  });

  it("reads numbers, fractions and fraction words from source text", () => {
    expect([...numbersStated("hold UP until the body is about halfway up")]).toContain("1/2");
    expect([...numbersStated("Raise to about three-quarters")]).toContain("3/4");
    const towing = numbersStated("Every 50 miles or hour of towing");
    expect(towing.has("50") && towing.has("1")).toBe(true);
    expect([...numbersStated("a 2-5/16 inch ball rated 14,000 lb")]).toEqual(expect.arrayContaining(["2-5/16", "14000"]));
  });
});
