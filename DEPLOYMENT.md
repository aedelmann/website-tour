# Deploying to Netlify

Your Silent Wanderers website is ready to deploy to Netlify! Follow these simple steps:

## Option 1: Deploy via GitHub (Recommended)

### Step 1: Create a GitHub Repository
1. Go to https://github.com/new
2. Create a new repository called `hugo-website-worldtour`
3. **Do NOT** initialize with README (we already have one)
4. Click "Create repository"

### Step 2: Push Your Code to GitHub
Run these commands in your terminal:

```bash
cd /Users/alexander/Documents/development/hugo-website-worldtour
git remote add origin https://github.com/YOUR_USERNAME/hugo-website-worldtour.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

### Step 3: Deploy to Netlify
1. Go to https://app.netlify.com/signup (sign up with GitHub)
2. Click "Add new site" → "Import an existing project"
3. Choose "GitHub" and authorize Netlify
4. Select your `hugo-website-worldtour` repository
5. Netlify will auto-detect the settings from `netlify.toml`
6. Click "Deploy site"

**That's it!** Your site will be live in 2-3 minutes at a URL like `random-name-123456.netlify.app`

### Step 4: Add Custom Domain (Optional)
1. In Netlify dashboard, go to "Domain settings"
2. Click "Add custom domain"
3. Enter `silentwanderers.com`
4. Follow the DNS configuration instructions
5. Netlify will automatically provision HTTPS certificate

---

## Option 2: Deploy via Netlify CLI

### Step 1: Install Netlify CLI
```bash
npm install -g netlify-cli
```

### Step 2: Login to Netlify
```bash
netlify login
```

### Step 3: Deploy
```bash
cd /Users/alexander/Documents/development/hugo-website-worldtour
netlify deploy --prod
```

---

## Option 3: Drag & Drop (Quick Test)

### Step 1: Build Your Site
```bash
cd /Users/alexander/Documents/development/hugo-website-worldtour
hugo --gc --minify
```

### Step 2: Deploy
1. Go to https://app.netlify.com/drop
2. Drag the `public` folder to the upload area
3. Your site will be live instantly!

**Note**: This method doesn't enable automatic deployments.

---

## What's Configured

Your `netlify.toml` file includes:

✅ Hugo version 0.121.2
✅ Automatic minification
✅ Security headers
✅ Caching for images, CSS, and JS
✅ Redirect from /posts/* to /post/*
✅ Deploy previews for pull requests

## Updating Your Site

After initial deployment via GitHub:

1. Make changes to your site locally
2. Commit and push:
   ```bash
   git add .
   git commit -m "Update blog post"
   git push
   ```
3. Netlify automatically rebuilds and deploys!

## Adding New Blog Posts

1. Create a new file in `content/post/`
2. Add front matter with `banner` image
3. Commit and push to GitHub
4. Netlify deploys automatically!

## Cost

**FREE** for your use case:
- 100GB bandwidth/month
- Unlimited sites
- Automatic HTTPS
- Custom domain support
- No credit card required

## Support

- Netlify Docs: https://docs.netlify.com/
- Hugo Docs: https://gohugo.io/documentation/
- Your site config: `netlify.toml`

---

## Tesla Charge Stats

Auto-updates `/charging/` from the **Tesla Fleet API** (Europe) charging history. Tokens stay in Netlify Functions + Blobs — never in the browser. The page hydrates from `GET /api/charging-stats`; if that snapshot is missing, it keeps the hardcoded May–Jul 2026 figures.

**Important:** this uses official Fleet API only (`fleet-api.prd.eu.vn.cloud.tesla.com`). Do not use `owner-api.teslamotors.com`. `charging_history` is Tesla-billed public/Supercharger sessions — not home charging. Do not call `vehicle_data` on a schedule (wakes the car).

### 1. Generate the EC keypair

```bash
./scripts/generate-tesla-key.sh
```

- Writes the **public** key to `well-known/appspecific/com.tesla.3p.public-key.pem`
- Hugo mounts `well-known/` → `static/.well-known/` (Hugo ignores real dotfolders under `static/`)
- Prints the **private** key once — paste it into Netlify as `TESLA_PRIVATE_KEY` (never commit it)

After deploy, Tesla must get **HTTP 200** (no redirect):

```bash
curl -sI https://silentwanderers.com/.well-known/appspecific/com.tesla.3p.public-key.pem
curl -s  https://silentwanderers.com/.well-known/appspecific/com.tesla.3p.public-key.pem
```

Expect `Content-Type: text/plain; charset=utf-8` (set in `netlify.toml`).

### 2. Create the Tesla app (Personal Use, EU)

1. Go to [developer.tesla.com](https://developer.tesla.com) → create an application (Personal Use).
2. Region: **Europe**. Add a payment method with a **low billing cap**.
3. Allowed origin: `https://silentwanderers.com`
4. Redirect URI: `https://silentwanderers.com/.netlify/functions/tesla-oauth-callback`
5. Scopes needed: `openid`, `offline_access`, `vehicle_device_data`, `vehicle_charging_cmds`
6. Note `Client ID` and `Client Secret`.

