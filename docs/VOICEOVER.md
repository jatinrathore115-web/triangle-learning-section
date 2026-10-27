# Voice-over

Every line the narration card can show is voiced: narration, questions, feedback, hints, the title, and each answer choice. Each word appears on screen as it is spoken.

## How the game uses the clips

- **Lookup by exact text.** `js/vo_lines.js` (generated) maps each line, exactly as shown with the highlight markup stripped, to `[clip id, seconds, speech segments]`. A line with no clip is revealed silently at a natural reading pace, so the game never breaks.
- **One hook.** `Narration` in `js/ui.js` is the single place text reaches the screen (`say`, `append`, `sub`, `voiceInto`, `readChoices`). It calls `TL.VO.speak(text)` in `js/voice.js` and reveals words against the clip's own clock (`audio.currentTime`). Word times come from the measured speech segments: words between punctuation marks are spread across the matching run of speech, weighted by how long each word takes to say ("90°" counts as "ninety degrees").
- **Follow-along.** The word being spoken gets a soft highlight. Answer choices are read one at a time with the card being read softly marked; any answer stops the reading at once.
- **Pacing.** A line holds until its voice finishes. Continue buttons appear only once the narrator has stopped (`narr.idle()`, safety-capped). Hints wait for the main line, then are voiced. A tap on the narration card shows the whole line; the voice carries on.
- **Stopping.** A new line stops the previous one, and so do Back/Next, a screen change and a restart. Every clip has a safety timeout (length + 600 ms), so a stalled clip can't lock the game.
- **Audio unlock.** Browsers allow sound only after a tap, so the lesson opens on the title screen's Start button. That tap unlocks one reused `<audio>` element and prefetches every clip quietly, one at a time.
- **Ducking.** UI sound effects drop from 0.55 to 0.2 gain (time constant 0.25 s) while the narrator speaks.
- **Switches.** `?vo=0` turns narration audio off; `?vospeed=2` sets `playbackRate` (clamped 0.5–4). If the browser can't play Ogg Opus (older Safari and iPad), lines reveal silently.

## Studio and settings

- Studio: **Ai Wala Human By Aamir**, https://ai-wala-human-by-aamir-809572708022.asia-southeast1.run.app/, *Batch Generation* tab.
- Language **Hindi**, voice **Female Teacher (Standard)** (Gemini voice Kore, clear North Indian accent), MP3 download, concurrency 3.
- Why Hindi for English lines: the studio first rewrites each line in the language's script, then speaks it. English written in Devanagari ("Triangles can look different." → "ट्रायंगल्स कैन लुक डिफरेंट।") is spoken as English with an Indian accent, and the words stay English.
- Each line makes two requests: `gemini-3-flash-preview` writes the Devanagari, then `gemini-3.1-flash-tts-preview` speaks it.

## Spoken-form rules (`tools/vo_make_script.mjs`)

The panel always shows the written form; only the spoken form is rewritten.

- Numbers become English words, so the script step can't turn a digit into a Hindi number word: `5 cm` → "five centimetres", `90°` → "ninety degrees", `one 90° angle` → "one ninety-degree angle", `the 80s` → "the eighties".
- `—` becomes a comma pause. A leading `…` is dropped and a trailing `…` becomes a comma.
- `acute-angled` → "acute angled", so the hyphen isn't voiced.

**Devanagari check.** Every line's Devanagari is scanned for Hindi number words (एक दो तीन … सौ हज़ार) and for translated maths words (त्रिभुज, कोण, भुजा, बराबर), matching whole words only, because एक is also the start of एक्सप्लोर (explore). The current set is clean; डिग्री is simply "degree" written in Devanagari. **Pace check:** spoken characters ÷ seconds is 6–14 for every sentence (the target is 6–22). The six one-word answer choices ("Scalene", "Right" …) read 3.5–6 only because each clip has a fixed lead-in and tail of silence around one short word; I listened to their length and segments, and they are fine.

## Rate limit

The studio's proxy allows **100 requests per 15 minutes per IP**. It reports this in the `ratelimit-limit`, `ratelimit-remaining` and `ratelimit-reset` headers and answers `429` when you are over. At 2 requests per line, that is about 48 lines per window. `tools/vo_generate.mjs` reads the quota before every chunk, sizes the chunk as `floor(remaining / 2) − 1` (at most 48), and otherwise waits out the reset plus 30 s.

## Conversion (no ffmpeg needed)

`tools/vo_build.mjs` unzips the studio download. It then decodes each MP3 and encodes **Opus 32 kbps mono** with WebCodecs in headless Chrome, served on a local https origin because WebCodecs needs a secure context. The Ogg container (RFC 7845) is written by the tool itself:

