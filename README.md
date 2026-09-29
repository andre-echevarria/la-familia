# La Familia

Find the Chusma. Save the Family. A family party game where everyone plays on their own phone and a live narrator reads the story.

## Put it online (about 15 minutes, free)

You need two free accounts: **GitHub** (stores the code) and **Render** (runs the game).

1. **Upload the code to GitHub.** Sign in at github.com, click **+** then **New repository**, name it `la-familia`, and click **Create repository**. On the next page, click **uploading an existing file**. Drag in everything inside this folder (not the folder itself), then click **Commit changes**.
2. **Start it on Render.** Sign in at render.com with your GitHub account. Click **New +** then **Blueprint**, pick the `la-familia` repository, and click **Apply**. Render reads `render.yaml` and sets everything up.
3. **Open your link.** After a few minutes Render shows a web address like `https://la-familia-xxxx.onrender.com`. That's the game. Bookmark it.

Heads-up: on the free plan, the game goes to sleep after about 15 minutes with nobody using it. The first time you open it, give it up to a minute to wake up. Open it a minute before game night starts.

## How to play

- **Narrator:** open the link, tap **Be the narrator**, and show everyone the party code or QR code.
- **Players:** scan the QR code or open the link, enter the code and your name, and pick Primo or Prima.
- When at least 5 players have joined, the narrator taps **Deal the cards** and reads the lines on their screen. The merengue plays from the narrator's phone at night, so turn the volume up.
- If someone's phone locks or the page reloads, they just open the link again and they're put right back in the game.

## Try it alone

Open the link with `?test=1` at the end (for example `https://your-link.onrender.com/?test=1`) and tap **Be the narrator**. You'll see an **Add a test bot** button that fills the party with bots, which play randomly. Join from your own phone as a player to see both sides.

## Change the words

Everything the narrator reads, the role descriptions, and the party scenarios are in `content.js`. Edit the text, upload the file to GitHub again, and Render updates the game automatically.

## For the tech-curious

- `game.js` holds the rules, `server.js` runs the rooms, and `public/` has the phone screens.
- `npm test` plays 3,000 simulated games to check the rules.
- To run it on your own computer, install Node.js, then run `npm install` and `npm start`, and open http://localhost:3000.
