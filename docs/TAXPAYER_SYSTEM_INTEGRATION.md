# Taxpayer System Integration

## Official Sources Reviewed
- `RC_IITP_IS_V7_7_1.pdf`: official invoice payload specification, version 7.7.1.
- `tax-collect-data-sdk-java-tax-collect-data-sdk-2.0.28.zip`: official Java SDK for certificate-based v2 sending.
- `راهنمای کاربری SDK اتصال به زیرسامانه_ی جمع_آوری java_6.pdf`: v2 SDK guide.
- `tax-collect-data-sdk-java-tax-collect-data-sdk-0.0.56.zip`: official Java SDK for no-certificate legacy sending.
- `راهنمای اتصال به زیرسامانه جمع آوری SDK بدون گواهی-جاوا_8.pdf`: no-certificate SDK guide.

## Supported Modes
- `certificate_v2`
  - User has private key and signing certificate.
  - Base URL: `https://tp.tax.gov.ir/requestsmanager`
  - API prefix: `/api/v2`
  - Flow: nonce -> JWS authorization -> invoice JSON JWS -> JWE -> packet `{ payload, header: { requestTraceId, fiscalId } }`.
- `no_certificate_legacy`
  - User does not have a certificate, but still must have a valid private key for the fiscal memory.
  - Base URL: `https://tp.tax.gov.ir/req/api/self-tsp`
  - Flow: `GET_SERVER_INFORMATION` and `GET_TOKEN` through legacy sync packets, then encrypted async invoice packet.

## Storage
- Settings are stored in `taxpayer_settings`.
- `integration_mode` chooses the send protocol.
- Private keys are encrypted at rest with `TAXPAYER_SECRET_ENCRYPTION_KEY`.
- Certificates are required only for `certificate_v2`.
- `taxpayer_invoice_submissions.integration_mode` records which path sent each invoice.

## Legacy No-Certificate Rules
- Transfer request body must be `{ signature, signatureKeyId?, packet }` or `{ signature, signatureKeyId?, packets }`.
- The legacy request body must not include `time`.
- `signatureKeyId` must not be included in packet normalization when it is null or empty.
- Async packet signing with Authorization must normalize the token without the `Bearer ` prefix.
- `GET_SERVER_INFORMATION` and `GET_TOKEN` are sent with packet encryption/signing disabled, but the transfer request itself is still signed.

## Invoice Payload Rules
- `sstid` remains a string. Do not coerce it to number.
- `mu` must come from the official taxpayer-system measure unit code stored on the product or invoice row.
- For a billboard item, `sstt` is built as `اجاره تابلوی تبلیغاتی + نوع تابلو + آدرس کامل`; when the full address is empty, city and short address are used. Regular products use only their product name unless the sender explicitly enables item details.
- `indatim` is the issue date/time and is sent as a valid Unix timestamp in milliseconds. `indati2m` is not sent for ordinary invoices; the official specification reserves it for exceptional cases such as invoices issued under articles 9 and 12 of the taxpayer-terminal law.
- For a legal buyer (`tob = 2`), only its 11-digit economic code is sent in `tinb`; `bid` and `bpc` are omitted.
- For a real buyer (`tob = 1`), the national code (`bid`) is normalized as a 10-digit numeric string. If a leading zero was lost in stored customer data, 8-9 digit values are left-padded and then checked with the Iranian national-code checksum before sending. A real buyer with an economic code is sent using `tinb` instead.
- The current product control prevents submission when the issue date is more than 12 days old. It does not alter the accounting date; any correction must reflect the actual financial event.
- Money is sent in rial; company currency `IRT` is multiplied by 10 and `IRR` is sent as-is.
- Settlement fields are mapped as:
  - cash: `setm = 1`, `cap = tbill`, `insp = null`
  - credit: `setm = 2`, `cap = null`, `insp = tbill`
  - mixed: `setm = 3`, `cap` from received amount, `insp = tbill - cap`

## Deployment Checklist
1. Apply `database_v1_phase71_taxpayer_system.sql`.
2. Apply `database_v1_phase134_taxpayer_system_dual_mode.sql`.
3. Apply `database_v1_phase345_taxpayer_invoice_submission_metadata.sql`.
4. Ensure `TAXPAYER_SECRET_ENCRYPTION_KEY` exists in the functions runtime.
5. Deploy `taxpayer_system`.
6. In settings, choose `certificate_v2` or `no_certificate_legacy`.
7. Run `test_connection`, then send one normal sales invoice and run inquiry.
