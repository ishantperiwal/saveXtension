# AI in saveXtension

Where AI is used in the app, how it works and the decisions behind it. Read this before changing any of it, and update it in the same step as a change.

## Where AI is used

- **Everyday search:** word search and MiniLM, always on, free and on this computer. See [Search](#search).
- **AI search:** Claude Code or Codex read the library when someone asks. See [AI search](#ai-search).
- **Image descriptions:** Claude Code or Codex read a post's image and save what they saw. See [Image scanning](#image-scanning).
- **Filling a note:** someone asks for something on one post, and Claude Code or Codex inspects that post and adds the result to its note, or rewrites the note if asked. See [Filling a note](#filling-a-note).
- **Organizing topics:** the Organize button at the bottom of the sidebar's Topics tab changes topics from a typed request. See [Organizing topics](#organizing-topics).
- **DeepSeek:** a third choice in Settings, using an API key instead of an installed tool. It covers AI search, Organize, image scanning and notes. See [DeepSeek](#deepseek).
- **MCP:** outside AI apps read and organize the library. This is separate from the AI inside the app. See the MCP section of [ARCHITECTURE.md](ARCHITECTURE.md).

## Decisions the user has made

Keep these unless the user changes them.

- **Everyday search is free, AI search is a luxury.** Word search and MiniLM always run. Spending the person's plan on AI search is their own call each time.
- **MiniLM is part of the app.** It installs automatically on first launch, and the app opens only after that. It has no switch or delete button. It isn't in the installer, which stays small.
- **AI search has its own button** under the search bar, like Search with Haiku 5.5. Enter only confirms a search, so habit never spends the plan.
- **AI search reads everything.** A shortlist was built and tested, then dropped: it let the weaker judge decide what Claude could see. MiniLM can only add posts for Claude to check, never remove any.
- **Cards only.** No AI summaries or reasoning in search results.
- **Most relevant first.** Posts with the words and an AI's pick, then other word matches, then other AI picks. Ties keep the list's usual order.
- **Small models, low effort.** Matching and describing posts doesn't need a smart model. Settings, the search bar, the note box and the Organize button name the exact model, so nothing runs unannounced. Only filling a note lets the person pick a bigger one, for that run.
- **Don't use up the person's plan without asking.** More than 30 images in one search asks first and says descriptions are saved.
- **Image scanning is implicit or by hand.** Descriptions get saved when a search or the Scan button reads an image. Nothing scans the whole library by itself.
- **Each image is only read once.** After that its description is the text. To read it again, press Clear on the post's description and confirm with the tick, or ask an AI app connected over MCP to clear one or all (`clear_image_descriptions`). The user chose not to offer clearing all in Settings.
- **Descriptions only, no tags.**
- **Organize applies straight away.** No preview and no "are you sure". Undo takes the whole request back, and the user tidies up by hand if needed.
- **The AI can never delete a save.** No step for it exists. It can delete topics, and the saves stay in the library.
- **Finding saves for Organize is the AI's call alone.** Haiku 5.5 or GPT-6 Luna reads everything through AI search, with no MiniLM suggestions.
- **No plain New Topic button.** Organize is the only way in, and it only shows when an AI tool is on.
- **A saved description goes in the AI's first pass unless the post has a note (user's decision, replacing descriptions being left out).** A note already says what the post is about. A post with a note still gets its description read to settle it if the AI is unsure. Across the library this adds little: 92 descriptions came to about 20,000 characters, under one batch of about 30,000.
- **The notes agent can read any website (user's decision).** It needs to, to read things a post links to. Files and commands stay off, because that's where a misleading post could do real harm. The most a misleading page can do is put bad text in that note, or send that post's details to a website.
- **Notes are filled one at a time, only when asked.** The user always decides what to extract, by typing it on that post's note. No bulk or background generation, and no fixed note types. A "Deep scan" button was discussed and declined.
- **Antigravity CLI is left out.** Its FAQ says wrapping it in an application isn't supported on consumer plans, and it documents no way to turn tools off.

## Search

| Search | Caption and notes | Image descriptions | When |
|---|---|---|---|
| Word search | Yes | Yes | Always, as you type. It looks for the whole search as one phrase |
| MiniLM | Yes | Yes | Always, as you type |
| Claude Code, Codex or DeepSeek, first pass | Yes | Unless the post has a note | When the button is clicked |
| Claude Code, Codex or DeepSeek, settling | First 500 characters | Yes | Only for unsure posts with a note |
| MCP search and `get_saves` | Yes | Yes | When an LLM asks. It has no MiniLM |

Only the saves the app shows are ever read. The rules are the same ones MCP uses, and nothing here changes them.

MiniLM reads long posts in overlapping parts of about 1,000 characters, and a post scores as its best part. It shows posts scoring at least 0.40, up to the closest 40. Vectors are kept in IndexedDB by a hash of each part's text, so only new or edited text is worked out again. Each browser profile has its own copy.

### First launch

`installMiniLM` in `public/app.js` shows a setup screen and downloads seven files, about 51 MB, before anything else opens: the transformers.js library and ONNX Runtime's WebAssembly engine from jsDelivr, and the compressed model from Hugging Face. Each is pinned to a version and SHA-256 hash, because this code then runs, and a failed check keeps nothing. If it fails, the screen offers Try again, so the first launch needs internet. After that it works offline.

## AI search

A person chooses Claude Code or Codex in Settings, then clicks the button under the search bar.

1. **First pass.** Every caption and note the filters allow, plus the saved description of a post with no note, is split into overlapping parts of about 1,000 characters, grouped into batches of about 30,000 characters, and run three at a time. Each post gets a score from 1 to 10. A score of 6 or more shows it.
2. **Who counts as unsure.** A score of 3 to 5, or a post MiniLM rated 0.40 or more that the AI didn't pick (up to 40). The second kind matters because MiniLM reads descriptions, so a useless caption can't hide a good image.
3. **Settling with descriptions.** Unsure posts with a saved description go to the AI as text, with no image.
4. **Settling with images.** The rest with a saved image are read, up to 30 without asking. The reply says if the post fits and describes the image in general terms, not in relation to this search. That description is saved.

A failed batch gets a second try. Only a search where every batch failed, or a signed-out tool, shows an error. A partial result gets a quiet note, and the reason goes to the app's log, never with post text.

While it runs, a card stays above the results showing real progress: batches, descriptions or images done, posts found and accounts being read. The tools send no live steps, so nothing here is invented. Anyone at the top of the list stays there as cards arrive.

### What was tried

- **Shortlist of MiniLM's top 100.** Over five real searches it was about 30% faster and used 2–3 batches instead of 5, but lost 22 of 70 cards while finding 8 new ones. Only 8 of the lost cards were outside its top 100, so the rest was scoring varying between runs. Dropped for now. If libraries grow past what reading everything can bear, this is the way to cap the cost, ideally growing with the library.
- **Skipping posts MiniLM scores under 0.10.** Removed only 51 of 307 posts on one search, so it saves little.
- **Prompt caching.** Putting posts before the search words didn't help. Each search still wrote the whole batch to the cache and reused only about 580 tokens, so every search costs the same.

## Image scanning

Images are read in two ways: when an AI search needs one to settle an unsure post, as above, and by hand.

### Scanning one post by hand

A post with a saved image and no description has a button naming the model, like **Scan using Haiku 5.5**. It uses the AI tool that's chosen, or else the first installed one, so it works without a tool switched on. MiniLM can't read images.

### Saved descriptions

**Short on purpose, but with no limit (user's decision).** As few words as it takes, holding only what someone would search for: what it is, the topic, and tools, brands and people named. There's deliberately no word count or character cap, so nothing that matters gets dropped to fit. Labels, layer names, settings, colours, layout and anything already in the post's text are left out, so searching for a word that's only small print in an image may no longer find it. Descriptions saved before this stay as they are until cleared. Not yet judged on real scans.

Stored as `image_description` and `image_description_model` on the post, separate from notes and not counted as an edit. A small icon over the picture opens the description under "Generated using" the model, and a click anywhere outside closes it. Clear at its top right asks first in place, with a tick and a cross and no dialog. Only a post's saved cover image is read, so video content and other carousel images aren't covered. Descriptions can be wrong and come from post content, so they're treated as untrusted, like captions.

## Filling a note

An AI button sits at the bottom right of every note, and the button itself grows into a tinted box inside the note. Enter runs what was typed, Shift+Enter is a new line, Tab in an empty box fills in "What is the post about?" (user's decision; it's only typing help, still run with Enter), and Esc or clicking away shrinks it back into the button, keeping what was typed. While it runs, the box shows the current step and a Cancel, and the note is read-only. It carries on through a reload.

1. `POST /api/note-ai` starts one job (`server/note-ai.mjs`). There's only ever one at a time.
2. The chosen tool runs with a private MCP address, `/mcp/note/<random>`, that exists only during the job and works even with MCP turned off in Settings. It's tied to that one post, with no ID to name another: `get_post`, `get_saved_image`, `view_post`, `capture_view_frames` and `read_view_frames`. It has no library search and no write tools. Its only other tools are for the web, so it can find a resource and read it, on any website: WebSearch and WebFetch on Claude Code, `--search` on Codex. It has no files and can't run commands.
3. It returns text, and the app adds it below the note. Nothing is said twice, and nothing is copied from the post (user's decision). The post's own text sits beside the note, so the prompt forbids copying its links, repos, skills, tools or lines, and forbids repeating the note, even reworded; it may say once that they're in the caption. Before adding, the app drops any line the note already has, the reply already said, or that's taken straight from the caption, plus any line that's only a link the caption already shows, ignoring case, spacing, list markers and end punctuation (`withoutRepeats`; lines under 12 characters, like headings, stay). The caption check is skipped when the request asks to list, extract, copy or keep (`asksForCopy`), and for rewrites, so the person's own note is never trimmed. If nothing new is left, the box says "That’s already in the post or its note." If the request is to rephrase, shorten, tidy or remove what's there, the AI marks its reply as a replacement and the note becomes that text (user's decision, reversing an earlier append-only rule). Undo puts the note back. It lasts until the note is next edited or another request runs, and it survives a reload, but not an app restart. Nothing checks that a rewrite was asked for, so a misleading post could in theory cause one, which is why Undo matters. An empty reply only clears a note if the request says to delete, remove or clear it, and none of the AI's reasons for stopping came with it, because Codex once returned an empty rewrite on a plain request to tidy a note. If it finds nothing, the reason shows in the box and nothing is written.

- **The note comes first (user's decision).** A request may just follow on from what's written, so the prompt tells the AI to read the note first and use no tools when the note alone is enough, such as rewording, spacing or a question it already answers. The post is only read for what the note doesn't cover, or when asked to check against it.
- **Easy to scan (user's decision).** Notes are read in a small box, so separate things get a blank line between them. Each item in a list gets its own block, name and link first, then what it does.
- **No padding (user's decision).** A note starts with the substance. It leaves out what's on screen beside it: title, author, site, post type, the saving account, its collections and topics. It stays plain unless the post is technical or the request asks otherwise. Extraction requests still get everything.
- **"What is it about" says what happens (user's decision).** For a general question, the note is one or two short sentences, about 25 words at most, leading with the action or idea in everyday search words, like "Wildflowers grow and bloom across a web page, redrawn in several illustration styles." It leaves out the look (colours, textures, fonts, backgrounds, layout, placeholder text) unless the look is the point or is asked about, and mentions a cursor or tap only if the post shows one. An earlier rule, "what it is and what it's doing", gave a sentence on the look before the action.
- **A note, not a reply (user's decision).** The request is never saved, so the prompt tells the AI to write statements about the post that make sense without it, with no "the caption already answers this" or "you". A question's answer is written out as a statement.
- **The user's request wins.** The prompt tells it to extract all of what's asked for, however long, rather than following the short note style. If they ask to keep something the caption already holds in full, like a prompt, it says so in one line unless asked for a copy.
- **Reading what's linked:** if a request is about something the post links to or names, like a GitHub repo, it opens that page and reads it (for a repo, the README) and includes the address. It tried this for real on a GitHub bookmark on a copy of the library: 13 seconds, and it read the repo. It's the AI's judgement, so it can still answer from search results.
- **A quoted post's pictures and carousel (user's decision: on demand).** The AI reads them only when the request is about them, using `quotedSlides` on `view_post`, which also finds every video in that carousel. Otherwise it only sees what's on the first screen, and is told there's more.
- **Links:** only one shown in the post, or found or opened on the web. Otherwise the name, and a line saying the link wasn't found.
- **No length limit on the result** beyond a note's 10,000 characters. Going over fails without writing.
- **Counts as a visit:** `view_post` shares `view_save`'s one-at-a-time rule and limit of 5 in 10 minutes. It can't ask the user, so hitting the limit shows as an error.
- **Tool search must stay off** for this run (`ENABLE_TOOL_SEARCH=false`). With it on, Claude Code hides the post's tools behind a tool that isn't allowed, and they look unavailable.
- **Choosing the model (user's decision).** The box has a small picker, defaulting to Haiku 5.5 or GPT-6 Luna, and a pick lasts for that note's run, so a bigger model is never left on by accident. Claude Code can't list its models, so its list is fixed (Haiku, Sonnet, Opus, Fable): one a plan doesn't include shows as an error. Codex's comes from `codex debug models`. Effort stays low on all of them.
- **Codex sees pictures as files.** It runs with `--search` and the same post tools, approved ahead because nobody's there. It doesn't see pictures tools return, so for Codex those tools save each picture to a private folder (deleted when the job ends) and return its path, and the prompt tells it to open them with its `view_image` tool. It can't work this out unprompted. On a real AE screenshot it read every label and value. Video frames through this route aren't proven yet. `--search` also opens pages, including GitHub READMEs.
- **Speech isn't heard.** Only on-screen text and frames can be read, and the note says so when the request could depend on speech.

## Models

| Tool | Model | Effort | Why |
|---|---|---|---|
| Claude Code | `claude-haiku-5-5` | Low | Pinned because `haiku` resolved to 4.5 on CLI 2.1.212 |
| Codex | `gpt-6-luna` | Low | Pinned instead of its default, `gpt-6.1-sol` |
| MiniLM | `all-MiniLM-L6-v2`, compressed | | About 51 MB with its engine, English-focused |

These are the defaults everywhere. Search, image scanning and Organize always use them. Only filling a note offers others, at the same low effort.

At low effort Haiku said yes to one test post in 3 of 4 image checks, against 4 of 4 at its default, for about a third of the output tokens. A miss corrects itself on the next search, because the saved description still names the content.

`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is set when running Claude Code. Without it, each batch also made a Haiku 4.5 side call that read about 10,000 tokens.

## DeepSeek

Claude Code and Codex are installed programs with their own sign-in. DeepSeek is a plain API, chosen in Settings like them, with one on at a time.

- **Requests:** `askApi` in `server/ai-search.mjs` calls `https://api.deepseek.com/chat/completions` with `deepseek-flash` (V4.1 Flash), JSON output, and thinking on at high effort (user's decision), unlike the low effort the installed tools use. That's slower and costs more, since thinking is billed as output. It's told the JSON shape in the prompt, because the API has no schema check, and a reply that isn't valid JSON counts as a failed try.
- **Images:** sent inline in the user message. Its docs list vision on `deepseek-flash`.
- **The key:** checked against `/models` before it's kept, then encrypted with Electron's `safeStorage` (the Mac Keychain) in `ai-keys.json` beside the library, out of the database and exports. It never goes back to the page. The plain browser version has nowhere safe to keep it, so it doesn't offer DeepSeek.
- **Notes:** an installed tool runs its own back-and-forth with a post's tools, so for DeepSeek the app runs it (`server/note-api.mjs`, `noteConversation`), up to 20 rounds. It gets the same post tools, called directly rather than over MCP, plus `web_search` and `web_fetch` through DeepSeek's Search and Fetch API, which are billed per request. Pictures go in a user message after the tool results, because DeepSeek allows them nowhere else, and only the newest 30 MB are kept, since each round resends the conversation. Its reply is read as JSON, with one more try without tools if it isn't. With thinking on, its `reasoning_content` must go back with each of its turns, or the service returns a 400. It has one model, because its Pro model can't read images.
- **Cost:** the person pays DeepSeek per use, not through a plan. AI search reads the whole library each time.
- **Safety:** it has no shell, files or connected apps. For search, Organize and scanning it has no tools at all. For notes it has that one post's read tools and the web, so a misleading post could at worst put bad text in that note, or get that post's details sent to a website. Saved text and images go to DeepSeek.
- **Not proven:** only tested against a stand-in service built from its docs, with no real key. The request format, real reply quality, image reading, and whether it uses its tools well in a note all need a first real run.

## Organizing topics

The Organize button sits at the bottom of the sidebar on the Topics tab, when Claude Code or Codex is on, with the list fading under it. The topic count isn't shown (the user removed it). It takes a typed request of up to 500 characters (`public/organize.js`, `server/ai-organize.mjs`). The button grows upwards into a single box, with no title or close button, and goes back into the button on Esc or a click outside (the user asked for one container, not a box inside a dialog). A run carries on with the box closed, and the button shows it: Organizing… with a spinner, then See result or Couldn't finish. Clicking it reopens the progress, the result or the error, and a job still running or not yet acknowledged is picked up after a reload. A result or error has to be acknowledged with Okay before another request can be typed (the user's decision): closing the box doesn't count, while Open topic does. After an error, Okay returns to the box with the request still in it. Results group three or more changes of one kind into one line, with Show all for the full list, using plain matching on the lines rather than AI. Errors always show. Enter runs it and Shift+Enter is a new line. The user asked for no explanatory text, so the only thing naming the model is its button, like Organize with Haiku 5.5.

1. **Plan.** The model gets the request and the topics (names, counts, nesting, descriptions) and replies with steps: create, rename, move or merge topics, delete a topic, or add, move or remove saves by a description of what they're about. It sees no posts.
2. **Find.** Each step that needs saves runs through AI search with that description, over the whole library or just one topic. Scores of 6 and up count, unsure posts get the usual image check, and more than 30 images asks first. Up to 5 whole-library reads per request, because each costs about one AI search.
3. **Apply.** All steps run as one change in the journal, so Undo takes everything back and a step that fails leaves nothing changed. A new topic nothing matched isn't created.

It works on the topics the app shows, like the app's own topic controls. That includes a topic whose saves are all in unticked collections, which shows at 0 and which MCP doesn't list, and a topic with no saves at all, which shows in both. Saves are only ever found among visible ones, though deleting a topic does detach hidden saves from it, as the app's own delete does. MCP's tools aren't used, though the topic code is the same. MCP can be off, and the split below is what keeps post text from steering topic changes. Undo here can reach archived saves' topics, which MCP's can't.

It has run for real with Haiku on the user's library: a request deleted 23 topics and made one with 13 saves. Whether it finds the right saves in general, and Organize with Codex, aren't proven. The grouped results were tested with created topics and an automated check of the wording, and the sidebar fade with stand-in rows.

## Safety

Post text and images are untrusted.

- **Claude Code** runs with none of the person's settings, an empty temporary folder and a minimal environment. For search, image scanning and Organize it also has no tools and no MCP, so all it can do is reply. Filling a note is the exception, below.
- **Codex** gets the person's connected apps (Notion, Figma, Supabase and others), a shell, browsers, plugins and subagents by default, even with their settings ignored. Every run turns these off with `-c features.x=false` (`CODEX_OFF`), and checked: its tool list then has no apps and no shell. It's `-c` and not `--disable`, because `--disable` stops the run on a name it doesn't know, so if an update renames one that one comes back on. It also runs in a read-only sandbox, skips the person's config and gets the same folder and environment. Search and image scanning also have web search and `view_image` off.
- **Both:** only IDs that were sent, with valid scores, are accepted.
- **Filling a note:** this is the one run that reads post text with tools on, so those tools are kept small: read tools tied to that one post, and the web. No library, no files, no commands and no write tools. It only returns text, and the app adds it to the note. A misleading post could still put bad text in that note, or send that post's details to a website.
- **Organize:** the model that plans never sees a post, and the models that read posts can only score IDs. So text in a post can't get a topic deleted or renamed. It could only get itself added to a topic.
- **MiniLM's files:** only the listed files are served, and only its background worker may run WebAssembly (`wasm-unsafe-eval` is on that response alone).
- **Installs:** the official commands are fixed in the code and run only when clicked.

Before a public release, check that Anthropic's and OpenAI's terms allow an app to run their tools under a person's own sign-in.

## How it looks

The AI parts share one look: a soft colour wash with a thin colour edge (`--ai-glass`, `--ai-edge`) and an orange-red sparkle. That covers the Organize button and box, and the note's AI button and box. Notes stay yellow in dark mode, so the note's box keeps its light version there.

## Where the code is

| What | File | Anchor |
|---|---|---|
| AI tools, prompts, batches, settling, image check | `server/ai-search.mjs` | `export function aiSearch` |
| First-launch install | `public/app.js` | `function installMiniLM` |
| Starting and following an AI search | `public/app.js` | `async function startAiSearch` |
| The button under the search bar | `public/app.js` | `function paintSearchHint` |
| Progress card | `public/app.js` | `function paintAiProgress` |
| AI rows in Settings, install and sign-in | `public/app.js` | `function mountAiSearchSettings` |
| Scan button | `public/app.js` | `async function scanImage` |
| MiniLM download | `server/meaning-search.mjs` | `export function meaningSearch` |
| MiniLM scoring and ranking | `public/meaning-worker.js` | `async function rank` |
| Splitting text into parts | `public/meaning-search.js` | `export function meaningParts` |
| Result order | `public/filters.js` | `const likelihood` |
| Filling a note: the job | `server/note-ai.mjs` | `export function noteAi` |
| Its tools for one post | `server/mcp.mjs` | `function noteServer` |
| Its prompt and tool arguments | `server/ai-search.mjs` | `export function noteArguments` |
| Its button and box | `public/app.js` | `function noteFoot` |
| Organize: planning and applying | `server/ai-organize.mjs` | `export function aiOrganize` |
| Organize: button and box | `public/organize.js` | `export function organizeTopics` |
| Clearing descriptions over MCP | `server/mcp.mjs` | `register('clear_image_descriptions'` |
| The shared AI look | `public/styles.css` | `--ai-glass` |

## Not proven yet

- MiniLM's 0.40 cut-off comes from one library, and its memory use has only been read once, in the desktop app.
- Install and Sign in have only had automated tests with stand-ins here, plus the user's own use. Codex is less tested than Claude Code.
- Nothing has run in the packaged Mac or Windows apps. Windows only detects `claude.exe`, and Codex has no Windows install path.
- Filling a note has run on the user's real posts with Claude Code. Video frames and carousels through it aren't confirmed on either tool, and the models above Haiku aren't confirmed.
- The new image description wording and the note wording (statements, not replies) have only been tried on a few posts.

## Ideas for later

- Model settings per task: search, image scan.
- Choosing a tier rather than a pinned model, using `haiku` and `codex debug models`, with the pinned model as a fallback, and never moving up a tier silently.
- Remembering repeated searches on an unchanged library.
- Speech-to-text, since nothing here hears video.
