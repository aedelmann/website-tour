# Deploying to Netlify

Your Cristyne & Alex World Tour website is ready to deploy to Netlify! Follow these simple steps:

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
3. Enter `cristyneandalex.com`
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

**Need help?** Email: alexander.edelmann80@gmail.com