- granule positions count at 48 kHz and include the encoder's pre-skip;
- the last page's granule trims the encoder padding;
- every clip is decoded again afterwards and its length compared with the source.

The tool also measures each clip's speech segments (gaps of 140 ms or more), which drive the word sync. It writes `assets/vo/voNNN.ogg`, `tools/vo_meta.json` and the map `js/vo_lines.js`, deletes clips no line uses, and lists lines that have no clip yet.

## Remake a line in 3 steps

1. Edit the text in `js/screens.js`, or edit the line's `spoken` value in `tools/vo_script.json` (then run `node tools/vo_make_script.mjs`; existing ids and hand-edited spoken forms are kept).
2. Generate it in the studio: `node tools/vo_generate.mjs --ids vo045 --out .vo_work`. You can also upload an .xlsx with the columns `filename` and `text` by hand, using the settings above.
3. Build it: `node tools/vo_build.mjs .vo_work/voiceovers_<tag>.zip` (or `voiceovers_batch.zip` from a manual run). Then refresh this table with `node tools/vo_docs.mjs .vo_work/log_<tag>.json`.

Setup once: `cd tools && npm install` (installs `playwright-core`; Google Chrome must be installed).

## Clips

<!-- CLIP TABLE (generated by tools/vo_docs.mjs) -->

