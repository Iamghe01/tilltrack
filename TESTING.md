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

## B. With your free Gemini key
- [ ] Settings → **Gemini (simple)** → paste key → **Test connection** shows green text.
- [ ] Scan tab: the yellow "add your key" box has gone.
- [ ] **Take a photo** of a real receipt. The camera permission prompt appears the first time.
- [ ] "Reading the receipt…" finishes in under a minute.
- [ ] Review screen: store, date, items, prices and total are mostly right. Note anything the AI got wrong.
- [ ] Any yellow warnings make sense, for example "items add up to…".
- [ ] Fix a line, change a category, delete a line, **Save receipt**.
- [ ] Scan the **same** receipt again. You get the "Already saved?" warning.
- [ ] **Choose from gallery** works with a screenshot or an older photo.
- [ ] Turn on airplane mode and scan. You get a clear "Couldn't reach Gemini" message and a **Try again** button.

## C. Feel and looks
- [ ] Text is readable and nothing is cut off on your screen size.
- [ ] Buttons are easy to hit with your thumb.
- [ ] The keyboard doesn't cover the field you're typing in on the review screen.
- [ ] The back gesture and button behave as you expect.
- [ ] Close the app fully and reopen it. All data is still there.

## What to send back
For each problem, send the step letter and number, what you expected, what happened, and a screenshot if you can. For wrong scans, also send the receipt photo, so the AI instructions can be improved.
