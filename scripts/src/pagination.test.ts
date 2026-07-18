import { describe, it, expect } from "vitest";
import { buildPaginationLinks, PAGINATION_PAGE_SIZE } from "./pagination.js";

const BASE = "/en-lb/beirut/category/flowers";

describe("PAGINATION_PAGE_SIZE", () => {
  it("is 24", () => {
    expect(PAGINATION_PAGE_SIZE).toBe(24);
  });
});

describe("buildPaginationLinks", () => {
  it("page 1 of 72 → next=/page/2, no prev", () => {
    const result = buildPaginationLinks(BASE, 1, 72, 24);
    expect(result.outOfRange).toBeUndefined();
    expect(result.prev).toBeUndefined();
    expect(result.next).toBe(`${BASE}/page/2`);
  });

  it("page 2 of 72 → prev=bare-url, next=/page/3", () => {
    const result = buildPaginationLinks(BASE, 2, 72, 24);
    expect(result.outOfRange).toBeUndefined();
    expect(result.prev).toBe(BASE);
    expect(result.next).toBe(`${BASE}/page/3`);
  });

  it("page 3 of 72 (last page) → prev=/page/2, no next", () => {
    const result = buildPaginationLinks(BASE, 3, 72, 24);
    expect(result.outOfRange).toBeUndefined();
    expect(result.prev).toBe(`${BASE}/page/2`);
    expect(result.next).toBeUndefined();
  });

  it("page 1 of exactly 24 products → single page, no prev or next", () => {
    const result = buildPaginationLinks(BASE, 1, 24, 24);
    expect(result.outOfRange).toBeUndefined();
    expect(result.prev).toBeUndefined();
    expect(result.next).toBeUndefined();
  });

  it("page 5 exceeds maxPage (3 for 72 products) → outOfRange: true", () => {
    const result = buildPaginationLinks(BASE, 5, 72, 24);
    expect(result.outOfRange).toBe(true);
    expect(result.prev).toBeUndefined();
    expect(result.next).toBeUndefined();
  });

  it("page 1 of 0 products → outOfRange: true", () => {
    const result = buildPaginationLinks(BASE, 1, 0, 24);
    expect(result.outOfRange).toBe(true);
  });

  it("page 0 (invalid) → outOfRange: true", () => {
    const result = buildPaginationLinks(BASE, 0, 72, 24);
    expect(result.outOfRange).toBe(true);
  });

  it("50 products (3 pages) — middle page 2 → prev=bare, next=/page/3", () => {
    const result = buildPaginationLinks(BASE, 2, 50, 24);
    expect(result.prev).toBe(BASE);
    expect(result.next).toBe(`${BASE}/page/3`);
  });

  it("4-page collection — page 3 → prev=/page/2, next=/page/4", () => {
    const result = buildPaginationLinks(BASE, 3, 96, 24);
    expect(result.prev).toBe(`${BASE}/page/2`);
    expect(result.next).toBe(`${BASE}/page/4`);
  });

  it("page exactly equals maxPage → no next", () => {
    const result = buildPaginationLinks(BASE, 4, 96, 24);
    expect(result.outOfRange).toBeUndefined();
    expect(result.next).toBeUndefined();
    expect(result.prev).toBe(`${BASE}/page/3`);
  });
});
