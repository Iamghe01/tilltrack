# Testing TillTrack on your phone

This takes about 15 minutes. Tick each box. If anything looks wrong, take a screenshot and note which step it was.

## A. Without a key (sample data)
- [ ] The app opens on Overview and shows "Scan your first receipt".
- [ ] **Try it with sample receipts** fills the app with about 4 months of data in a few seconds.
- [ ] Overview: switch **Week / Month / Year**. Use the arrows to go back a period. The total, chart and categories change.
- [ ] The "% more/less than this point last month" line appears under the total.
- [ ] **Time to rebuy**: tap an item and it opens the item screen.
- [ ] **Items** tab: search "milk". Try each sort: Recent, Rebuy, Often, Spent. Tap a category chip.
- [ ] Item screen: the "every X days" box, the price bars, the history and **Show all** all work.
- [ ] **Rename or merge**: rename "Tomatoes" to "Tomato". It reopens with the same history.
- [ ] **Receipts** tab: search "lulu". Open a receipt, change a price, **Save changes**. The Overview total changes to match.
- [ ] **Settings**: type a monthly budget. "✓ Changes saved" appears. The budget bar shows on Overview.
- [ ] **Export to CSV**: the share sheet opens. Send it to yourself and check it opens in a spreadsheet app.
- [ ] **Remove sample receipts** empties the app again.

## B. Scanning
- [ ] **Without a key:** scan a receipt. It should finish in a few seconds ("Read on your phone…") with items you can edit.
- [ ] Settings → **Gemini (simple)** → paste key → **Test connection** shows green text.
- [ ] Settings → How receipts are read → **Fast** (the default).
- [ ] **Take a photo**, then crop to just the receipt. The seconds counter shows how long it takes. Most scans should take under 15 seconds.
- [ ] The review screen shows the info line, e.g. "Read on your phone, tidied by Gemini in 6.3 s".
- [ ] Turn on airplane mode and scan. You should still get items, with a note that the AI couldn't help.
- [ ] **Cancel** during a scan returns you to the Scan screen.
- [ ] Scan the **same** receipt again. You get the "Already saved?" warning.
- [ ] Settings → **Recent scans** lists each scan with its time and result. Screenshot it if scans fail.

## B2. Typing a receipt in
- [ ] Scan tab → **Enter it manually**.
- [ ] Tap a store chip and **Yesterday**.
- [ ] Tap 2 of the "usually buy" chips. They're added with their last price.
- [ ] Type "mil". Suggestions appear. Tap one to add it.
- [ ] Type a new item, set the quantity with **+**, type a price, press **+**. It's added and the total updates.
- [ ] Use **− / +** on an item. Going below 1 removes it.
- [ ] Tap an item to edit its name, category or price.
- [ ] **Save**. It shows on Overview and Receipts.

## C. Feel and looks
- [ ] Text is readable and nothing is cut off on your screen size.
- [ ] Buttons are easy to hit with your thumb.
- [ ] The keyboard doesn't cover the field you're typing in on the review screen.
- [ ] The back gesture and button behave as you expect.
- [ ] Close the app fully and reopen it. All data is still there.

## What to send back
For each problem, send the step letter and number, what you expected, what happened, and a screenshot if you can. For wrong scans, also send the receipt photo, so the AI instructions can be improved.
