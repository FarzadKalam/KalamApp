import { describe, expect, it } from "vitest";
import {
  buildReservationSlots,
  getReservationShiftsForDate,
} from "./reservationAvailability";

const settings = {
  slot_minutes: 30,
  weekly_schedule: {
    sat: { enabled: true, shifts: [{ start: "09:00", end: "10:30" }] },
  },
};

describe("reservation availability", () => {
  it("creates slots from the matching weekly shift", () => {
    const slots = buildReservationSlots({
      date: "2026-09-19",
      settings,
      capacity: 2,
      busyRanges: [],
    });
    expect(slots).toHaveLength(3);
    expect(slots[0]?.startLabel).toBe("09:00");
    expect(slots[0]?.remainingCapacity).toBe(2);
  });

  it("subtracts overlapping capacity and respects closed exceptions", () => {
    const slots = buildReservationSlots({
      date: "2026-09-19",
      settings,
      capacity: 2,
      busyRanges: [
        {
          startAt: "2026-09-19T05:30:00.000Z",
          endAt: "2026-09-19T06:00:00.000Z",
          quantity: 2,
        },
      ],
    });
    expect(slots[0]?.remainingCapacity).toBe(0);
    expect(
      getReservationShiftsForDate("2026-09-19", {
        ...settings,
        date_exceptions: [{ date: "2026-09-19", closed: true }],
      }),
    ).toEqual([]);
  });
});
