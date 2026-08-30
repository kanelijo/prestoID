# Google Drive ➔ Gemini Agent & OCR ➔ Real-Time Ingestion Engine

This engine automatically monitors your 5 TB Google Drive folders, reads PDF books, mock tests, and previous year papers using **Gemini Multimodal Document OCR**, and publishes complete tests with questions, options, and explanations into Supabase `public_tests` in real time.

---

## 1. Which Google Drive Access to Choose?

👉 **CHOOSE: Google Cloud Service Account (Recommended 100%)**

### Why Service Account?
- **Zero Login Prompts**: Never asks you to click "Log In" in a web browser.
- **Autonomous**: Runs continuously in the background on your machine or cloud server.
- **Safe & Scoped**: Only has access to the specific folders you explicitly share with it in your 5 TB Google Drive.

---

## 2. 3-Minute Setup Guide

### Step 1: Create Service Account in Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. In the top search bar, search for **Google Drive API** and click **Enable**.
3. In the left menu, navigate to **IAM & Admin** ➔ **Service Accounts**.
4. Click **Create Service Account**:
   - Name: `mocks-drive-bot`
   - Click **Create and Continue**, then click **Done**.
5. Click on your newly created service account ➔ Go to the **Keys** tab:
   - Click **Add Key** ➔ **Create new key** ➔ Select **JSON** ➔ Click **Create**.
6. A JSON key file will download to your computer.
7. Rename this file to **`service_account.json`** and place it in this folder:
   `Test Engine/drive extractor/service_account.json`

---

### Step 2: Share Your 5 TB Drive Folders With the Bot
1. Open your downloaded `service_account.json` and copy the `"client_email"` (it looks like `mocks-drive-bot@your-project.iam.gserviceaccount.com`).
2. Go to your [Google Drive](https://drive.google.com).
3. Right-click the folder(s) where you keep your test PDFs (e.g. `MPPSC`, `JEE`, `NEET`, `SSC`).
4. Click **Share** ➔ Paste the service account email ➔ Set permission as **Editor** ➔ Click **Send**.

---

### Step 3: Configure Folder IDs in `.env` or `config.js`
In your Google Drive browser URL, copy the string at the end:
`https://drive.google.com/drive/folders/`**`1a2b3c4d5e6f7g8h9i`**

Add to your `.env`:
```env
DRIVE_FOLDER_MPPSC=1a2b3c4d5e6f7g8h9i
DRIVE_FOLDER_JEE=2b3c4d5e6f7g8h9i0j
DRIVE_FOLDER_NEET=3c4d5e6f7g8h9i0j1k
DRIVE_FOLDER_SSC=4d5e6f7g8h9i0j1k2l
```

---

## 3. How to Run

Run the automated ingestion pipeline anytime:
```powershell
node "Test Engine\drive extractor\index.js"
```

### Instant Local Drop Alternative:
If you haven't set up the Service Account yet, you can also drop any PDF directly into:
`Test Engine/drive extractor/local_drop/`
and run `node "Test Engine/drive extractor/index.js"`. The Gemini Agent will process and ingest it immediately!
