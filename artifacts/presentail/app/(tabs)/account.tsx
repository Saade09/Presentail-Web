import * as WebBrowser from "expo-web-browser";
import { Redirect } from "expo-router";
import React, { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const WC_LOGIN_URL = "https://presentail.com/lebanon/login";
const WC_ACCOUNT_URL = "https://presentail.com/lebanon/my-account/";
const ACCOUNT_KEY = "@presentail/has-account";

export default function AccountTab() {
  useEffect(() => {
    async function open() {
      const v = await AsyncStorage.getItem(ACCOUNT_KEY);
      const url = v === "1" ? WC_ACCOUNT_URL : WC_LOGIN_URL;
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
      await AsyncStorage.setItem(ACCOUNT_KEY, "1");
    }
    open();
  }, []);
  return <Redirect href="/" />;
}
