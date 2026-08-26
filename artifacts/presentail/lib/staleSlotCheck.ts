import {
  isSlotStillBookable,
  type SlotBookability,
  type TimeSlot,
} from "@workspace/delivery";

export function checkNativeStaleSlotSelection(opts: {
  deliveryMode: "express" | "today_slot" | "schedule";
  deliveryDate: string;
  slot?: TimeSlot | null;
  countryCode?: string | null;
  cityId?: string | null;
  now?: Date;
}): SlotBookability {
  if (opts.deliveryMode === "express") return { bookable: true };
  return isSlotStillBookable({
    deliveryDate: opts.deliveryDate,
    slot: opts.slot,
    countryCode: opts.countryCode,
    cityId: opts.cityId,
    now: opts.now,
  });
}