| Clip | Line as shown | Spoken as | Devanagari sent to the voice | Seconds |
|---|---|---|---|---|
| vo084 | Let’s explore triangles | = | लेट्स एक्सप्लोर ट्रायंगल्स | 2.30 |
| vo085 | Before we return to the tunnel, learn how to recognise them. | = | बिफोर वी रिटर्न टू द टनल, लर्न हाउ टू रिकग्नाइज देम। | 4.22 |
| vo001 | Triangles can look different. | = | ट्रायंगल्स कैन लुक डिफरेंट। | 2.78 |
| vo002 | Let’s explore what makes them triangles. | = | लेट्स एक्सप्लोर वॉट मेक्स देम ट्रायएंगल्स। | 3.29 |
| vo003 | This is a triangle. | = | दिस इज़ अ ट्रायंगल। | 2.09 |
| vo004 | A triangle is a closed shape | = | ए ट्राएंगल इज ए क्लोज्ड शेप | 3.34 |
| vo005 | with three straight sides. | = | विथ थ्री स्ट्रेट साइड्स. | 2.54 |
| vo006 | Triangles can have different shapes. | = | ट्रायएंगल्स कैन हैव डिफरेंट शेप्स। | 3.05 |
| vo007 | Let’s explore their sides. | = | लेट्स एक्सप्लोर देयर साइड्स। | 2.38 |
| vo008 | Let’s measure the sides of this triangle. | = | लेट्स मेजर द साइड्स ऑफ़ दिस ट्रायंगल। | 3.14 |
| vo009 | What do you notice about the sides? | = | वॉट डू यू नोटिस अबाउट द साइड्स? | 2.54 |
| vo086 | All three are different | = | ऑल थ्री आर डिफरेंट | 2.30 |
| vo087 | Two sides are equal | = | टू साइड्स आर इक्वल | 2.09 |
| vo088 | All three are equal | = | ऑल थ्री आर इक्वल | 2.02 |
| vo010 | Look at the side lengths again. | = | लुक एट द साइड लेंग्थ्स अगेन। | 2.38 |
| vo011 | Yes! 5 cm, 4 cm and 6 cm are all different. | Yes! five centimetres, four centimetres and six centimetres are all different. | येस! फाइव सेंटीमीटर्स, फोर सेंटीमीटर्स एंड सिक्स सेंटीमीटर्स आर ऑल डिफरेंट। | 7.30 |
| vo012 | All three sides are different. | = | ऑल थ्री साइड्स आर डिफरेंट। | 2.78 |
| vo013 | A triangle with all three sides different is called a scalene triangle. | = | ए ट्रायंगल विद ऑल थ्री साइड्स डिफरेंट इज कॉल्ड ए स्केलीन ट्रायंगल। | 5.26 |
| vo014 | What if two sides were equal? | = | वॉट इफ़ टू साइड्स वर इक्वल? | 2.86 |
| vo015 | All three are equal now. Make just two equal. | = | ऑल थ्री आर इक्वल नाउ. मेक जस्ट टू इक्वल. | 3.77 |
| vo016 | Tip: make the two slanted sides show the same number. | = | टिप: मेक द टू स्लैनटेड साइड्स शो द सेम नंबर। | 4.73 |
| vo017 | Drag a vertex to make two sides equal. | = | ड्रैग ए वर्टेक्स टू मेक टू साइड्स इक्वल। | 4.18 |
| vo018 | Watch the numbers change as you drag. | = | वॉच द नंबर्स चेंज एज़ यू ड्रैग। | 3.14 |
| vo019 | Two sides are equal. | = | टू साइड्स आर इक्वल। | 2.50 |
| vo020 | A triangle with two equal sides is called an isosceles triangle. | = | ए ट्रायंगल विद टू इक्वल साइड्स इज कॉल्ड एन आइसोसिलेस ट्रायंगल। | 4.94 |
| vo021 | Tip: the base is the third side — make the other two match it. | Tip: the base is the third side, make the other two match it. | टिप द बेस इज द थर्ड साइड मेक द अदर टू मैच इट | 4.42 |
| vo022 | Can you make all three sides equal? | = | कैन यू मेक ऑल थ्री साइड्स इक्वल? | 2.74 |
| vo023 | Drag a vertex until the three lengths match. | = | ड्रैग ए वर्टेक्स अंटिल द थ्री लेंग्थ्स मैच। | 3.58 |
| vo024 | All three sides are equal. | = | ऑल थ्री साइड्स आर इक्वल। | 2.66 |
| vo025 | A triangle with all three sides equal is called an equilateral triangle. | = | ए ट्रायंगल विद ऑल थ्री साइड्स इक्वल इज़ कॉल्ड एन इक्विलैटरल ट्रायंगल। | 5.93 |
| vo026 | Challenge time. | = | चैलेंज टाइम। | 1.58 |
| vo027 | Make this triangle isosceles. | = | मेक दिस ट्रायंगल आइसोसेलीज़। | 3.10 |
| vo028 | All three sides are equal — make exactly two equal. | All three sides are equal, make exactly two equal. | ऑल थ्री साइड्स आर इक्वल, मेक एग्जैक्टली टू इक्वल। | 4.90 |
| vo029 | Hint: drag the top vertex until two sides show the same length. | = | हिंट: ड्रैग द टॉप वर्टेक्स अंटिल टू साइड्स शो द सेम लेंथ। | 5.69 |
| vo030 | Great! This triangle is isosceles. | = | ग्रेट! दिस ट्रायंगल इज आइसोसिलीज़। | 3.77 |
| vo031 | Sort the triangles by their sides. | = | सॉर्ट द ट्रायंगल्स बाय देयर साइड्स। | 2.86 |
| vo032 | Drag a triangle into its group — or tap a triangle, then tap a group. | Drag a triangle into its group, or tap a triangle, then tap a group. | ड्रैग अ ट्रायंगल इनटू इट्स ग्रुप, ऑर टैप अ ट्रायंगल, देन टैप अ ग्रुप। | 5.74 |
| vo033 | Great job! You sorted all the triangles. | = | ग्रेट जॉब! यू सॉर्टेड ऑल द ट्रायंगल्स। | 4.10 |
| vo034 | Now let’s measure the angles. | = | नाऊ लेट्स मेजर द एंगल्स। | 2.66 |
| vo035 | What do you notice about the angles? | = | वॉट डू यू नोटिस अबाउट द एंगल्स? | 2.81 |
| vo089 | All are acute angles | = | ऑल आर एक्यूट एंगल्स | 2.38 |
| vo090 | One angle is a right angle | = | वन एंगल इज अ राइट एंगल | 3.02 |
| vo091 | One angle is obtuse | = | वन एंगल इज ऑब्ट्यूस | 2.66 |
| vo036 | Check the angles once more. | = | चेक द एंगल्स वंस मोर। | 2.50 |
| vo037 | Yes! All three are acute angles. | = | येस! ऑल थ्री आर एक्यूट एंगल्स। | 3.89 |
| vo038 | All three angles are less than 90°. | All three angles are less than ninety degrees. | ऑल थ्री एंगल्स आर लेस दैन नाइन्टी डिग्रीज़। | 3.53 |
| vo039 | So they are acute angles. | = | सो दे आर एक्यूट एंगल्स। | 2.90 |
| vo040 | A triangle with three acute angles is called an acute-angled triangle. | A triangle with three acute angles is called an acute angled triangle. | ए ट्रायंगल विद थ्री एक्यूट एंगल्स इज़ कॉल्ड एन एक्यूट एंगल्ड ट्रायंगल। | 5.50 |
| vo041 | Tip: find an angle in the 80s and keep opening it. | Tip: find an angle in the eighties and keep opening it. | टिप: फाइंड एन एंगल इन द एटीज एंड कीप ओपनिंग इट। | 4.46 |
| vo042 | Can you make one angle exactly 90°? | Can you make one angle exactly ninety degrees? | कैन यू मेक वन एंगल इग्ज़ैक्टली नाइन्टी डिग्रीज़? | 3.82 |
| vo043 | Drag a vertex — the angles change live. | Drag a vertex, the angles change live. | ड्रैग अ वर्टेक्स, द एंगल्स चेंज लाइव। | 3.77 |
| vo044 | One angle is exactly 90°. | One angle is exactly ninety degrees. | वन एंगल इज़ इग्ज़ैक्टली नाइन्टी डिग्रीज़। | 3.58 |
| vo045 | A triangle with one angle of exactly 90° is called a right-angled triangle. | A triangle with one angle of exactly ninety degrees is called a right angled triangle. | ए ट्रायंगल विद वन एंगल ऑफ एक्जैक्टली नाइनटी डिग्रीज़ इज़ कॉल्ड ए राइट एंगल्ड ट्रायंगल। | 6.29 |
| vo046 | What if one angle were greater than 90°? | What if one angle were greater than ninety degrees? | वॉट इफ़ वन एंगल वर ग्रेटर दैन नाइन्टी डिग्रीज़? | 3.82 |
| vo047 | Tip: open one corner wider than a square corner. | = | टिप: ओपन वन कॉर्नर वाइडर दैन अ स्क्वायर कॉर्नर। | 3.94 |
| vo048 | Drag a vertex to make any angle obtuse. | = | ड्रैग ए वर्टेक्स टू मेक एनी एंगल ऑब्ट्यूस. | 3.46 |
| vo049 | Make one corner wider than a right angle. | = | मेक वन कॉर्नर वाइडर दैन अ राइट एंगल। | 3.22 |
| vo050 | One angle is greater than 90°. | One angle is greater than ninety degrees. | वन एंगल इज़ ग्रेटर दैन नाइन्टी डिग्रीज़। | 3.50 |
| vo051 | A triangle with one angle greater than 90° is called an obtuse-angled triangle. | A triangle with one angle greater than ninety degrees is called an obtuse angled triangle. | ए ट्रायंगल विद वन एंगल ग्रेटर दैन नाइन्टी डिग्रीज़ इज़ कॉल्ड एन ऑब्ट्यूस एंगल्ड ट्रायंगल। | 6.94 |
| vo052 | Which of these are acute-angled triangles? | Which of these are acute angled triangles? | विच ऑफ दीज़ आर एक्यूट एंगल्ड ट्रायंगल्स? | 3.46 |
| vo053 | You can choose more than one. | = | यू कैन चूज़ मोर दैन वन। | 2.42 |
| vo054 | Tap every triangle whose angles are all less than 90°. | Tap every triangle whose angles are all less than ninety degrees. | टैप एवरी ट्रायंगल हूज़ एंगल्स आर ऑल लेस दैन नाइन्टी डिग्रीज़। | 5.42 |
| vo101 | Correct! These two triangles have only acute angles. | = | करेक्ट! दीज़ टू ट्रायंगल्स हैव ओनली एक्यूट एंगल्स। | 4.30 |
| vo056 | Hint: one angle must read exactly 90°. | Hint: one angle must read exactly ninety degrees. | हिंट: वन एंगल मस्ट रीड इग्ज़ैक्टली नाइन्टी डिग्रीज़। | 4.18 |
| vo057 | Make this triangle right-angled. | Make this triangle right angled. | मेक दिस ट्रायंगल राइट एंगल्ड। | 2.93 |
| vo058 | Drag any vertex to create one 90° angle. | Drag any vertex to create one ninety-degree angle. | ड्रैग एनी वर्टेक्स टू क्रिएट वन नाइन्टी डिग्री एंगल। | 4.54 |
| vo059 | A triangle with one 90° angle is right-angled. | A triangle with one ninety-degree angle is right angled. | ए ट्रायंगल विद वन नाइन्टी-डिग्री एंगल इज राइट एंगल्ड। | 4.25 |
| vo060 | What type of triangle is this by its sides? | = | वॉट टाइप ऑफ़ ट्रायंगल इज़ दिस बाय इट्स साइड्स? | 3.29 |
| vo092 | Scalene | = | स्केलीन | 1.46 |
| vo093 | Isosceles | = | आइसोसेलीज़ | 1.82 |
| vo094 | Equilateral | = | इक्वीलैटरल | 1.66 |
| vo061 | Two sides are 5 cm. It is isosceles. | Two sides are five centimetres. It is isosceles. | टू साइड्स आर फाइव सेंटीमीटर्स। इट इज आइसोसिलीज। | 4.70 |
| vo062 | Now classify the same triangle by its angles. | = | नाउ क्लासिफाई द सेम ट्रायंगल बाय इट्स एंगल्स। | 4.01 |
| vo095 | Acute-angled | Acute angled | एक्यूट एंगल्ड | 2.02 |
| vo096 | Right-angled | Right angled | राइट एंगल्ड | 1.66 |
| vo097 | Obtuse-angled | Obtuse angled | ऑब्ट्यूस एंगल्ड | 1.94 |
| vo063 | One angle is 90°. It is right-angled. | One angle is ninety degrees. It is right angled. | वन एंगल इज़ नाइन्टी डिग्रीज़। इट इज़ राइट एंगल्ड। | 4.54 |
| vo064 | This triangle is isosceles… | This triangle is isosceles, | दिस ट्रायंगल इज आइसोसिलीज, | 3.05 |
| vo065 | …and right-angled. | and right angled. | एंड राइट एंगल्ड। | 1.78 |
| vo066 | A triangle can be classified in two ways. | = | ए ट्रायंगल कैन बी क्लासिफाइड इन टू वेज। | 3.38 |
| vo067 | By its sides… | By its sides, | बाय इट्स साइड्स, | 1.85 |
| vo068 | …and by its angles. | and by its angles. | एंड बाय इट्स एंगल्स। | 2.14 |
| vo098 | Acute | = | अक्यूट | 1.42 |
| vo099 | Right | = | राइट | 1.13 |
| vo100 | Obtuse | = | ऑब्ट्यूस | 1.49 |
| vo069 | Classify this triangle by its sides and angles. | = | क्लासिफाई दिस ट्रायंगल बाय इट्स साइड्स एंड एंगल्स। | 4.22 |
| vo070 | Choose one answer in each row. | = | चूज़ वन आंसर इन ईच रो। | 3.02 |
| vo071 | Correct! This triangle is scalene and obtuse-angled. | Correct! This triangle is scalene and obtuse angled. | करेक्ट! दिस ट्रायंगल इज स्केलीन एंड ऑब्ट्यूस एंगल्ड. | 4.90 |
| vo072 | Final challenge. | = | फाइनल चैलेंज। | 1.97 |
| vo073 | Make a right-angled isosceles triangle. | Make a right angled isosceles triangle. | मेक ए राइट एंगल्ड आइसोसेलीस ट्रायंगल। | 3.77 |
| vo074 | You can classify triangles by sides and angles! | = | यू कैन क्लासिफाई ट्रायंगल्स बाय साइड्स एंड एंगल्स! | 4.13 |
| vo075 | Let’s summarise what we learned. | = | लेट्स समराइज वॉट वी लर्न्ड। | 2.33 |
| vo076 | A scalene triangle has all sides different. | = | ए स्केलीन ट्रायंगल हैज ऑल साइड्स डिफरेंट। | 3.89 |
| vo077 | An isosceles triangle has two equal sides. | = | एन आइसोसेलीज़ ट्रायंगल हैज टू इक्वल साइड्स। | 3.74 |
| vo078 | An equilateral triangle has all three sides equal. | = | एन इक्विलैटरल ट्रायंगल हैज़ ऑल थ्री साइड्स इक्वल। | 4.22 |
| vo079 | An acute-angled triangle has all angles less than 90°. | An acute angled triangle has all angles less than ninety degrees. | एन एक्यूट एंगल्ड ट्रायंगल हैज ऑल एंगल्स लेस दैन नाइन्टी डिग्रीज। | 5.74 |
| vo080 | A right-angled triangle has one angle of exactly 90°. | A right angled triangle has one angle of exactly ninety degrees. | ए राइट एंगल्ड ट्रायंगल हैज वन एंगल ऑफ एग्जैक्टली नाइन्टी डिग्रीज। | 5.62 |
| vo081 | An obtuse-angled triangle has one angle greater than 90°. | An obtuse angled triangle has one angle greater than ninety degrees. | ऐन ऑब्टयूस ऐंगल्ड ट्रायंगल हैज वन ऐंगल ग्रेटर दैन नाइन्टी डिग्रीज। | 5.57 |
| vo082 | A triangle can be classified by both its sides and its angles. | = | ए ट्रायंगल कैन बी क्लासीफाइड बाई बोथ इट्स साइड्स एंड इट्स एंगल्स। | 4.73 |
| vo083 | Well done, triangle explorer! | = | वेल डन, ट्रायंगल एक्सप्लोरर! | 2.57 |