Virtual key pairing is **not** required for `charging_history`, but the public key must still be hosted — Tesla validates the app domain on partner register.

### 3. Netlify environment variables (dashboard only — never git)

| Variable | Purpose |
| --- | --- |
| `TESLA_CLIENT_ID` | App client id |
| `TESLA_CLIENT_SECRET` | App client secret |
| `TESLA_VIN` | Vehicle VIN (server-side only; never published) |
| `TESLA_PRIVATE_KEY` | PEM private key from the generate script |
| `TESLA_SETUP_SECRET` | Shared secret protecting oauth start + partner-register |
| `TESLA_FLEET_BASE` | Optional; defaults to `https://fleet-api.prd.eu.vn.cloud.tesla.com` |

Deploy the site so the PEM URL and functions are live.

### 4. Partner register (once, EU)

```bash
curl -s "https://silentwanderers.com/.netlify/functions/tesla-partner-register?secret=YOUR_SETUP_SECRET"
```

Uses `client_credentials` against the EU Fleet audience and `POST /api/1/partner_accounts` with domain `silentwanderers.com`. Idempotent-ish — returns Tesla’s response.

### 5. OAuth bootstrap (you as the vehicle owner)

```bash
# Open in a browser (must be logged into the Tesla account that owns the car):
https://silentwanderers.com/.netlify/functions/tesla-oauth?secret=YOUR_SETUP_SECRET
```

Approves scopes, then `tesla-oauth-callback` stores the **refresh token** in Netlify Blobs (`tesla` store). Each token refresh invalidates the previous refresh token — sync always persists the new one.

### 6. Confirm the public API + page

```bash
curl -s https://silentwanderers.com/api/charging-stats | head
```

- Scheduled sync: `tesla-charging-sync` every 6 hours (`0 */6 * * *`, including weekends).
- Manual trigger (optional): invoke `/.netlify/functions/tesla-charging-sync` from the Netlify UI.
- Open `/charging/` — numbers/map hydrate from the snapshot without rebuilding Hugo.
- On Tesla `401`, the last good snapshot is kept; the static fallback still renders if no snapshot exists.

### Architecture (quick map)

| Piece | Role |
| --- | --- |
| `netlify/functions/tesla-oauth.js` | Starts authorize redirect |
| `netlify/functions/tesla-oauth-callback.js` | Code → tokens → Blobs |
| `netlify/functions/tesla-charging-sync.js` | Refresh + paginate history + snapshot |
| `netlify/functions/charging-stats.js` | Public GET snapshot JSON |
| `netlify/functions/tesla-partner-register.js` | One-shot partner registration |
| `static/js/charging-stats.js` | Page hydration + Leaflet pins |

Public JSON never includes VIN, street address, cabinet IDs, home GPS, or live vehicle location.

---

**Need help?** Email: contactus@silentwanderers.com
