# Prompt: voice every instruction line of a game

**How to use:** open Claude Code in the game's folder and paste everything below the line. Change the **Settings** block if you want a different voice, language or format. Nothing else needs editing.

---

You are a senior game developer and audio/LXD designer. Voice every instruction line in this game using the TTS studio **Ai Wala Human By Aamir** (https://ai-wala-human-by-aamir-809572708022.asia-southeast1.run.app/), then build the clips into the game so the narration feels designed in, not added on afterwards. Work through the steps in order, and keep me posted with short updates.

## Settings
- **Studio:** https://ai-wala-human-by-aamir-809572708022.asia-southeast1.run.app/ , tab *Batch Generation*
- **Language:** Hindi. The studio first rewrites each line in the language's script, then speaks it. English written in Devanagari ("Meet Miso!" → "मीट मिसो!") is spoken as English with an Indian accent, and the words stay English. Choose English for a neutral accent, or the matching language if the lines are written in it.
- **Voice:** Female Teacher (Standard), which is Gemini voice Kore with a clear North Indian accent
- **Studio download format:** MP3
- **Shipped format:** Ogg Opus, 32 kbps, mono
- **Clip ids:** vo001, vo002 … numbered in the order the learner first hears them
- **Paths** (adapt to the project's layout): clips in `assets/vo/`, script in `tools/vo_script.json`, line→clip map in `src/vo_lines.js`, player in `src/voice.js`, rebuild tool in `tools/vo_build.py`, documentation in `docs/VOICEOVER.md`

## Ground rules
- Never change the text the learner sees. Only the spoken form is rewritten.
- Every line the instruction panel can show gets a clip. That includes intros, prompts, idle reminders, right and wrong feedback, hints, scaffold steps, explanations, summaries, and lives and end screens. Template lines count once for each value the game actually fills in.
- Respect the studio's rate limit. Never try to get around it.
- Keep temporary files in the scratchpad. Only the clips, script, map, player, rebuild tool and documentation go into the repo.
- Don't commit or push unless I ask.

## Step 1: Check the studio before automating it
The studio is a single-page app. This is how it worked on 9 Oct 2026. Confirm each point is still true by loading it and listing its selects (with their options) and its buttons.
- There are two tabs, *Single Generation* and *Batch Generation*. Use *Batch Generation*.
- The batch takes an **.xlsx** file with a header row. Use two columns: `filename` (the clip id) and `text` (the spoken form).
- **Controls:**
  - Language: English, Hindi, Marathi, Telugu, Gujarati, Kannada, Tamil, Bengali, Malayalam, Punjabi or Odia. The option values are codes, for example `hi`.
  - Format: .WAV or .MP3.
  - Voice, 12 of them: Standard Indian (Clear), Classical Hindi (Calm), Urban Indian (Formal), Regional Teacher (Pedagogical), Youthful Indian (Energetic), Storyteller (Warm), Female Teacher (Standard), Male Teacher (Formal), Male Senior (Pedagogical), Male Child (Energetic), Female Child (Energetic), Female Narrator (Warm).
  - Text Column and Filename Column.
  - Start Row and Quantity.
  - Concurrency: 1, 3 (Recommended), 5 or 10.
- **Generate:** the start button reads `GENERATE (N)`, and its label changes once Quantity is filled in, so read it after filling. Match the text `GENERATE (` exactly. A looser match such as "Generat" also hits the *Batch Generation* tab.
- **Progress:** "Processing..." shows while it runs. Rows show Pending, Processing, Done or Failed, and a Retry button reruns the failed ones.
- **Download:** `DOWNLOAD ALL (.ZIP)` saves `voiceovers_batch.zip`, containing `voiceovers/<filename>.mp3` (24 kHz, mono, 128 kbps).
- **Each row makes two requests:** first `gemini-3-flash-preview` rewrites the text in the language's script, then `gemini-3.1-flash-tts-preview` speaks it.
- **Proxy:** the page's service worker sends every `https://generativelanguage.googleapis.com/<path>` request to the studio's own proxy at `<studio>/gemini-api-proxy/<path>?__applet_proxy=true` (use `&` if the path already has a query).
- **Rate limit:** 100 requests per 15 minutes per IP, enforced at the proxy. The response headers are `ratelimit-limit`, `ratelimit-remaining` and `ratelimit-reset` (seconds). Over the limit, it returns `429 Too many requests from this IP`. That allows about **48 lines per 15-minute window**, so 153 lines took four windows.

## Step 2: List every line, exactly as it is shown
- Take the lines from the game's own source of truth, such as its copy table, script or level data. Don't copy them from the design doc. Run each template with every value the game uses: each level's numbers, every hint step, the wrong path and the right path.
- Each key must be the exact plain string the panel ends up showing, after any markup or HTML is stripped. Keep the same characters: curly ’ quotes, the … ellipsis, − minus signs, subscripts ₁ₙ, ₹. Where you can, evaluate the lines in the running game (for example with Playwright `page.evaluate`) rather than retyping them.
- Remove duplicates, so a line shown in several places gets one clip.
- Write `tools/vo_script.json` as a list of `{ "id": "vo001", "line": "<as shown>", "spoken": "<as said>" }`.

## Step 3: Write the spoken form
The voice reads exactly what it is given, so write the maths and symbols out in words. The panel keeps the written form.
- `=` → "equals", `+` → "plus", `−` → "minus", `×` → "times", `÷` → "divided by". A negative number: −4 → "minus 4".
- Subscripts: a₁ → "a 1", aₙ → "a n".
- Use commas for grouping pauses: aₙ = a + (n − 1)d → "a n equals a plus, n minus 1, d".
- Currency and units: ₹50 → "fifty rupees", ½ km → "half a kilometre", 2¼ km → "two and a quarter kilometres", l → "litres".
- A list ending in "…": "3, 7, 11, 15, …" → "3, 7, 11, 15, and so on."
- Awkward tokens: "nth" → "n-th", "APs" → "A Ps", and spell out ordinals that get misread (8th → "eighth").
- **Numbers:** write them as English words ("three", "fifty", "forty, thirty-seven"). The studio's script step sometimes *translates* a digit into Hindi (3 → तीन, 50 → पचास), and then the voice says it in Hindi.
- If a line on screen ends where a formula or picture takes over (for example "The nth term is"), say the whole thing in the spoken form.

## Step 4: Automate the studio (Playwright, Python)
Ask me before installing Playwright if it isn't already there.
- **Browser:** start Chromium with `service_workers='block'` and `accept_downloads=True`.
- **Routing:** route `https://generativelanguage.googleapis.com/**` yourself, doing what the blocked service worker would. Fetch the proxy URL with the same method and body, passing on only the `content-type` and `accept` headers, then fulfil the page's request with that response.
- **Logging:** log every response.
  - For the script call, keep `candidates[0].content.parts[0].text`, the Devanagari for each line. Step 6 needs it.
  - For the TTS call, keep the status.
  - For anything other than 200, keep the status and body.
- **Setup:** click *Batch Generation*, then `set_input_files('input[type=file]', xlsx)`.
  - Set each select by its options: the language code, `mp3`, the voice by label, and Concurrency `3 (Recommended)`.
  - Set Text Column = `text` and Filename Column = `filename`.
  - Set Start Row = 1 and Quantity = the number of rows.
- **Run:** click `GENERATE (N)`. Check every 3 s until "Processing..." is gone. If rows failed and quota is left, press Retry, up to 3 times. Then `expect_download` on `DOWNLOAD ALL (.ZIP)`, save the zip, and save the log as JSON.
- **The .xlsx file:** use openpyxl if it is installed. Otherwise write the minimal file by hand: it is a zip of `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels` and `xl/worksheets/sheet1.xml`, with `inlineStr` cells.
- **Pilot first:** run 3 lines. Check the 3 MP3s (duration, and listen with `afplay` on macOS) and their Devanagari before the full run.
- **Full run in chunks:**
  1. Before each chunk, read the headers from `GET <studio>/gemini-api-proxy/v1beta/models?__applet_proxy=true`. This check may itself count as a request.
  2. Make each chunk `floor(remaining / 2) − 1` rows, at most 48.
  3. Wait out `ratelimit-reset` plus 30 s between chunks.
  4. Run the chunks from a background script with timed sleeps, and build the game side (Steps 7–8) while they run.
- **Manual fallback:** if the browser can't be automated, write `vo_batch_1.xlsx`, `vo_batch_2.xlsx` … with at most 48 rows each. Tell me the exact settings to choose and wait 15 minutes between files. Then continue from Step 5 with the zips I give you.

## Step 5: Check every clip before using it
- Every id in the script has an MP3.
- **Devanagari check:** compare each line's Devanagari with its spoken form.
  - Flag Hindi number words: एक दो तीन चार पाँच/पांच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह बीस तीस चालीस पचास सौ हज़ार, and any compounds such as सैंतीस, पचहत्तर.
  - Flag English words that were translated rather than transliterated.
  - Flag names, possessives ("Miso's") and ordinals that came out oddly.
- **Pace check:** characters of the spoken form ÷ seconds should be about 6–22. Listen to every clip outside that range.
- **Fix and regenerate:** correct the spoken form of each flagged line (numbers as English words, ordinals spelled out), regenerate those lines as their own chunk, and check them again. Keep going until the scan is clean.

## Step 6: Convert and build the map
- **To Ogg Opus, 32 kbps mono:**
  - With ffmpeg: `ffmpeg -i voNNN.mp3 -ac 1 -c:a libopus -b:a 32k voNNN.ogg`.
  - Without ffmpeg, on macOS: run `afconvert -f caff -d opus -b 32000 in.mp3 out.caf`, then copy the Opus packets into an Ogg file (RFC 7845) with a small standard-library Python script. `afconvert` can't write Ogg itself, and nothing is re-encoded.
  - Ogg gotchas: Ogg Opus counts granule positions at **48 kHz** even when the source is 24 kHz, so scale them and the pre-skip (priming) by 48000 ÷ rate. On the last page, set the granule to the last valid sample so the padding is trimmed.
  - A working version exists at `/Users/karan/AP_Forest_Crossing/tools/caf2ogg.py`. Copy it if that path exists.
- **Older Safari and iPads:** they can't play Ogg Opus. Ship Ogg only, and let those browsers type the lines silently, unless I ask for AAC `.m4a` (48 kbps) fallbacks.
- **Native engines:** for Unity or Godot, use the format the engine imports best (usually Ogg Vorbis) and skip the web player below.
- **Map file:** measure each clip with `afinfo` or `ffprobe` and generate `src/vo_lines.js`: `const VO_LINES = { "<line as shown>": ["vo001", 6.1], … }`. Mark it generated, not to be edited by hand.
- **Rebuild tool:** write `tools/vo_build.py`. It takes the studio zip or zips, makes the clips, and regenerates the map from `tools/vo_script.json`, listing any line that has no clip yet. It must be safe to run again.
- **Clean up:** delete the MP3s, and any clip no line uses. `assets/vo/` holds one file per voiced line, nothing else.

## Step 7: Build the narration into the game
Find the **one function** that puts instruction text on screen (the banner, typewriter or dialogue box) and hook the voice in there, not at each place that calls it. It should behave like this:
1. **Lookup:** look a line up by the exact plain text it displays. A line with no clip is typed silently, as before.
2. **One audio element:** a single reused audio element (or one engine audio channel), unlocked on the first user gesture such as the Play/Start tap: play it muted, then pause. Without that, tablets refuse to play.
3. **Typing speed:** text types at the voice's pace, with per-character ms = `max(16, (seconds − 0.35) × 1000 / characters)`, so words appear as they are said. Highlights tied to cue words still fire as those words are typed. The voice never waits for the scene: if a picture takes longer than its words, the picture follows a moment behind.
4. **Tap to continue:** "Tap to continue" appears only once the voice has finished. Add a safety timeout of remaining duration + 600 ms so a stalled clip never locks the game. A tap while the line is typing shows the whole line, and the voice carries on. The next tap moves on and stops the voice.
5. **Stopping:** a new line stops the previous voice. So does a level change, a skip or jump, or a restart.
6. **Repeats:** a prompt brought back after a hint is not spoken again. Idle reminders are spoken when they appear.
7. **Ducking:** music and ambience duck under the voice (for example gain 0.55 → 0.2, time constant 0.25 s) and come back afterwards.
8. **Debug speed:** a debug or speed multiplier sets `playbackRate`, clamped to 0.5–4.
9. **Prefetch:** after Start, fetch every clip quietly, one at a time, so each one is ready when it is needed.
10. **Turning it off:** if `canPlayType('audio/ogg; codecs="opus"')` is empty, the narration is off and lines type silently. `?vo=0` also turns it off. If `play()` is rejected or the file is missing, the line types silently and the game never crashes.

## Step 8: Test with real play
- Serve the game locally. With Playwright, play it all the way through twice: **wrong answers first**, then **right answers**, using the debug speed if there is one. Click and drag with real input (`page.mouse`), not JavaScript `.click()`.
- Wrap the say/show function to count voiced lines and log **every shown line that has no clip**. Apart from prompts deliberately left unspoken, that list must be empty.
- In both Chromium and WebKit, confirm that audio really plays (`currentTime` advances and the element isn't paused), that text and voice finish together, that "tap to continue" waits for the voice, and that nothing stalls.

## Step 9: Document it
- `docs/VOICEOVER.md` covers:
  - the studio, the settings, and why Hindi script is used;
  - the spoken-form rules and the Devanagari check;
  - the rate limit;
  - the conversion;
  - how the game uses the clips;
  - how to remake a line, in 3 steps: edit `tools/vo_script.json`, run it in the studio, run `python3 tools/vo_build.py voiceovers_batch.zip`;
  - the full table: clip | line as shown | spoken as (`=` if the same) | Devanagari sent to the voice | seconds.
- Add one line in the README and the assets README pointing to it, with the folder size.

## Report back with
- Lines voiced out of the total, total minutes of audio, and the size of `assets/vo/`.
- Lines whose spoken form differs from the text shown.
- Lines regenerated, and why.
- Any line not voiced, and why.
- The command to remake a clip.
