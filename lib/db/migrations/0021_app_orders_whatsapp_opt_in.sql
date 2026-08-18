-- WhatsApp order-updates opt-in captured at web checkout.
-- NULL = legacy row / client never sent the flag (e.g. mobile app);
-- TRUE/FALSE = explicit shopper choice. Target number is sender_phone.
ALTER TABLE app_orders ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean;
