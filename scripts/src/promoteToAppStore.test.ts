import { describe, it, expect } from "vitest";
import { validateReleaseNotes } from "./promoteToAppStore.js";

describe("validateReleaseNotes", () => {
  describe("submit mode", () => {
    it("throws when notes start with 'TODO:' (exact case)", () => {
      expect(() =>
        validateReleaseNotes("TODO: replace with real release notes before submitting.", true),
      ).toThrow(/placeholder text/i);
    });

    it("throws when notes start with 'todo:' (lowercase)", () => {
      expect(() =>
        validateReleaseNotes("todo: replace with real release notes before submitting.", true),
      ).toThrow(/placeholder text/i);
    });

    it("throws when notes start with 'Todo:' (mixed case)", () => {
      expect(() =>
        validateReleaseNotes("Todo: replace with real release notes.", true),
      ).toThrow(/placeholder text/i);
    });

    it("does not throw for real release notes", () => {
      expect(() =>
        validateReleaseNotes("Bug fixes and performance improvements.", true),
      ).not.toThrow();
    });

    it("does not throw when 'TODO:' appears in the middle of the notes", () => {
      expect(() =>
        validateReleaseNotes("Fixed the thing. TODO: add more detail.", true),
      ).not.toThrow();
    });

    it("does not throw for notes that start with 'TODO' without a colon", () => {
      expect(() =>
        validateReleaseNotes("TODO replace this with real notes", true),
      ).not.toThrow();
    });
  });

  describe("dry-run mode", () => {
    it("does not throw even when notes start with 'TODO:' (placeholder is allowed in dry-run)", () => {
      expect(() =>
        validateReleaseNotes("TODO: replace with real release notes before submitting.", false),
      ).not.toThrow();
    });

    it("does not throw for real notes in dry-run mode", () => {
      expect(() =>
        validateReleaseNotes("New features and bug fixes.", false),
      ).not.toThrow();
    });
  });
});
