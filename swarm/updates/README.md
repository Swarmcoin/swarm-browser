# The SWARM Browser update channel

Chromium has no updater of its own and ships security fixes about weekly, so a
SWARM Browser that cannot tell its user about a new version becomes a
liability. v0 of the update channel does exactly one thing about that:

> **Once a day the browser reads one signed file from swarm.green and, when it
> names a newer SWARM Browser, says so and shows the download link and the
> SHA-256 to compare. Nothing is downloaded silently and nothing installs
> itself.**

The browser side is the bundled component extension **SWARM Update**
(`swarm/extensions/update`, id `locbhnoahhmjhcjpndjmnfmnfekhdode`). This folder
holds the tools that make, sign and check the file it reads.

| Tool | What it does |
| --- | --- |
| `gen-key.mjs` | makes an Ed25519 key pair; the private key goes to a path **outside every git repository**, only the public key is printed, and `--write-extension-key` puts it into `swarm/extensions/update/lib/feed-key.js` |
| `make-feed.mjs` | writes the payload (versions, download links, sizes, SHA-256) from arguments or a small JSON file, hashing the release files itself |
| `sign-feed.mjs` | signs the payload and writes the envelope that goes on the website |
| `verify-feed.mjs` | runs the browser's own check on a file or on the live address |

All four use the extension's own rules (`swarm/extensions/update/lib/feed.js`),
so a feed the tools accept is a feed the browser accepts. Node 22 or newer.

## The feed, format 1

One static file, `https://swarm.green/browser/updates.json`:

```json
{
  "format": 1,
  "payload": "<base64 of the payload bytes>",
  "signature": "<base64 Ed25519 signature over exactly those bytes>"
}
```

The payload, once decoded:

```json
{
  "product": "swarm-browser",
  "published": "2026-10-02T18:00:00Z",
  "targets": {
    "windows-x64": {
      "chromium": "153.0.8010.60",
      "swarm": "2",
      "installer": { "url": "https://github.com/Swarm-Official/swarm-releases/releases/download/<tag>/SWARM-Browser-153.0.8010.60-2-win-x64.exe", "sha256": "<64 hex>", "size": 157286400 },
      "portable":  { "url": "https://github.com/Swarm-Official/swarm-releases/releases/download/<tag>/SWARM-Browser-153.0.8010.60-2-win-x64.zip", "sha256": "<64 hex>", "size": 167772160 },
      "notes": "https://github.com/Swarm-Official/swarm-releases/releases/tag/<tag>"
    }
  }
}
```

What the browser does with it, in this order (`checkFeed()` in `lib/feed.js`):

1. Refuses anything over 64 KiB, anything that is not this envelope, and any
   `format` other than the number 1.
2. Refuses a feed with no signature (`unsigned`).
3. Verifies the Ed25519 signature over the exact payload bytes against the
   public key(s) in `lib/feed-key.js`, with WebCrypto. Nothing in the payload
   is read before this succeeds (`bad_signature` otherwise).
4. Checks every field: `product` is `swarm-browser`; `published` is a UTC time
   like `2026-10-02T18:00:00Z`; versions look like `153.0.8010.60` and `"2"`;
   hashes are 64 lowercase hex digits; sizes are whole bytes; every link is
   `https://` and starts with `https://github.com/Swarm-Official/` or
   `https://swarm.green/` (a second lock: holding the feed key alone is not
   enough to send people elsewhere).
5. **No rollback:** refuses a feed whose `published` is earlier than the last
   one it accepted.
6. **No downgrade:** refuses a feed that offers an older build than the one
   running. Builds are ordered by the Chromium version, part by part as
   numbers, then by the SWARM revision (`swarm/revision.txt`).
7. The same build as the running one is "You are on the latest version"; a
   newer one is the offer. A feed with no entry for this system
   (`windows-x64` for the x64 Windows build) is accepted and offers nothing.

The running build comes from `swarm/extensions/update/version.json`. The
committed file is the placeholder `{"chromium":"0.0.0.0","swarm":"0","channel":"dev"}`;
`swarm/install_swarm_assets.py` stamps the copy that goes into the Chromium
tree with `ungoogled-chromium/chromium_version.txt`, `swarm/revision.txt` and
channel `release`. Only a `dev` copy may be pointed at another address
(`feedUrl` in `chrome.storage.local`, used by the smoke test), and only at
another plain `https://swarm.green/...` path; a release build always asks the
one fixed address.

## What the browser sends, and what it never does

One `GET https://swarm.green/browser/updates.json` a day (the first a few
minutes after the browser first starts; "Check now" in the popup asks at once).
No cookies, no query string, no referrer, no cache (so no ETag either), and
`Accept-Language: *` instead of the person's languages. The smoke test records
what arrives: `accept`, `accept-language: *`, `accept-encoding`, `user-agent`,
`sec-fetch-*`, `cache-control`/`pragma` and nothing else - no Cookie, Referer
or Origin. The website, like any website, sees the internet address the
request comes from.

The extension has no `downloads` permission and fetches nothing but this file
and its own `version.json`. The download is an ordinary link the person clicks.
Permissions: `alarms`, `notifications`, `storage`; host permission and CSP
`connect-src`: `https://swarm.green` only.

## The keys

### The development key (what is baked in today)

