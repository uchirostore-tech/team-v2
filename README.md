# Khmer Dropshipping Team Hub

A Khmer-first team workspace for dropshipping training. It includes a persistent SQLite database, a shared learning-link library, shared lesson progress, team tasks, Khmer guides, a simple unit-economics calculator, and an authorized media workspace. No sign-up or sign-in is required: everyone opening the same site uses the same shared workspace.

## What is included

- 15 seeded YouTube lesson links supplied by the team: 9 marked Khmer and 6 marked English.
- Search and filter the lesson library, rename lessons, add a single link, or bulk-import up to 200 links per batch.
- YouTube lessons play using YouTube's official embeddable player.
- Lesson progress is shared across the workspace. Because sign-in is disabled, the app does not identify individual team members.
- Shared task board with typed responsible-person names (no accounts needed), due dates, and To Do / In Progress / Done states, plus one-click recommended starter tasks for product research, supplier checks, store setup, creative testing, and customer support.
- Khmer learning guides for physical dropshipping and digital-product reselling, original visual flow diagrams and product examples, product research, supplier checks, pricing, marketing, operations, licensing, and a 30-day action plan.
- Profit-per-order estimator.
- Team uploads for supported image, video, and audio files; image previews, multi-select, ZIP export, and file downloads.
- Optional FFmpeg processing for video files uploaded by your team: create 480p / 720p / 1080p / 2160p MP4 or extract MP3 with an embedded cover frame from the uploaded video when possible. The processor does not upscale above the source resolution.
- Data persists in `storage/team_portal.sqlite3`; uploaded files persist in `storage/uploads/`.

## Requirements

- Python 3.10 or newer.
- A modern browser.
- FFmpeg + FFprobe are optional and only required for video conversion/audio extraction.
- No Python package installation is required. The server uses Python's standard library and SQLite.

## Run on Windows

1. Extract the project folder.
2. Install Python 3.10+ if it is not already installed.
3. (Optional) Copy `.env.example` to `.env` only when you need to change the host or port.
4. Double-click `start_server.bat`.
5. Open `http://127.0.0.1:3888` on the computer running the server.
6. For teammates on the same trusted Wi-Fi/network, share `http://YOUR-COMPUTER-LAN-IP:3888` (for example, find the computer’s IPv4 address in Windows Network settings). Allow Python through the private-network firewall if Windows asks.
7. No account creation, password, or invite code is needed. Everyone sees and updates the same workspace. For a custom host or port, copy `.env.example` to `.env` and edit it before starting the server.

## Run on macOS / Linux

```bash
python3 server.py
```

Then open `http://127.0.0.1:3888`. On a trusted local network, teammates can use `http://YOUR-COMPUTER-LAN-IP:3888`.

## Deploy to Railway (recommended for a team using the site online)

This project is prepared for Railway. Railway supplies the web `PORT` automatically; the server listens on `0.0.0.0` and includes a health endpoint at `/api/health`. Choose the Singapore region if available to keep latency low for a team in Cambodia. The included `Dockerfile` installs FFmpeg so the uploaded-file MP3/video processing features can run on the deployed server.

### 1. Upload the project to GitHub

1. Create a new **private** GitHub repository.
2. Upload the contents of this project folder to the repository root (not the parent folder).
3. Do not upload `.env`, the local `storage/team_portal.sqlite3` database, or private uploads. The included `.gitignore` excludes them.

### 2. Create the Railway service

