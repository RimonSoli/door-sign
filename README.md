# Door Sign

An always-on status sign for each office door, controlled from a desk touchscreen and a phone.

Everyone has their own account. Their door tablet, desk touchscreen and phone all sign in with it,
and nobody can see or change anyone else's sign.

- **docs/**: the website, served by GitHub Pages. Changes here reach every device automatically.
  - `index.html`: the sign the door tablet shows. Signs in once with the owner's account.
  - `edit.html`: the editor (status list, colors, fonts, emoji, photo, schedules, tablet lock code). Saves to an iPhone home screen as an app.
  - `strip.html`: the desk touchscreen page (built for 1920×480). One tap sends a status to the door; swipe for more.
- **desktop/**: the Windows app **Door Sign Desk**. Shows `strip.html` full screen on the touchscreen strip, starts with Windows, sends the mouse back to the main screen if it wanders onto the strip (touch still works), and has a tray menu (choose screen, reload, open the editor, sign out, keep the mouse off, quit).
- **.github/workflows/build-desk.yml**: builds `DoorSignDesk-Setup.exe` and posts it on the Releases page (tags `desk-v…`).
- **android/**: the Door Sign app. On first launch it asks whether it's the door tablet or your phone.
  - Tablet: shows the sign full screen, keeps the screen on, pins itself, and sends Back to the lock keypad. The tablet menu (after the code) can open the editor; it returns to the sign after saving, on Back, or after 2 idle minutes.
  - Phone: opens straight into the editor, stays signed in, no lock code.
- **firestore.rules**: who can read and change the status. Paste it into Firebase → Firestore Database → Rules.
- **.github/workflows/build-app.yml**: builds the app automatically and posts `DoorSign.apk` on the Releases page.

## Adding a person

1. Firebase console → Authentication → Users → **Add user** (their email and a password).
2. Door tablet: install `DoorSign.apk`, choose **This is the tablet on the door**, sign in with their account.
3. Windows PC: run `DoorSignDesk-Setup.exe` from the latest `desk-v…` release, sign in on the strip.
4. Samsung phone: install `DoorSign.apk`, choose **This is my phone**, sign in.
5. iPhone: in Safari open `https://rimonsoli.github.io/door-sign/edit.html` → Share → **Add to Home Screen** → open it from the home screen and sign in.

## Using it

- Edit the sign: open `https://rimonsoli.github.io/door-sign/edit.html` and sign in.
- Switch the account on a door tablet: tablet menu → **Edit the status** → **Sign out**, then sign in on the sign screen.
- Preview border: red means your changes aren't on the sign yet; green means they were just sent.
- Statuses show as a 2-across grid of mini signs. Tap one to use or edit it; tap × then **Delete?** to remove it.
- Colors: tap a color to open the color picker (the same one as the Financial Tracker). It opens on the current color. **Save to palette** keeps a color for later on every device; **Edit** removes saved colors. Tick **Gradient** to blend the background into a second color.
- Automatic schedule: in the editor, pick a status and either daily times (with days) or a date range. While the time is running the sign shows that status, then goes back to the last status sent with Update sign. Date ranges win over daily times, and an Update sign during a scheduled time overrides it until that time ends.
- Edit from the tablet: press Back, enter the lock code, choose **Edit the status**.
- Change a device's type: tablet menu → **Use this device as my phone instead**, or on the phone **App settings** → **Use this device as the door tablet**.
- Screen schedule (tablet): press Back, enter the code, choose **Screen schedule**. Set the on and off times and whether the screen stays off on weekends. Outside those hours the screen goes black and the tablet is allowed to sleep; tap it to show the sign for a minute.
- Leave the tablet app: press Back, enter the 4-digit lock code, then choose **Exit and unlock the tablet**.
- If the tablet has no internet and a lock code is set, Back does nothing. Hold **Back** and **Recents** together and enter the tablet's own PIN to unpin it.

## Notes

- `docs/color-picker.js` is the shared color picker, ported from the Financial Tracker. Copy it into future apps and call `createColorPicker({ getPalette, setPalette })`, then `picker.open(currentHex, hex => …)`.

- Photos are shrunk in the browser and saved with the status, so Firebase's free plan is enough.
- The lock code is stored scrambled, but it is a 4-digit code. It keeps passers-by out; it is not bank-grade security.
- The app's signing key is in `android/app/door-sign.keystore` so updates install over older versions. It's only for this personal app.
