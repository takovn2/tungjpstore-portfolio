-- payOS may assign a virtual account per payment link. Persist the signed or
-- strictly recovered destination so QR rendering and webhook matching do not
-- incorrectly assume the merchant's base settlement account.
ALTER TABLE shop_payment_attempts ADD COLUMN provider_bank_bin TEXT;
ALTER TABLE shop_payment_attempts ADD COLUMN provider_account_number TEXT;

