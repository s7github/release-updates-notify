# Brand assets

Sources for the generated images (ADR-0020). Run from `web/` with Python and Pillow:

```
python brand/make-logo.py        # public/brand/logo-512.png  (Google OAuth consent screen logo)
python brand/make-og-image.py    # public/og-default.png      (social card, 1200x630)
```

`public/favicon.svg` is hand-written. The OAuth logo is uploaded by hand in Google Auth Platform -> Branding.
