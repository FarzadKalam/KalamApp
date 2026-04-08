# Taxpayer System Integration

## Source of truth
- Official Modian PDF used for protocol review:                       `C:\Users\Elmira Dabagh\Downloads\Eitaa Desktop\???-??????????-???-????-?????-??-??????-??????.PDF`
- Official Java SDK reference reviewed locally:   `C:\Users\Elmira Dabagh\Downloads\??????? ?????? SDK ????? ?? ?????????_? ???_???? java_6.PDF`
- Main function: `supabase/functions/taxpayer_system/index.ts`
- Main UI form: `pages/Settings/ConnectionsTab.tsx`

## Product model
- Taxpayer-system settings are stored per organization.
- No global or default taxpayer credential must ever be used.
- The UI should stay close to common Iranian accounting software patterns.
- The visible fields in the connection form are intentionally minimal:
  1. Fiscal memory identifier
  2. Last serial from previous software
  3. Private signing key
  4. Signing certificate
- Seller economic code is read from company settings.
- Base URL is internal and is not shown in the UI.

## Current storage behavior
- Private keys are encrypted at rest with `TAXPAYER_SECRET_ENCRYPTION_KEY`.
- If the user leaves the private key field empty, the previously saved key is kept.
- If the user leaves the certificate field empty, the previously saved certificate is kept.
- The UI only shows status flags such as `has_private_key` and `has_certificate`; it does not echo the stored secret values back into the form.

## Invoice numbering rule
- `taxid` is built as `fiscalId + dateHex + serialHex + verhoeff`.
- Internal serial is reserved from `reserve_taxpayer_invoice_serial`.
- If the business provides a previous-software serial, the next serial starts from the number after that value.
- Example shown in the UI: in `ABCDEF04D2F000000009D7` the invoice serial part is `000000009D`.

## Current protocol notes
- Server information is fetched successfully from the self-tsp endpoint.
- The current blocker is still authentication/signature during `GET_TOKEN`.
- The latest observed production error is `GET_TOKEN: [4011] ????? ?????? ????? ??? ???? ????????.`
- This means invoice mapping/history UI can continue, but direct send is not production-ready until the auth flow is aligned with the official SDK behavior.

## Deployment checklist
1. Apply `database_v1_phase71_taxpayer_system.sql`.
2. Ensure `TAXPAYER_SECRET_ENCRYPTION_KEY` exists in the functions runtime.
3. Deploy `taxpayer_system`.
4. Confirm the build string returned by the function matches the latest deployed code.
5. Test `get_settings`, `save_settings`, `test_connection`, and then invoice send.
