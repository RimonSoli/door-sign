# Door Sign

An always-on status sign for an office door tablet, updated from any phone or computer.

- **docs/**: the website, served by GitHub Pages.
  - `index.html`: the sign the tablet shows. No login needed.
  - `edit.html`: the editor. Sign in with the owner account to change the status, colors, fonts, emoji, photo and the tablet lock code.
- **android/**: the Door Sign app. On first launch it asks whether it's the door tablet or your phone.
  - Tablet: shows the sign full screen, keeps the screen on, pins itself, and sends Back to the lock keypad. The tablet menu (after the code) can open the editor; it returns to the sign after saving, on Back, or after 2 idle minutes.
  - Phone: opens straight into the editor, stays signed in, no lock code.
- **firestore.rules**: who can read and change the status. Paste it into Firebase → Firestore Database → Rules.
- **.github/workflows/build-app.yml**: builds the app automatically and posts `DoorSign.apk` on the Releases page.

## Using it

- Edit the sign: open `https://rimonsoli.github.io/door-sign/edit.html` and sign in.
- Edit from the tablet: press Back, enter the lock code, choose **Edit the status**.
- Change a device's type: tablet menu → **Use this device as my phone instead**, or on the phone **App settings** → **Use this device as the door tablet**.
- Screen schedule (tablet): press Back, enter the code, choose **Screen schedule**. Set the on and off times and whether the screen stays off on weekends. Outside those hours the screen goes black and the tablet is allowed to sleep; tap it to show the sign for a minute.
- Leave the tablet app: press Back, enter the 4-digit lock code, then choose **Exit and unlock the tablet**.
- If the tablet has no internet and a lock code is set, Back does nothing. Hold **Back** and **Recents** together and enter the tablet's own PIN to unpin it.

## Notes

- Photos are shrunk in the browser and saved with the status, so Firebase's free plan is enough.
- The lock code is stored scrambled, but it is a 4-digit code. It keeps passers-by out; it is not bank-grade security.
- The app's signing key is in `android/app/door-sign.keystore` so updates install over older versions. It's only for this personal app.
