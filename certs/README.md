# Okta IdP certificate

Place your Okta SAML signing certificate here (do not commit the real file):

```bash
# Download from Okta: Applications → Your SAML app → Sign On → Identity Provider metadata
# Copy the X.509 certificate into:
certs/okta-idp.pem
```

Then in `.env`:

```
SAML_CERT_PATH=certs/okta-idp.pem
```

Add `certs/*.pem` to your local ignore habits; only `README.md` and `.gitkeep` are tracked.
