import { useDeliveryLocationContext } from "@/contexts/DeliveryLocationProvider";

export function useDeliveryLocation() {
  return useDeliveryLocationContext();
}
