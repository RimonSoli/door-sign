# Door Sign

An always-on status sign for an office door tablet, updated from any phone or computer.

- **docs/**: the website, served by GitHub Pages.
  - `index.html`: the sign the tablet shows. No login needed.
  - `edit.html`: the editor. Sign in with the owner account to change the status, colors, fonts, emoji, photo and the tablet lock code.
- **android/**: the tablet app. It shows the sign full screen, keeps the screen on, pins itself, and sends the Back button to the sign's lock keypad.
- **firestore.rules**: who can read and change the status. Paste it into Firebase → Firestore Database → Rules.
- **.github/workflows/build-app.yml**: builds the app automatically and posts `DoorSign.apk` on the Releases page.

## Using it

- Edit the sign: open `https://<username>.github.io/door-sign/edit.html` and sign in.
- Leave the tablet app: press Back, enter the 4-digit lock code, then choose **Exit and unlock the tablet**.
- If the tablet has no internet and a lock code is set, Back does nothing. Hold **Back** and **Recents** together and enter the tablet's own PIN to unpin it.

## Notes

- Photos are shrunk in the browser and saved with the status, so Firebase's free plan is enough.
- The lock code is stored scrambled, but it is a 4-digit code. It keeps passers-by out; it is not bank-grade security.
- The app's signing key is in `android/app/door-sign.keystore` so updates install over older versions. It's only for this personal app.
