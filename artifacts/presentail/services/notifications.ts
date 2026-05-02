import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";

export type NotificationStatus =
  | "not_determined"
  | "prompted"
  | "granted"
  | "denied"
  | "skipped";

const STORAGE_KEY = "presentail_notification_status";

export async function getNotificationStatus(): Promise<NotificationStatus> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    if (
      v === "not_determined" ||
      v === "prompted" ||
      v === "granted" ||
      v === "denied" ||
      v === "skipped"
    ) {
      return v;
    }
  } catch {
    // ignore
  }
  return "not_determined";
}

export async function saveNotificationStatus(
  status: NotificationStatus
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, status);
  } catch {
    // ignore — best effort
  }
}

export async function getNativePermissionStatus(): Promise<NotificationStatus> {
  if (Platform.OS === "web") return "not_determined";
  try {
    const res = await Notifications.getPermissionsAsync();
    if (res.granted) return "granted";
    if (res.canAskAgain === false && res.status !== "granted") return "denied";
    return "not_determined";
  } catch {
    return "not_determined";
  }
}

export async function requestPermission(): Promise<NotificationStatus> {
  if (Platform.OS === "web") {
    await saveNotificationStatus("skipped");
    return "skipped";
  }
  try {
    const res = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    const next: NotificationStatus = res.granted ? "granted" : "denied";
    await saveNotificationStatus(next);
    return next;
  } catch {
    await saveNotificationStatus("denied");
    return "denied";
  }
}

export async function openSystemSettings(): Promise<void> {
  try {
    if (Platform.OS === "ios") {
      await Linking.openURL("app-settings:");
    } else {
      await Linking.openSettings();
    }
  } catch {
    // ignore — nothing else we can do
  }
}
