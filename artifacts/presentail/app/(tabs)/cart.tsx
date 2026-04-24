import { Redirect } from "expo-router";
import React, { useEffect } from "react";
import { useCart } from "@/contexts/CartContext";

export default function CartTab() {
  const { openCart } = useCart();
  useEffect(() => { openCart(); }, []);
  return <Redirect href="/" />;
}