| | |
| --- | --- |
| Private key | `D:/swarm-work/keys/update-feed-dev.pem` on the build PC, outside every repository |
| Label | `dev-2026-09-27` |
| Public key | in `swarm/extensions/update/lib/feed-key.js` |

**It is for testing only.** It was made by an agent on the build PC and sits
there unencrypted; anyone with that file can sign a feed every SWARM Browser
built from this tree will believe. `install_swarm_assets.py` prints a
`WARNING` on every build while a `dev` key is trusted, and `sign-feed.mjs`
says so when it signs with one.

### The production key (the owner, before any public release)

On the owner's own machine, ideally one that is offline or at least not the
build PC, with the private key going to storage that is backed up and never
uploaded (an encrypted USB stick, for example):

```
node swarm/updates/gen-key.mjs --out E:/swarm-feed/update-feed-release.pem --label release-2026-10 --write-extension-key
```

Then commit the one changed file, `swarm/extensions/update/lib/feed-key.js`
(public key only), and build. The dev key is no longer trusted by that build.

Worth doing at the same time: a second, **backup** key kept offline somewhere
else, trusted by the same build:

```
node swarm/updates/gen-key.mjs --out F:/swarm-feed-backup/update-feed-backup.pem --label backup-2026-10 --add-extension-key
```

Why it matters: a browser only believes keys it was built with. If the only
production key is lost, every SWARM Browser already installed can never be
told about an update again; people would have to find the new version on the
website themselves. To replace a key, first ship a build that trusts both the
old and the new key, then sign with the new one.

## Publishing a release

1. CI builds `SWARM-Browser-<chromium>-<swarm>-win-x64.exe` and `.zip`; they
   are published as a release on `Swarm-Official/swarm-releases`. `swarm/revision.txt`
   must be higher than in the last release when the Chromium version is the same,
   or browsers will not see anything newer.
2. Write the payload from the exact files that were uploaded:

   ```
   node swarm/updates/make-feed.mjs --out payload.json --chromium 153.0.8010.60 --swarm 2 \
     --installer-url https://github.com/Swarm-Official/swarm-releases/releases/download/<tag>/SWARM-Browser-153.0.8010.60-2-win-x64.exe \
     --installer-file <that .exe> \
     --portable-url https://github.com/Swarm-Official/swarm-releases/releases/download/<tag>/SWARM-Browser-153.0.8010.60-2-win-x64.zip \
     --portable-file <that .zip> \
     --notes https://github.com/Swarm-Official/swarm-releases/releases/tag/<tag>
   ```

   `published` defaults to now. A time more than ten minutes ahead of the
   clock is refused: a feed from the future would make every browser refuse
   every honest feed published before that time.
3. Sign it: `node swarm/updates/sign-feed.mjs --key <production .pem> --payload payload.json --out updates.json`
4. Check it as a browser on the previous version would:
   `node swarm/updates/verify-feed.mjs updates.json --running 153.0.8010.52+1` must say `ACCEPTED ... -> offer`.

### What the website needs

One static file, and nothing else changes: `updates.json` from step 3,
committed as **`browser/updates.json`** at the root of the website repository
(`Swarm-Official/swarm.green`, a static site on Vercel), so that it is served
at `https://swarm.green/browser/updates.json`. No `vercel.json` change is
needed: static files are already served with `max-age=0, must-revalidate`, and
the site's security headers do not affect an extension's request. The site
rule is **additions only**, and **the owner deploys**. Until the file exists
the browser shows "SWARM has not published an update list yet." (the address
answers 404 today).

After the deploy, check the live file exactly as the browser fetches it:

```
node swarm/updates/verify-feed.mjs https://swarm.green/browser/updates.json --running 153.0.8010.52+1
```

Each later release replaces that one file with a newly signed one.

## Tests

```
node --test "swarm/tests/update/*.test.mjs"
```

99 tests, no network (fetch and the socket functions throw in every test
process, the CLI tests included): strict base64 and envelope parsing, payload
rules, version order, signatures with throwaway keys (tampered, unsigned,
foreign-key, re-serialised), downgrade and rollback refusals, the exact
request, the stored state, the schedule and the snooze, the shipped manifest
and files, the four tools end to end, and `install_swarm_assets.py` stamping
`version.json` in a stand-in tree.

The browser smoke test, by hand:

```
node swarm/tests/update/smoke-edge.mjs
```

It runs Microsoft Edge with a disposable profile and `--load-extension`,
serves signed feeds from a local HTTPS server mapped to swarm.green, and
checks 34 things from the tampered feed to the release copy ignoring a custom
address; screenshots and a JSON report go to `D:/swarm-work/smoke/05-update-*`.
`SMOKE_BROWSER=<chrome.exe>` runs the same on another Chromium (it passed on
ungoogled-chromium 153.0.8010.52 too).

## Known limits of v0

* **A frozen feed.** Someone who can block the request, or keep answering
  with the last genuine feed, can keep a browser from hearing about a newer
  version. They cannot make it accept an older or altered one. The popup shows
  when the last check ran; a later format could add an expiry time.
* **Notifications are best effort.** Windows may hold them back (Focus assist,
  notification settings). The toolbar badge and the popup show the offer
  regardless.
* **Everyone gets the same answer at once.** No staged roll-out.
* **The installer is not code-signed yet**, so Windows SmartScreen warns when
  it is run. That is a separate open item (code signing, N-9).
