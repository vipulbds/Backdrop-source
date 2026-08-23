# Ready-to-paste Custom Pixels — one per store

**Generated files. Do not edit these by hand.** Edit `../../bds-pixel.js` and regenerate:

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('bds-pixel.js','utf8');
['USA','UK','CA','AU','NZ','IN','UAE','FR','ES','DE'].forEach(cc=>
fs.writeFileSync('_dist/pixels/bds-pixel-'+cc+'.js', s.replace(\"var COUNTRY = 'USA';\", \"var COUNTRY = '\"+cc+\"';\")));"
```

Each file is the full pixel with `COUNTRY` already set and `XB_URL` already pointing at the
cross-border web app. Nothing to edit — copy the whole file and paste.

## Where each one goes

Shopify admin → **Settings → Customer events → Add custom pixel** → name it
`BackdropSource Tracking` → paste → **Save** → **Connect**.

| File | Store |
|---|---|
| `bds-pixel-USA.js` | backdropsource.com |
| `bds-pixel-UK.js`  | backdropsource.co.uk |
| `bds-pixel-CA.js`  | backdropsource.ca |
| `bds-pixel-AU.js`  | backdropsource.com.au |
| `bds-pixel-NZ.js`  | backdropsource.co.nz |
| `bds-pixel-IN.js`  | India store |
| `bds-pixel-UAE.js` | UAE store |
| `bds-pixel-FR.js`  | France store |
| `bds-pixel-ES.js`  | Spain store |
| `bds-pixel-DE.js`  | Germany store |

⚠️ If a store **already has** a "BackdropSource Tracking" pixel, replace the code inside that one.
Adding a second pixel makes every order log twice.
CA also runs an Irexona affiliate pixel — leave that one alone.
