import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";

import { API_BASE } from "@/lib/stripe";
import { getStoredStoreHeaders } from "@/lib/storeHeaders";

export type NotificationStatus =
  | "not_determined"
  | "prompted"
  | "granted"
  | "denied"
  | "skipped";

const STORAGE_KEY = "presentail_notification_status";
const DEVICE_ID_KEY = "presentail_device_id";
const PUSH_TOKEN_KEY = "presentail_push_token";
const CATEGORY_PREFS_STORAGE_KEY = "presentail_notification_category_prefs";

const ANDROID_DEFAULT_CHANNEL = "default";

export type NotificationCategory = "orders" | "delivery" | "drops";

export type NotificationCategoryPrefs = Record<NotificationCategory, boolean>;

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "orders",
  "delivery",
  "drops",
];

export const DEFAULT_CATEGORY_PREFS: NotificationCategoryPrefs = {
  orders: true,
  delivery: true,
  drops: true,
};

function isValidPrefs(v: unknown): v is NotificationCategoryPrefs {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.orders === "boolean" &&
    typeof o.delivery === "boolean" &&
    typeof o.drops === "boolean"
  );
}

export async function getCategoryPreferences(): Promise<NotificationCategoryPrefs> {
  try {
    const raw = await AsyncStorage.getItem(CATEGORY_PREFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidPrefs(parsed)) return parsed;
    }
  } catch {
    // ignore — fall through to defaults
  }
  return { ...DEFAULT_CATEGORY_PREFS };
}

export async function saveCategoryPreferences(
  prefs: NotificationCategoryPrefs
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CATEGORY_PREFS_STORAGE_KEY,
      JSON.stringify(prefs)
    );
  } catch {
    // ignore — best effort
  }
}

export async function setCategoryPreference(
  category: NotificationCategory,
  enabled: boolean
): Promise<NotificationCategoryPrefs> {
  const current = await getCategoryPreferences();
  const next = { ...current, [category]: enabled };
  await saveCategoryPreferences(next);
  return next;
}

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

// Generate (or load) a stable per-install device id. Used so guest devices
// can still receive push notifications scoped to the device, and so we can
// remove the right token on sign-out without depending on the user being
// signed in.
export async function getDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
  } catch {
    // ignore
  }
  const id = `dev-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    // ignore
  }
  return id;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_DEFAULT_CHANNEL, {
      name: "Presentail",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00414E",
    });
  } catch {
    // ignore — channel setup is best-effort
  }
}

function getProjectId(): string | undefined {
  const fromManifest =
    (Constants.expoConfig as any)?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId;
  return fromManifest ?? "4dfed5db-2405-4de3-bca5-0e0ce9da84c0";
}

// Fetch (or load cached) Expo push token for this device.
async function getDeviceToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  await ensureAndroidChannel();
  try {
    const projectId = getProjectId();
    const r = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (r?.data) {
      try {
        await AsyncStorage.setItem(PUSH_TOKEN_KEY, r.data);
      } catch {
        // ignore
      }
      return r.data;
    }
  } catch {
    // ignore — caller decides what to do
  }
  return null;
}

async function getCachedToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

// Register this device's Expo push token with the API server. Safe to call
// repeatedly — the server upserts on the token. Pass an authToken so the
// server can associate the token with the signed-in user; otherwise it is
// stored against the deviceId only.
export async function registerPushToken(opts: {
  authToken?: string | null;
  userId?: number | null;
} = {}): Promise<{ ok: boolean; token?: string }> {
  if (Platform.OS === "web") return { ok: false };
  // Only register when we have OS-level permission. Anything else creates
  // an undeliverable token that we'd then prune the next time the server
  // tries to push.
  const perm = await getNativePermissionStatus();
  if (perm !== "granted") return { ok: false };

  const token = await getDeviceToken();
  if (!token) return { ok: false };

  const deviceId = await getDeviceId();

  try {
    const storeHeaders = getStoredStoreHeaders();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...storeHeaders,
    };
    if (opts.authToken) headers.Authorization = `Bearer ${opts.authToken}`;

    const res = await fetch(`${API_BASE}/api/push/register`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        token,
        platform: Platform.OS === "ios" ? "ios" : "android",
        deviceId,
        userId: opts.userId ?? undefined,
        // Mirror the same store headers in the body so the server can
        // persist the user's currently-selected store on the push token
        // row. The scheduled sync uses these to scope silent
        // data_refresh pushes per store (Lebanon vs UAE Dubai vs UAE
        // Abu Dhabi).
        countryCode: storeHeaders["x-store-country"] ?? undefined,
        cityId: storeHeaders["x-store-city"] ?? undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return { ok: !!json?.ok, token };
  } catch {
    return { ok: false };
  }
}

// Remove this device's push registration server-side. Called on sign-out
// and account deletion. We delete by deviceId (so any token re-registered
// since the last cache write also goes), and additionally by token if we
// have one cached locally. The current auth token (if any) is sent so the
// server can authorize deletion of user-scoped rows — without it the
// server only deletes guest rows, which protects signed-in users from a
// drive-by deviceId-based unsubscribe.
export async function unregisterPushToken(opts: {
  authToken?: string | null;
} = {}): Promise<void> {
  if (Platform.OS === "web") return;
  const deviceId = await getDeviceId();
  const token = await getCachedToken();
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...getStoredStoreHeaders(),
    };
    if (opts.authToken) headers.Authorization = `Bearer ${opts.authToken}`;
    await fetch(`${API_BASE}/api/push/unregister`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        deviceId,
        token: token ?? undefined,
      }),
    });
  } catch {
    // ignore — best-effort
  }
  try {
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {
    // ignore
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
