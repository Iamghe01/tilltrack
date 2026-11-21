# TillTrack: receipt scanner and spending tracker (Android)

Take a photo of a receipt. An AI reads every line, either **Google Gemini directly** (simplest, needs only a free key) or **FreeLLMAPI** (your own router across many free providers). TillTrack then tracks:

- **Spending by week, month and year**, with a trend chart, a comparison with the previous period, trips, items and average spend per trip
- **Categories**: 18 fixed categories, each with its own colour, shown as a share of your spending
- **Every item**: times bought, total quantity, total spent, latest, average and lowest price, and whether the price went up or down since last time
- **Time between purchases**: the gap since the previous purchase, your usual gap, and the date you're likely to need the item again. Items are marked *Stocked*, *Soon*, *Due now* or *Overdue*
- **Time to rebuy** list on the Overview tab
- **Top stores**, a **monthly budget** bar, **duplicate-scan warning**, **CSV export**, manual entry, and a full editor to fix anything the AI misread
- **Rename or merge** items, so "ALM MILK 1L" and "Almarai Milk 1L" count as one product

All data is stored on the phone (SQLite). Nothing goes to a cloud account.

---

## Quick start (phone only, Gemini)

1. **Get a free Gemini key.** Go to aistudio.google.com/apikey, sign in with Google, tap **Create API key** and copy it.
2. **Build the APK in the cloud.** You need Node.js 20 or newer, from a computer or Termux on Android:
   ```bash
   cd tilltrack
   npm install
   npx eas-cli login          # free account at expo.dev
   npx eas-cli build -p android --profile preview
   ```
   Wait about 10–20 minutes, then open the link and install the APK.
3. **Connect the app.** Open **Settings**, choose **Gemini (simple)**, paste the key, leave the model as `gemini-flash-latest`, then tap **Test connection** and **Save settings**.
4. **Scan.** Go to the **Scan** tab and take a photo.

TillTrack uses native modules (SQLite, camera, image resizing), so it needs this build. It doesn't run in the Expo Go app. If you have Android Studio, `npx expo run:android` builds it locally instead. For live reloading while you change code, build `--profile development`, then run `npx expo start --dev-client`.

> **Privacy:** on Gemini's free tier, Google may use what you send to improve its products. Receipts can show card digits and loyalty numbers, so use the paid tier or FreeLLMAPI if that matters to you.

## Free APK build on GitHub (no computer, no Termux)

The `.github/workflows/build-apk.yml` file builds the APK on GitHub's free servers.

1. Put this project in a GitHub repository, on the `main` branch.
2. Each time you push, the **Actions** tab runs "Build Android APK", which takes about 15–25 minutes.
3. When it finishes, open the repository's **Releases** on your phone, download `TillTrack-N.apk` and install it.

You can also start a build by hand: **Actions → Build Android APK → Run workflow**. Public repositories get unlimited free Actions minutes. Private ones get a free monthly allowance, which is plenty for this app.

## Optional: FreeLLMAPI instead of Gemini

Use this if you want automatic failover across many free providers.

**On a computer (Docker):**
```bash
git clone https://github.com/tashfeenahmed/freellmapi
cd freellmapi
# Read install.sh / docker-compose.yml first, then start it with LAN access enabled:
HOST_BIND=0.0.0.0 docker compose up -d
```
Open `http://localhost:3001`, add provider keys on the **Keys** page, turn on a **Vision** model in the **Fallback Chain**, and copy the unified `freellmapi-…` key. In the app, set the server to `http://<computer-wifi-ip>:3001/v1`. Use `HOST_BIND=0.0.0.0` only on your home Wi-Fi.

**On the same phone (Termux, experimental):** install Termux from F-Droid, then:
```bash
pkg install -y nodejs-lts git termux-api
git clone https://github.com/tashfeenahmed/freellmapi.git
cd freellmapi && npm install --no-audit --no-fund
termux-wake-lock && npm run dev
```
The dashboard opens at `http://localhost:5173`. In the app, set the server to `http://127.0.0.1:3001/v1`.

In the app's **Settings**, choose **FreeLLMAPI**, then enter the server, the `freellmapi-…` key and the model `auto`.

## How a scan works

1. The photo is resized to 1600 px wide as a JPEG, which keeps uploads fast and saves free quota. A copy is kept on the phone.
2. **Gemini:** it is sent to `models/gemini-flash-latest:generateContent` as inline image data, in JSON output mode. **FreeLLMAPI:** it is sent to `POST /v1/chat/completions` as an OpenAI `image_url` part with `model: "auto"`, and FreeLLMAPI only routes image requests to vision models.
3. The model returns JSON with store, date, items, category, quantity, unit price, line total, VAT and total. The app checks it, fixes number formats, rejects future dates, and warns you if the lines don't add up to the total.
4. You review and edit the result, then save.

## Project layout

```
src/app/(tabs)/index.tsx      Overview: week, month and year totals, trend, budget, rebuy list, categories, stores
src/app/(tabs)/items.tsx      Every product with its purchase stats
src/app/(tabs)/scan.tsx       Camera, gallery or manual entry, then the AI read
src/app/(tabs)/receipts.tsx   Receipts grouped by month, with search
src/app/(tabs)/settings.tsx   FreeLLMAPI connection, currency, budget, week start, export
src/app/receipt/[id].tsx      Review and edit a receipt
src/app/item/[key].tsx        Item detail: rebuy prediction, price history, timeline
src/lib/ai.ts                 Gemini and FreeLLMAPI calls, prompt and JSON checking
src/lib/stats.ts              Periods, totals and repurchase-gap maths (no React Native code, easy to test)
src/lib/db.ts                 SQLite schema and queries
```

`npm test` runs the stats and parser tests, plus API tests against fake Gemini and FreeLLMAPI servers.

## Troubleshooting

| Message | Fix |
|---|---|
| Gemini rejected the API key | Create a new key at aistudio.google.com/apikey and paste it again. |
| Hit the Gemini free limit | Wait a minute. Daily limits reset at midnight Pacific time. |
| Model not found | Set the model back to `gemini-flash-latest`. **Test connection** lists the models your key can use. |
| Couldn't reach FreeLLMAPI | Check the phone and computer are on the same Wi-Fi, you used `HOST_BIND=0.0.0.0`, and the IP is right. Your computer's firewall may need to allow port 3001. |
| No vision model is turned on | Turn on a Vision model in FreeLLMAPI's Fallback Chain. |
| Rate-limited | Wait a minute, or add keys from more providers. |
| Items don't add up | The model missed or misread a line. Fix it in the editor before saving. |