1. Sign in to [Railway](https://railway.com/).
2. Create a new Project → **Deploy from GitHub Repo** and select your repository.
3. Railway will detect the included `Dockerfile` and build the app. The container starts with `python server.py`; no Python packages need to be installed.
4. In the service's **Settings**, set the healthcheck path to `/api/health`.
5. Under **Networking**, choose **Generate Domain** after the first successful deployment.

### 3. Attach persistent storage (do not skip)

Railway's container filesystem is not persistent between deployments. The database and uploads must be stored on a Railway Volume:

1. Open the service's **Volumes** section and add a Volume.
2. Set its mount path to exactly `/data`.
3. Open **Variables** and add `DATA_DIR` with value `/data`.
4. Keep `HOST=0.0.0.0` if you set it manually. Do not hard-code `PORT`; Railway provides it.
5. Add `APP_SECURE_COOKIE` with value `1` (the Railway domain uses HTTPS).
6. Deploy/redeploy the service after adding the Volume and variable.

The app stores its SQLite database at `/data/team_portal.sqlite3` and uploaded media at `/data/uploads/`. The Volume keeps both across redeploys and restarts. Railway documents that Volumes are mounted at runtime, not during image build, which is why the app creates its storage directories when it starts.

### 4. Important public-access warning

You asked for **no sign-up and no sign-in**, so the live website uses one shared workspace. Anyone who can open the public Railway URL can view, add, edit, and delete lessons, tasks, and uploads. A hard-to-guess URL is not access control. Do not put private/customer data in this site or share the public URL widely. For a real business team, the safest next improvement is a simple shared team passcode (no member accounts) or hosting-level access restriction before public launch.

### 5. Verify the live service

After Railway reports the deployment as Active, open the generated domain. You can also check `https://YOUR-DOMAIN/api/health`; it should return JSON with `"ok": true`. Test by adding a task, uploading a small image, then redeploying once and confirming the task and image are still there.

Railway setup guide: [Deployments](https://docs.railway.com/deployments) · [Volumes](https://docs.railway.com/volumes) · [Variables](https://docs.railway.com/variables).

## Optional: enable video conversion

Install FFmpeg with FFprobe and ensure both commands are available in your system PATH. Restart the server after installation.

- Windows: install a trusted FFmpeg build and add its `bin` folder to PATH.
- macOS: `brew install ffmpeg`
- Debian / Ubuntu: `sudo apt install ffmpeg`

Select a video uploaded by your team in **ឯកសារ និង Media**, then choose an output. A 4K output is available only when the source video is at least 2160 pixels tall. Re-encoding can take time and needs free disk space.

## Adding many lessons

In **បណ្ណាល័យមេរៀន**, open **បន្ថែមមេរៀន** and paste one URL per line. You can also use:

```text
Product research lesson | https://example.com/lesson
https://www.youtube.com/watch?v=VIDEO_ID
```

A line without a title is saved with an automatic Khmer lesson title. You can edit the title and notes later.

## Media and download limitations

This workspace deliberately supports media files uploaded by your team and links that can be opened or embedded lawfully. It does **not** provide a universal downloader for every social network, remove creator/platform watermarks, bypass DRM, private-account controls, paywalls, or download restrictions. The YouTube terms allow viewing through the embeddable player and limit downloading or other use unless expressly authorized by YouTube or the rights holder. Use the platform's official download/export feature or get permission from the rights holder. For files the team owns or is authorized to process, upload them to this workspace first.

The ZIP tool archives selected images already uploaded to this workspace. It does not scrape galleries from third-party websites.

## Security and deployment notes

This is a functional self-hosted application for a trusted team, not a managed cloud service. Before exposing it to the public internet:

1. Important: sign-in is disabled. Anyone who can open the URL can view, add, edit, or delete shared workspace content.
2. Keep the site on a trusted local network or protect it with a VPN, private reverse-proxy access policy, or hosting-level access restriction. Do not expose the unauthenticated site openly to the public internet.
3. Use HTTPS behind a trusted reverse proxy and set `APP_SECURE_COOKIE=1` when using HTTPS.
4. Back up both the `storage/` folder and `.env` securely.
5. Configure server-level request limits, disk quotas, backups, monitoring, and malware scanning for uploaded files.
6. Run the server as a dedicated non-admin user. Do not use the development server as a high-traffic production deployment; use a production-grade WSGI/ASGI server or reverse-proxy deployment appropriate to your environment.

Without sign-in, lesson completion is shared under one workspace identity and is not attributed to individual people. Task owners can be typed by name directly into each task, so you can assign work without creating accounts.

## Data and backup

- Database: `storage/team_portal.sqlite3`
- Uploads: `storage/uploads/`
- Back up the entire `storage/` directory while the server is stopped, or use a SQLite-aware online backup process.
- Keep `.env` private. Do not upload it to a public repository.

## Project files

- `index.html` — Khmer-first interface and page structure.
- `styles.css` — responsive visual design.
- `data.js` — Khmer training content and learning references.
- `app.js` — front-end interactions and API client.
- `server.py` — database, anonymous shared workspace session, team APIs, uploads, ZIP generation, optional FFmpeg processing.
- `start_server.bat` — Windows launcher.
- `Dockerfile` — Railway/Linux container image with FFmpeg installed.
- `.dockerignore` — keeps local data and development files out of the container image.
- `.env.example` — configuration template.

## Content note

“Digital dropshipping” is used inconsistently online. This site describes a safer general approach: sell digital files that your team created or has a clearly documented commercial resale/distribution license for. Buying a copy of a file does not automatically grant resale rights. Check the actual license rather than assuming labels such as PLR or MRR grant unrestricted permission.
