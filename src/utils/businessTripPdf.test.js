import test from "node:test";
import assert from "node:assert/strict";
import { extractLocationFromText, parseCondensedDateRange, resolveTravelDateRange } from "./businessTripPdf.js";

test("parses a condensed business-trip range with a shared month and year", () => {
  assert.deepEqual(parseCondensedDateRange("Thời gian: Từ 07-11/11 /2026"), {
    departureDate: "2026-11-07",
    returnDate: "2026-11-11",
  });
});

test("prefers the condensed start date over a layout match on the shared end date", () => {
  assert.deepEqual(resolveTravelDateRange(
    "Thời gian: Từ 07-11/11 /2026",
    { departureDate: "2026-11-11", returnDate: null },
  ), {
    departureDate: "2026-11-07",
    returnDate: "2026-11-11",
  });
});

test("stops location before any following bullet field", () => {
  const text = " Địa điểm: Đặc khu Cô Tô - Quảng Ninh.  Thông tin bổ sung: Theo thông báo sau";
  assert.equal(extractLocationFromText(text), "Đặc khu Cô Tô - Quảng Ninh");
});
