# Split the bill (shared)

Everyone at the table opens the same link and adds what they had from their own phone.

    public/index.html            the app
    netlify/functions/bill.mjs   saves and loads bills (Netlify Blobs)
    netlify.toml                 tells Netlify where things are
    package.json                 the one dependency (@netlify/blobs)

## Deploy

Netlify Drop (drag-and-drop) can't run functions, so use one of these:

**GitHub (easiest long-term):** push this folder to a GitHub repo, then in Netlify:
Add new project → Import an existing project → pick the repo → Deploy.
No build command needed. Every push redeploys.

**Netlify CLI:**

    npm install
    npx netlify login
    npx netlify init        # or: npx netlify link  (to reuse your existing site)
    npx netlify deploy --prod

## Try it locally

    npm install
    npm run dev             # opens http://localhost:8888 with the function + a local blob store

Netlify Blobs needs no setup or keys; it's switched on automatically for functions.
